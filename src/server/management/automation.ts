import type { PlayerSummary, ServerStatus } from "../../shared/types.js";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { closeSync, openSync, readSync, realpathSync, statSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { GuestApproval } from "../../shared/management.js";
import { DiagnosticError, diagnostic } from "../../shared/diagnostic-messages.js";
import { stripLegacy } from "../../shared/mctext.js";
import { tx } from "../db/db.js";
import { Management, hash } from "./service.js";

const DEATH_WORDS: string[] = ["was slain", "was shot", "was killed", "was blown up", "blew up", "was fireballed", "was pummeled", "was impaled", "was skewered", "was stung", "was squashed", "was squished", "was poked", "was pricked", "was struck by lightning", "was obliterated", "was doomed", "was roasted", "was frozen", "was burned", "was smashed", "was spitballed", "was killed by", "drowned", "died", "fell ", "hit the ground", "burned to death", "went up in flames", "walked into", "tried to swim in lava", "discovered the floor was lava", "froze to death", "starved to death", "suffocated", "experienced kinetic energy", "withered away", "went off with a bang", "didn't want to live", "left the confines of this world", "fell out of the world", "was impaled on", "was speared", "was sniped"];
const NAME = /^[A-Za-z0-9_]{1,16}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function offlineUuid(name: string): string {
  if (!NAME.test(name)) throw new DiagnosticError("managementInvalid");
  const bytes = createHash("md5").update(`OfflinePlayer:${name}`).digest();
  bytes[6] = (bytes[6]! & 15) | 48; bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export interface RankGroup {
  name: string; display: string; weight: number; hours?: number; color?: string; prefix?: string;
  parent?: string; permissions?: string[]; meta?: Record<string, string>; unlock?: string;
}
export interface AutomationRules {
  version: 1; identityMode: "offline-authme" | "online"; admins: string[];
  ranks: { group: RankGroup[]; track?: { name: string; groups: string[] } };
  inviteOnly: boolean; notifications: boolean; digestHour: number; timezone: string; serverName: string;
  chatStats: boolean; personalSkins: boolean; welcomeMessages: boolean;
  notifyGameEvents: boolean; tpsAlert: number; alertCooldownMinutes: number;
}
export interface StewardImport { version: 1; rules: AutomationRules; state: Record<string, unknown> }
export function validateImport(input: unknown): StewardImport {
  if (!input || typeof input !== "object") throw new DiagnosticError("managementInvalid");
  const bundle = input as StewardImport; const r = bundle.rules;
  if (bundle.version !== 1 || !r || r.version !== 1 || !["offline-authme", "online"].includes(r.identityMode)
    || !Array.isArray(r.admins) || r.admins.some(n => typeof n !== "string" || !NAME.test(n))
    || !r.ranks || !Array.isArray(r.ranks.group) || r.ranks.group.length > 100
    || !Number.isInteger(r.digestHour) || r.digestHour < 0 || r.digestHour > 23
    || typeof r.timezone !== "string" || typeof r.serverName !== "string" || r.serverName.length > 100
    || [r.inviteOnly, r.notifications, r.chatStats, r.personalSkins, r.welcomeMessages, r.notifyGameEvents].some(v => typeof v !== "boolean")
    || !Number.isFinite(r.tpsAlert) || r.tpsAlert < 0 || r.tpsAlert > 20
    || !Number.isInteger(r.alertCooldownMinutes) || r.alertCooldownMinutes < 1 || r.alertCooldownMinutes > 10080
    || !bundle.state || typeof bundle.state !== "object" || Array.isArray(bundle.state)) throw new DiagnosticError("managementInvalid");
  try { new Intl.DateTimeFormat("en", { timeZone: r.timezone }).format(); } catch { throw new DiagnosticError("managementInvalid"); }
  const identifier = (s: unknown) => typeof s === "string" && /^[a-zA-Z0-9_.-]{1,100}$/.test(s);
  const text = (s: unknown) => typeof s === "string" && s.length <= 1000 && !/[\r\n\x00]/.test(s);
  for (const g of r.ranks.group) {
    if (!g || !identifier(g.name) || !text(g.display) || !Number.isInteger(g.weight) || g.weight < 0 || g.weight > 100000
      || (g.hours !== undefined && (!Number.isFinite(g.hours) || g.hours < 0))
      || (g.parent !== undefined && !identifier(g.parent)) || [g.prefix, g.color, g.unlock].some(v => v !== undefined && !text(v))
      || (g.permissions !== undefined && (!Array.isArray(g.permissions) || g.permissions.length > 1000 || g.permissions.some(p => !/^-?[a-zA-Z0-9_.*-]{1,200}$/.test(p))))
      || Object.entries(g.meta || {}).some(([k,v]) => !identifier(k) || !text(v))) throw new DiagnosticError("managementInvalid");
  }
  if (new Set(r.ranks.group.map(g => g.name)).size !== r.ranks.group.length) throw new DiagnosticError("managementInvalid");
  if (r.ranks.track && (!identifier(r.ranks.track.name) || !Array.isArray(r.ranks.track.groups) || r.ranks.track.groups.some(n => !r.ranks.group.some(g => g.name === n)))) throw new DiagnosticError("managementInvalid");
  return bundle;
}

export class Automation {
  private busy = false;
  private timer?: NodeJS.Timeout;
  private work?: Promise<void>;
  private authenticated = new Set<string>();
  private registered = new Set<string>();
  private livePlayers: PlayerSummary[] = [];
  private lowTpsSince: number | null = null;
  private authRecovered = false;
  private bans: {mtime:number;size:number;entries:{uuid?:string;name?:string}[]}|null=null;
  constructor(readonly management: Management, private readonly command: (command: string) => Promise<string>,
    private readonly audit: (label: string, ok: boolean, output: string, actor?: string) => void) {}
  private get db() { return this.management.repo.db; }
  rules(): AutomationRules | null { return this.management.get("automation.rules", null); }
  preview(): { digest: string; bundle: StewardImport; imported: boolean } {
    const raw = readFileSync(this.management.config.automationFile, "utf8");
    if (raw.length > 8_000_000) throw new DiagnosticError("managementInvalid");
    const bundle = validateImport(JSON.parse(raw)); const digest = hash(raw);
    return { digest, bundle, imported: this.management.get("import.digest", "") === digest };
  }
  import(digest: unknown, actor: string): void {
    const preview = this.preview();
    if (digest !== preview.digest) throw new DiagnosticError("managementInvalid");
    if (preview.imported) return;
    if (this.management.get("import.digest", "")) throw new DiagnosticError("managementInvalid");
    const { state, rules } = preview.bundle;
    tx(this.db, () => {
      this.management.set("automation.rules", rules);
      const maintenance=state.legacy_maintenance as {reason?:unknown}|undefined;
      if(maintenance){
        if(typeof maintenance.reason!=="string" || !maintenance.reason.trim() || maintenance.reason.length>200)throw new DiagnosticError("managementInvalid");
        this.db.prepare("INSERT OR IGNORE INTO maintenance_holds VALUES (?,?,?,?)").run("import:maintenance","manual",maintenance.reason,this.management.now());
        this.management.set("revision",this.management.revision()+1);
      }
      this.management.set("steward.import", state); // preserved verbatim; never executed as commands
      this.management.set("ranks.awarded", state.ranks || {});
      this.management.set("ranks.initialized", !!state.ranks_initialized);
      this.management.set("ranks.appliedHash", state.ranks_hash || "");
      this.management.set("digest.last", state.last_digest || "");
      this.management.set("whitelist.seeded", !!state.whitelist_seeded);
      for (const [name, requested] of Object.entries((state.invites || {}) as Record<string, unknown>)) {
        if (!NAME.test(name) || typeof requested !== "number") throw new DiagnosticError("managementInvalid");
        // Keep unresolved legacy requests; do not assume lowercase names are valid offline identities.
        this.db.prepare("INSERT OR IGNORE INTO guest_approvals VALUES (?,?,?,NULL,'requested',NULL)").run(name, "", requested * 1000);
      }
      const pregen = state.pregen as Record<string, string> | undefined;
      for (const w of this.management.config.worlds) {
        if (pregen?.[w.world]) this.management.set(`import.pregen:${w.world}`, { claimed: pregen[w.world], verified: false });
      }
      this.management.set("import.digest", preview.digest);
      this.management.set("import.at", this.management.now());
    });
    this.audit("Steward state imported", true, preview.digest, actor);
  }
  approvals(): GuestApproval[] {
    const rows=this.db.prepare("SELECT name,uuid,requested_at AS requestedAt,approved_by AS approvedBy,state,error FROM guest_approvals ORDER BY requested_at DESC LIMIT 500").all() as unknown as GuestApproval[];
    return rows.map(row=>({...row,...(row.error?{errorData:diagnostic("managementUnavailable")}:{} )}));
  }
  private safePath(relative: string): string {
    if (!this.management.config.worldData) throw new DiagnosticError("managementUnavailable");
    const root = realpathSync(this.management.config.worldData);
    const file = realpathSync(path.join(root, relative));
    if (!file.startsWith(root + path.sep)) throw new DiagnosticError("managementInvalid");
    return file;
  }
  readJson<T>(relative: string): T {
    const file = this.safePath(relative);
    if (statSync(file).size > 16_000_000) throw new DiagnosticError("managementInvalid");
    return JSON.parse(readFileSync(file, "utf8")) as T;
  }
  identity(name: string): string {
    if (!NAME.test(name)) throw new DiagnosticError("managementInvalid");
    if (this.rules()?.identityMode === "offline-authme") return offlineUuid(name);
    const cache = this.readJson<{ name: string; uuid: string }[]>("usercache.json");
    const entry = cache.find(p => p.name === name && UUID.test(p.uuid));
    if (!entry) throw new DiagnosticError("managementInvalid");
    return entry.uuid;
  }
  request(name: string): void {
    if (!this.rules()?.inviteOnly || !NAME.test(name)) return;
    const previous = this.approvals().find(a => a.name.toLowerCase() === name.toLowerCase());
    if (previous && previous.state !== "rejected") return;
    let uuid = ""; try { uuid = this.identity(name); } catch { /* resolve explicitly before approval */ }
    this.db.prepare("INSERT INTO guest_approvals VALUES (?,?,?,NULL,'requested',NULL) ON CONFLICT(name) DO UPDATE SET name=excluded.name,uuid=excluded.uuid,requested_at=excluded.requested_at,state='requested',error=NULL").run(name, uuid, this.management.now());
    this.event("invite", name);
    this.notify(`invite:${name}:${this.management.now()}`, `${name} wants to join`, "Operator approval required.", "/#/world/management");
  }
  approve(name: unknown, approved: unknown, actor: string): void {
    if (typeof name !== "string" || !NAME.test(name) || typeof approved !== "boolean") throw new DiagnosticError("managementInvalid");
    const entry = this.approvals().find(a => a.name.toLowerCase() === name.toLowerCase());
    if (!entry || entry.state === "applied") throw new DiagnosticError("managementInvalid");
    const uuid = approved ? this.identity(name) : entry.uuid;
    this.db.prepare("UPDATE guest_approvals SET name=?,uuid=?,approved_by=?,state=?,error=NULL WHERE name=?").run(name, uuid, actor, approved ? "pending" : "rejected", entry.name);
    this.audit(approved ? "Guest approved, pending application" : "Guest rejected", true, name, actor);
  }
  private async applyGuest(name: string, uuid: string): Promise<void> {
    await this.command(`minecraft:whitelist add ${name}`);
    const list = this.readJson<{ name: string; uuid: string }[]>("whitelist.json");
    if (!list.some(p => p.name === name && p.uuid === uuid)) throw new DiagnosticError("managementUnavailable");
  }
  private async applyApprovals(): Promise<void> {
    for (const a of this.approvals().filter(a => a.state === "pending")) {
      try {
        if (this.identity(a.name) !== a.uuid) throw new DiagnosticError("managementInvalid");
        await this.applyGuest(a.name, a.uuid);
        this.db.prepare("UPDATE guest_approvals SET state='applied',error=NULL WHERE name=? AND state='pending'").run(a.name);
        this.audit("Guest whitelist application verified", true, a.name, a.approvedBy || undefined);
        this.event("invite_ok", a.name);
      } catch (e) {
        this.db.prepare("UPDATE guest_approvals SET error=? WHERE name=?").run((e as Error).message, a.name);
      }
    }
  }
  private async seedGuests(): Promise<void> {
    const rules = this.rules(); if (!rules?.inviteOnly) return;
    for (const name of rules.admins) await this.applyGuest(name, this.identity(name));
    if (!this.management.get("whitelist.seeded", false)) {
      const cache = this.readJson<{ name: string }[]>("usercache.json");
      for (const p of cache) if (NAME.test(p.name)) await this.applyGuest(p.name, this.identity(p.name));
      this.management.set("whitelist.seeded", true);
    }
  }
  lifecycleObserved(state: string): void {
    if(!this.rules())return;
    if(state==="running")this.event("start","world ready");
    if(state==="sleeping")this.event("stop","intentional sleep");
    if(state==="failed"){
      this.event("crash","lifecycle failure");
      this.notify(`lifecycle:${this.management.now()}`,"Minecraft lifecycle failure","Check the dashboard for startup or process failure details.","/#/world/management");
    }
  }
  private event(kind: string, text: string): void {
    this.db.prepare("INSERT INTO automation_events(at,kind,text) VALUES (?,?,?)").run(this.management.now(), kind, text.slice(0, 1000));
  }
  private notify(id: string, title: string, message: string, link = ""): void {
    if (!this.rules()?.notifications || !this.management.config.ntfyUrl) return;
    const click = link && this.management.config.publicUrl ? new URL(link, this.management.config.publicUrl).href : undefined;
    this.db.prepare("INSERT OR IGNORE INTO notification_outbox(id,at,payload) VALUES (?,?,?)").run(id, this.management.now(), JSON.stringify({ title, message, ...(click ? { click } : {}) }));
  }
  observeServer(status: ServerStatus, players: PlayerSummary[]): void {
    this.livePlayers=players.filter(p=>p.online);
    const rules=this.rules(); if(!rules)return;
    if(!this.management.canPoll() || status.connection!=="connected" || status.degraded || status.paused || !status.lastUpdate || this.management.now()-status.lastUpdate>status.pollIntervalMs*3+2000)return;
    const previous=this.management.get<string[]|null>("monitor.players",null);
    const current=this.livePlayers.map(p=>p.uuid);
    if(previous) {
      for(const p of this.livePlayers.filter(p=>!previous.includes(p.uuid))) {
        this.event("join",p.name);this.notify(`join:${p.uuid}:${status.lastUpdate}`,`${p.name} joined`,`${current.length} online on ${rules.serverName}.`);
      }
      for(const uuid of previous.filter(uuid=>!current.includes(uuid))) {
        const p=players.find(p=>p.uuid===uuid);
        if(p){this.event("leave",p.name);this.notify(`leave:${uuid}:${status.lastUpdate}`,`${p.name} left`,`Played ${formatDuration((this.management.repo.sessionsFor(uuid,1)[0]?.end??this.management.now())-(this.management.repo.sessionsFor(uuid,1)[0]?.start??this.management.now()))}. ${current.length} online.`);}
      }
    }
    this.management.set("monitor.players",current);
    const tps=status.perf?.tps?.[0];
    if(tps!==undefined && current.length && tps<rules.tpsAlert) {
      this.lowTpsSince??=this.management.now();
      if(this.management.now()-this.lowTpsSince>=120000)this.alert("tps",`${rules.serverName}: Low TPS`,`TPS ${tps.toFixed(1)} for 2+ minutes with ${current.length} online.`);
    } else this.lowTpsSince=null;
    if(status.perf && this.management.get("monitor.perfAt",0)!==status.perf.at){
      this.management.set("monitor.perfAt",status.perf.at);
      this.event("tps",String(tps??"unknown"));
    }
  }
  private alert(key:string,title:string,text:string):void {
    const previous=this.management.get(`alert:${key}`,0);
    if(this.management.now()-previous<(this.rules()?.alertCooldownMinutes||30)*60000)return;
    this.management.set(`alert:${key}`,this.management.now());this.event(key,text);this.notify(`alert:${key}:${this.management.now()}`,title,text);
  }
  private async deliver(): Promise<void> {
    if (!this.management.config.ntfyUrl) return;
    const rows = this.db.prepare("SELECT id,payload,attempts FROM notification_outbox WHERE delivered_at IS NULL AND attempts<10 ORDER BY at LIMIT 5").all() as { id: string; payload: string; attempts: number }[];
    for (const r of rows) {
      this.db.prepare("UPDATE notification_outbox SET attempts=attempts+1 WHERE id=?").run(r.id);
      const payload = JSON.parse(r.payload) as {title:string;message:string;click?:string};
      try {
        const url = new URL(this.management.config.ntfyUrl);
        const response = await fetch(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
          headers: { "Content-Type": "text/plain; charset=utf-8", "Title": payload.title.replace(/[^\x20-\x7e]/g, "?"),
            ...(payload.click ? { Click: payload.click } : {}), ...(this.management.config.ntfyToken ? { Authorization: `Bearer ${this.management.config.ntfyToken}` } : {}) }, body: payload.message });
        await response.body?.cancel();
        if (response.ok) this.db.prepare("UPDATE notification_outbox SET delivered_at=? WHERE id=?").run(this.management.now(), r.id);
      } catch { /* persistent attempts; never log destination credentials */ }
    }
  }
  private async ranks(): Promise<void> {
    const rules = this.rules(); if (!rules?.ranks.group.length) return;
    const awarded = this.management.get<Record<string, string>>("ranks.awarded", {});
    const quiet = !this.management.get("ranks.initialized", false);
    const tiers = rules.ranks.group.filter(g => g.hours !== undefined).sort((a,b) => a.hours! - b.hours!);
    let found = false;
    for (const folder of this.management.config.statsDirs.toReversed()) {
      let files: string[]; try { files = readdirSync(this.safePath(folder)); } catch { continue; }
      found = true;
      for (const file of files.filter(f => UUID.test(f.replace(/\.json$/, "")) && f.endsWith(".json"))) {
        const uuid = file.slice(0, -5);
        const data = this.readJson<{ stats?: { "minecraft:custom"?: { "minecraft:play_time"?: number } } }>(`${folder}/${file}`);
        const ticks = data.stats?.["minecraft:custom"]?.["minecraft:play_time"];
        if (typeof ticks !== "number" || !Number.isFinite(ticks) || ticks < 0) continue;
        const target = tiers.filter(g => ticks / 72000 >= g.hours!).at(-1);
        if (!target || tiers.findIndex(g => g.name === awarded[uuid]) >= tiers.indexOf(target)) continue;
        if (target.name !== "default") {
          await this.command(`lp user ${uuid} parent add ${target.name}`);
          for (const lower of tiers.slice(0, tiers.indexOf(target))) if (lower.name !== "default") await this.command(`lp user ${uuid} parent remove ${lower.name}`);
        }
        awarded[uuid] = target.name; this.management.set("ranks.awarded", awarded);
        if (!quiet && target.name !== "default") {
          const cache = this.readJson<{name:string;uuid:string}[]>("usercache.json");
          const name = cache.find(p => p.uuid === uuid)?.name || uuid;
          await this.command(`tellraw @a ${JSON.stringify([{text:"★ ",color:"gold"},{text:name,color:"yellow"},{text:" is now ",color:"gray"},{text:target.display,color:target.color || "aqua",bold:true},{text:` (${Math.floor(ticks / 72000)}h played)`,color:"dark_gray"}])}`);
          const online=this.livePlayers.find(p=>p.uuid===uuid);
          if(online)await this.showTitle(uuid,{text:target.display,color:target.color||"aqua",bold:true},{text:target.unlock||"New perks unlocked: /perks",color:"gray"},"minecraft:ui.toast.challenge_complete");
          this.event("rank", `${name} → ${target.display}`);
          this.notify(`rank:${uuid}:${target.name}`, `${name} ranked up: ${target.display}`, `${Math.floor(ticks/72000)}h played on ${rules.serverName}.`);
        }
      }
    }
    if (found) this.management.set("ranks.initialized", true);
  }
  async reconcilePermissions(confirmed: unknown, actor: string): Promise<void> {
    if (confirmed !== true) throw new DiagnosticError("managementConfirm");
    this.management.requireRunning();
    const r = this.rules(); if (!r) throw new DiagnosticError("managementUnavailable");
    // Same managed groups as Steward. Explicit action because clear replaces group metadata/permissions.
    for (const g of r.ranks.group) {
      if (g.name !== "default") await this.command(`lp creategroup ${g.name}`);
      await this.command(`lp group ${g.name} clear`);
      await this.command(`lp group ${g.name} setweight ${g.weight}`);
      await this.command(`lp group ${g.name} setdisplayname ${JSON.stringify(g.display)}`);
      if (g.parent) await this.command(`lp group ${g.name} parent add ${g.parent}`);
      if (g.prefix) await this.command(`lp group ${g.name} meta setprefix ${g.weight} ${JSON.stringify(g.prefix)}`);
      for (const [k,v] of Object.entries(g.meta || {})) await this.command(`lp group ${g.name} meta set ${k} ${JSON.stringify(v)}`);
      for (const p of g.permissions || []) await this.command(`lp group ${g.name} permission set ${p.replace(/^-/, "")} ${!p.startsWith("-")}`);
    }
    if (r.ranks.track) {
      await this.command(`lp createtrack ${r.ranks.track.name}`); await this.command(`lp track ${r.ranks.track.name} clear`);
      for (const g of r.ranks.track.groups) await this.command(`lp track ${r.ranks.track.name} append ${g}`);
    }
    this.audit("Managed rank permissions reconciled", true, "", actor);
  }
  async mapCode(name: string, reset = false): Promise<string> {
    const uuid = this.identity(name); const key = name.toLowerCase();
    if (!this.authenticated.has(key)) throw new DiagnosticError("mapCodeInvalid");
    const previous = this.db.prepare("SELECT generation FROM map_identities WHERE uuid=?").get(uuid) as {generation:number}|undefined;
    let secret=this.management.get<string>("map.secret", "");
    if(!secret){secret=randomBytes(32).toString("hex");this.management.set("map.secret",secret);}
    const generation=previous ? previous.generation+(reset?1:0) : 0;
    const code=createHmac("sha256",secret).update(`${uuid}:${generation}`).digest("hex").slice(0,16).toUpperCase();
    this.db.prepare("INSERT INTO map_identities(uuid,name,code_hash,generation) VALUES (?,?,?,?) ON CONFLICT(uuid) DO UPDATE SET code_hash=excluded.code_hash,generation=excluded.generation,enabled=1,name=excluded.name").run(uuid,name,hash(code),generation);
    if(reset)this.db.prepare("DELETE FROM map_sessions WHERE uuid=?").run(uuid);
    if (reset) this.event("mapreset", name);
    const mapUrl=this.management.repo.getSetting("bluemap.url");
    const parts:unknown[]=[{text:"Your map code: ",color:"gray"},{text:code,color:"gold",bold:true,click_event:{action:"copy_to_clipboard",value:code},hover_event:{action:"show_text",value:"Click to copy"}}];
    if(mapUrl){
      const link=new URL("/map-access",mapUrl);link.hash=`code=${code}`;
      parts.push({text:"  "},{text:"[open the map]",color:"aqua",underlined:true,click_event:{action:"open_url",value:link.href},hover_event:{action:"show_text",value:link.href}});
    }
    await this.command(`execute as ${uuid} run tellraw @s ${JSON.stringify(parts)}`);
    await this.command(`execute as ${uuid} run tellraw @s ${JSON.stringify([{text:"Personal, don't share it. Ο κωδικός σου, μην τον δώσεις σε άλλους. Leaked? /map reset",color:"dark_gray"}])}`);
    return code;
  }
  exchangeCode(raw: unknown): { token: string; seconds: number } {
    if (typeof raw !== "string" || !/^[A-Fa-f0-9]{16}$/.test(raw)) throw new DiagnosticError("mapCodeInvalid");
    const entry = this.db.prepare("SELECT uuid,name,generation,enabled FROM map_identities WHERE code_hash=?").get(hash(raw.toUpperCase())) as {uuid:string;name:string;generation:number;enabled:number}|undefined;
    if (!entry?.enabled || this.isBanned(entry.uuid, entry.name)) throw new DiagnosticError("mapCodeInvalid");
    const token = randomBytes(32).toString("base64url"); const seconds = this.management.config.mapDays*86400;
    this.db.prepare("INSERT INTO map_sessions VALUES (?,?,?,?)").run(hash(token),entry.uuid,entry.generation,this.management.now()+seconds*1000);
    this.event("map",entry.name); return {token,seconds};
  }
  private isBanned(uuid: string, name: string): boolean {
    try {
      const file=this.safePath("banned-players.json"),stat=statSync(file);
      if(!this.bans || this.bans.mtime!==stat.mtimeMs || this.bans.size!==stat.size){
        const entries=this.readJson<{uuid?:string;name?:string}[]>("banned-players.json");
        if(!Array.isArray(entries))return true;
        this.bans={mtime:stat.mtimeMs,size:stat.size,entries};
      }
      return this.bans.entries.some(p=>p.uuid===uuid || p.name?.toLowerCase()===name.toLowerCase());
    }
    catch { return true; } // fail closed; no wake or RCON dependency
  }
  mapAuthorized(token: string): boolean {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
    const row = this.db.prepare("SELECT i.uuid,i.name FROM map_sessions s JOIN map_identities i ON i.uuid=s.uuid AND i.generation=s.generation WHERE s.token_hash=? AND s.expires_at>? AND i.enabled=1").get(hash(token),this.management.now()) as {uuid:string;name:string}|undefined;
    return !!row && !this.isBanned(row.uuid,row.name);
  }
  private async login(name: string): Promise<void> {
    const rules = this.rules(); if (!rules || !NAME.test(name)) return;
    const uuid = this.identity(name); this.authenticated.add(name.toLowerCase());
    if (rules.admins.some(a => a.toLowerCase() === name.toLowerCase())) {
      const pending=this.management.get<Record<string,string>>("admins.pending",{});pending[uuid]=name;this.management.set("admins.pending",pending);
      await this.command(`lp user ${uuid} parent add admin`);
      delete pending[uuid];this.management.set("admins.pending",pending);
      this.audit("Authenticated game admin reconciled",true,name);
    }
    if (rules.personalSkins) {
      try {
        this.safePath(`plugins/SkinsRestorer/skins/${name.toLowerCase()}.customskin`);
        let exists = false; try { this.safePath(`plugins/SkinsRestorer/players/${uuid}.player`); exists=true; } catch(e) { if(!(e && typeof e==="object" && "code" in e && e.code==="ENOENT"))throw e; }
        if (!exists) await this.command(`skinsrestorer:skin set custom:${name.toLowerCase()} ${name}`);
      } catch { /* optional prepared skin absent */ }
    }
    if (rules.welcomeMessages) {
      const first=this.registered.delete(name.toLowerCase());
      const others=this.livePlayers.filter(p=>p.uuid!==uuid).length;
      const big=first?{text:`Welcome to ${rules.serverName}`,color:"gold",bold:true}:{text:`Welcome back, ${name}`,color:"aqua"};
      const small=first?{text:"/rules · /help · /map  —  Καλώς ήρθες!",color:"gray"}:{text:others?`${others} other${others!==1?"s":""} online`:"You're the first one here",color:"gray"};
      await this.showTitle(uuid,big,small,first?"minecraft:ui.toast.challenge_complete":"minecraft:block.note_block.chime");
      if(first)await this.command(`tellraw @a[name=!${name}] ${JSON.stringify([{text:"✦ ",color:"gold"},{text:name,color:"yellow"},{text:" joined for the first time — say hi!",color:"gray"}])}`);
    }
  }
  private async showTitle(uuid:string,big:unknown,small:unknown,sound:string):Promise<void>{
    for(const command of [`title @s times 10 70 20`,`title @s subtitle ${JSON.stringify(small)}`,`title @s title ${JSON.stringify(big)}`])await this.command(`execute as ${uuid} run ${command}`);
    await this.command(`execute as ${uuid} at @s run playsound ${sound} master @s ~ ~ ~ 0.6 1.2`);
  }

  async handleLine(line: string): Promise<void> {
    const m = /^\[\d\d:\d\d:\d\d\] \[([^/\]]+)\/(\w+)\]: (.*)$/.exec(stripLegacy(line));
    if (!m) return;
    const [,thread,level,body] = m as unknown as [string,string,string,string];
    const rules=this.rules(); if (!rules) return;
    if (thread === "Server thread" || /^(?:User Authenticator|Server Login Thread) #\d+$/.test(thread)) {
      const reject = /^Disconnecting ([A-Za-z0-9_]{1,16}) \(\/[^)]+\): .*?(?:invite-only|not whitelisted)/i.exec(body);
      if (reject) this.request(reject[1]!);
    }
    if ((thread === "Server thread" || /^Craft Scheduler Thread.*AuthMe$/.test(thread)) && body.startsWith("[AuthMe] ")) {
      if(rules.notifyGameEvents && /used the wrong password/.test(body)){
        this.event("authfail",body);this.notify(`authfail:${hash(line)}`,"Failed login",body.slice(0,300));
      }
      const auth = /^\[AuthMe\] ([A-Za-z0-9_]{1,16}) (logged in|registered)\b/.exec(body);
      if (auth?.[2] === "logged in") await this.login(auth[1]!);
      if (auth?.[2] === "registered") { this.registered.add(auth[1]!.toLowerCase());this.event("register",auth[1]!); }
    }
    if (thread === "Server thread") {
      const left = /^([A-Za-z0-9_]{1,16}) lost connection:/.exec(body);
      if (left) this.authenticated.delete(left[1]!.toLowerCase());
      const map = /^([A-Za-z0-9_]{1,16}) issued server command: \/map(?:\s+(reset))?\s*$/.exec(body);
      if (map && this.authenticated.has(map[1]!.toLowerCase())) await this.mapCode(map[1]!,map[2] === "reset");
      if (body.startsWith("[Chunky] ")) {
        for (const w of this.management.config.worlds) {
          if (parseFinished(body,w.world)) {
            const g=this.management.get<Record<string,unknown>>(`generation:${w.world}`,{});
            this.management.set(`generation:${w.world}`,{...w,...g,state:"completed",progress:100,completedAt:this.management.now(),observedAt:this.management.now(),completionSource:"trusted-log",raw:body,job:"none"});
            if (this.management.holds().some(h=>h.id===`chunky:${w.world}`)) this.management.release(`chunky:${w.world}`,"automation",true);
            this.event("pregen",w.world);
          }
        }
      }
      const gameBody=body.replace(/^System chat: /, "");
      const advancement=/^(\S+) has (made the advancement|completed the challenge|reached the goal) \[(.+)\]$/.exec(gameBody);
      if(rules.notifyGameEvents && advancement){
        const kind=advancement[2]==="made the advancement"?"Advancement":advancement[2]==="completed the challenge"?"Challenge":"Goal";
        this.event("advancement",gameBody);this.notify(`advancement:${hash(line)}`,`${advancement[1]}: ${advancement[3]}`,`${kind} on ${rules.serverName}.`);
      }
      const first=gameBody.split(" ")[0]||"";
      if(rules.notifyGameEvents && this.livePlayers.some(p=>p.name===first) && DEATH_WORDS.some(word=>gameBody.slice(first.length).includes(word))){
        this.event("death",gameBody);this.notify(`death:${hash(line)}`,`${first} died`,gameBody);
      }
      if(body.includes("Can't keep up!") && this.livePlayers.length)this.alert("lag","Server is lagging",body.slice(0,200));
    }
    if (rules.chatStats && thread.startsWith("Async Chat Thread")) {
      const chat = /^(?:\[Not Secure\] )?(.+?) » /.exec(body);
      const name = chat?.[1]?.split(/\s+/).at(-1)?.replace(/^~/, "");
      if (name && NAME.test(name) && this.authenticated.has(name.toLowerCase())) await this.command(`execute as ${this.identity(name)} run scoreboard players add @s chat_messages 1`);
    }
    if(body.startsWith("[Sonar] ")){
      if(/attack/i.test(body) && !/ended|stopped|over/i.test(body))this.alert("attack","Bot attack detected",body.slice(0,300));
      else if(/failed the bot check|was blacklisted/.test(body))this.event("botfail",body);
    }
    if (level === "ERROR" && /crash report|Encountered an unexpected exception|Exception in server tick loop/.test(body)) {
      this.event("crash",body);this.notify(`crash:${this.management.now()}`,`${rules.serverName} crashed`,body.slice(0,300));
    }
  }
  private async logs(): Promise<void> {
    const file=this.management.config.logFile;if(!file)return;
    const stat=statSync(file); const identity=`${stat.dev}:${stat.ino}`;
    let cursor=this.management.get<{identity:string;offset:number}|null>("log.cursor",null);
    if(!cursor || !this.authRecovered && this.livePlayers.length>0) {
      this.authRecovered=this.livePlayers.length>0;
      if(stat.size<=16_000_000){
        const recovered=new Set<string>();
        for(const line of readFileSync(file,"utf8").split("\n")){
          const match=/^\[\d\d:\d\d:\d\d\] \[(Server thread|Craft Scheduler Thread[^/]*AuthMe)\/INFO\]: \[AuthMe\] ([A-Za-z0-9_]{1,16}) logged in\b/.exec(stripLegacy(line));
          if(match)recovered.add(match[2]!.toLowerCase());
          const left=/^\[\d\d:\d\d:\d\d\] \[Server thread\/INFO\]: ([A-Za-z0-9_]{1,16}) lost connection:/.exec(stripLegacy(line));
          if(left)recovered.delete(left[1]!.toLowerCase());
        }
        for(const p of this.livePlayers)if(recovered.has(p.name.toLowerCase()))this.authenticated.add(p.name.toLowerCase());
      }
      if(!cursor){this.management.set("log.cursor",{identity,offset:stat.size});return;}
    }
    if(cursor.identity!==identity || cursor.offset>stat.size) cursor={identity,offset:0};
    const fd=openSync(file,"r");let content:Buffer;
    try { content=Buffer.alloc(Math.min(262144,stat.size-cursor.offset));const n=readSync(fd,content,0,content.length,cursor.offset);content=content.subarray(0,n); } finally {closeSync(fd);}
    const end=content.lastIndexOf(10); if(end<0)return;
    let offset=0;
    while(offset<=end){
      const newline=content.indexOf(10,offset);
      const line=content.subarray(offset,newline).toString("utf8");
      try { if(line)await this.handleLine(line); }
      catch(e){
        this.management.set("log.lastError",{error:diagnostic("managementUnavailable"),context:(e as Error).message,offset:cursor.offset+offset});
        this.audit("Automation log handler failed",false,`offset ${cursor.offset+offset}`);
      }
      offset=newline+1;
      this.management.set("log.cursor",{identity,offset:cursor.offset+offset});
    }

  }
  private digest(): void {
    const r=this.rules();if(!r)return;
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone:r.timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(this.management.now());
    const part=(key:string)=>parts.find(p=>p.type===key)?.value||"";
    const date=`${part("year")}-${part("month")}-${part("day")}`;
    if(Number(part("hour"))<r.digestHour || this.management.get("digest.last","")===date)return;
    const since=this.management.now()-86400000;
    const events=this.db.prepare("SELECT kind,COUNT(*) AS n FROM automation_events WHERE at>? GROUP BY kind").all(since) as {kind:string;n:number}[];
    // Merge retained Steward history with dashboard sessions without double-counting overlap.
    const now=this.management.now(),cutover=this.management.get("import.at",now);
    const history=this.management.get<Record<string,unknown>>("steward.import",{});
    const intervals=new Map<string,[number,number][]>();
    const add=(name:unknown,start:unknown,end:unknown)=>{
      if(typeof name!=="string" || typeof start!=="number" || typeof end!=="number" || !Number.isFinite(start) || !Number.isFinite(end))return;
      const left=Math.max(since,start),right=Math.min(now,end);if(right<=left)return;
      intervals.set(name,[...(intervals.get(name)||[]),[left,right]]);
    };
    const sessions=this.db.prepare('SELECT p.name,s.start,COALESCE(s."end",?) AS stop FROM sessions s JOIN players p ON p.uuid=s.uuid WHERE COALESCE(s."end",?)>?').all(now,now,since) as {name:string;start:number;stop:number}[];
    for(const row of sessions)add(row.name,row.start,row.stop);
    if(Array.isArray(history.sessions))for(const row of history.sessions){
      if(Array.isArray(row))add(row[0],typeof row[1]==="number"?row[1]*1000:null,Math.min(typeof row[2]==="number"?row[2]*1000:cutover,cutover));
    }
    const counts=new Map(events.filter(e=>e.kind!=="tps").map(e=>[e.kind,e.n]));
    if(Array.isArray(history.events))for(const event of history.events){
      if(Array.isArray(event) && typeof event[0]==="number" && event[0]*1000>since && event[0]*1000<=cutover && typeof event[1]==="string")counts.set(event[1],(counts.get(event[1])||0)+1);
    }
    const tps=(this.db.prepare("SELECT text FROM automation_events WHERE kind='tps' AND at>?").all(since) as {text:string}[]).map(row=>Number(row.text)).filter(Number.isFinite);
    if(Array.isArray(history.tps))for(const sample of history.tps)if(Array.isArray(sample)&&typeof sample[0]==="number"&&sample[0]*1000>since&&sample[0]*1000<=cutover&&typeof sample[1]==="number")tps.push(sample[1]);
    const lines=[...intervals].map(([name,spans])=>`${name}: ${formatDuration(mergedDuration(spans))}`);
    if(tps.length)lines.push(`TPS: avg ${(tps.reduce((sum,n)=>sum+n,0)/tps.length).toFixed(1)}, min ${Math.min(...tps).toFixed(1)}`);
    for(const [kind,n]of counts)lines.push(`${kind}: ${n}`);
    if(lines.length)this.notify(`digest:${date}`,`${r.serverName} daily digest`,lines.join("\n"));
    this.management.set("digest.last",date);
  }
  async tick(): Promise<void> {
    if(this.busy)return;this.busy=true;
    const errors:string[]=[];
    const attempt=async(task:()=>Promise<unknown>|unknown)=>{try{await task();}catch(e){errors.push((e as Error).message);}};
    try {
      const r=this.rules();
      if(r && this.management.canPoll() && (!this.management.config.enabled || this.management.status().state==="running")) {
        if(this.livePlayers.length && r.identityMode==="online")for(const p of this.livePlayers)if(NAME.test(p.name)&&!this.authenticated.has(p.name.toLowerCase()))await attempt(()=>this.login(p.name));
        await attempt(()=>this.logs());
        for(const [uuid,name]of Object.entries(this.management.get<Record<string,string>>("admins.pending",{}))){
          if(UUID.test(uuid)&&NAME.test(name)&&r.admins.some(a=>a.toLowerCase()===name.toLowerCase())&&this.authenticated.has(name.toLowerCase())&&this.livePlayers.some(p=>p.uuid===uuid))await attempt(()=>this.login(name));
        }
        await attempt(()=>this.applyApprovals());
        const last=this.management.get("automation.scanAt",0);
        if(this.management.now()-last>300000) {
          await attempt(()=>this.seedGuests());await attempt(()=>this.ranks());
          if(r.chatStats)await attempt(()=>this.command('scoreboard objectives add chat_messages dummy "Messages"'));
          if(!errors.length)this.management.set("automation.scanAt",this.management.now());
        }
        if(this.livePlayers.length && this.management.now()-this.management.get("monitor.memoryAt",0)>=60000){
          await attempt(async()=>{
            const raw=stripLegacy(await this.command("essentials:gc"));
            const num=(label:string)=>{const m=new RegExp(label+"[^:]*:\\s*([\\d,.]+)","i").exec(raw);return m?Number(m[1]!.replaceAll(",","")):null;};
            const max=num("Maximum memory"),allocated=num("Allocated memory"),free=num("Free memory");
            if(max && allocated!==null && free!==null && (allocated-free)/max>0.9){
              const since=this.management.get("monitor.memoryHighSince",this.management.now());this.management.set("monitor.memoryHighSince",since);
              if(this.management.now()-since>=120000)this.alert("memory","Memory almost full",`${(allocated-free).toFixed(0)} of ${max.toFixed(0)} MB heap in use.`);
            }else this.management.set("monitor.memoryHighSince",this.management.now());
            this.management.set("monitor.memoryAt",this.management.now());
          });
        }
      } else if(!this.management.canPoll()) {this.authenticated.clear();this.authRecovered=false;this.management.set("monitor.players",null);}
      await attempt(()=>this.digest());await attempt(()=>this.deliver());
      this.db.prepare("DELETE FROM map_sessions WHERE expires_at<?").run(this.management.now());
      this.db.prepare("DELETE FROM automation_events WHERE at<?").run(this.management.now()-7*86400000);
      this.db.prepare("DELETE FROM notification_outbox WHERE delivered_at IS NOT NULL AND delivered_at<?").run(this.management.now()-7*86400000);
      this.management.set("automation.error",errors.length?diagnostic("managementUnavailable"):null);
      this.management.set("automation.errorRaw",errors.join("\n"));
    } finally {this.busy=false;}
  }
  start(): void { this.timer=setInterval(()=>{if(!this.work)this.work=this.tick().catch(e=>{this.management.set("automation.error",diagnostic("managementUnavailable"));this.management.set("automation.errorRaw",(e as Error).message);}).finally(()=>{this.work=undefined;});},5000);this.timer.unref(); }
  async stop(): Promise<void> {if(this.timer)clearInterval(this.timer);await this.work;}
}
function parseFinished(body:string,world:string):boolean {return body.startsWith(`[Chunky] Task finished for ${world}.`);}

function formatDuration(ms:number):string{const minutes=Math.max(0,Math.floor(ms/60000));return minutes>=60?`${Math.floor(minutes/60)}h ${String(minutes%60).padStart(2,"0")}m`:`${minutes}m`;}

export function mergedDuration(spans:[number,number][]):number {
  const sorted=spans.toSorted((a,b)=>a[0]-b[0]);let total=0,end=-Infinity;
  for(const [left,right]of sorted){if(right>Math.max(left,end))total+=right-Math.max(left,end);end=Math.max(end,right);}return total;
}
