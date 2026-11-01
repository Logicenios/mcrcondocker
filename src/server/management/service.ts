import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { diagnostic, DiagnosticError } from "../../shared/diagnostic-messages.js";
import type { GenerationWorld, LifecycleObservation, MaintenanceHold, ManagementStatus } from "../../shared/management.js";
import { stripLegacy } from "../../shared/mctext.js";
import type { Repo } from "../db/repo.js";
import { tx } from "../db/db.js";
import { parseList } from "../parse/responses.js";

export interface ManagedWorld { world: string; dimension: string; radius?: number; x?: number; z?: number }
export interface ManagementConfig {
  enabled: boolean; token: string; observationSeconds: number; idleSeconds: number; startupSeconds: number;
  worlds: ManagedWorld[]; statsDirs: string[]; worldData: string; logFile: string; automationFile: string;
  ntfyUrl: string; ntfyToken: string; publicUrl: string; mapDays: number;
}
export function managementConfig(env: NodeJS.ProcessEnv): ManagementConfig {
  const number = (key: string, fallback: number, min = 1, max = 86400) => {
    const n = Number(env[key] || fallback);
    if (!Number.isInteger(n) || n < min || n > max) throw new DiagnosticError("configNumber", { field: key });
    return n;
  };
  const enabled = env.ON_DEMAND === "true";
  const token = env.MANAGEMENT_TOKEN_FILE ? readFileSync(env.MANAGEMENT_TOKEN_FILE, "utf8").trim() : "";
  if (enabled && token.length < 32) throw new DiagnosticError("configRequired", { field: "MANAGEMENT_TOKEN_FILE (32+ characters)" });
  const worlds: ManagedWorld[] = JSON.parse(env.MANAGEMENT_WORLDS || "[]");
  if (!Array.isArray(worlds) || worlds.length > 32 || new Set(worlds.map(w => w.world)).size !== worlds.length) throw new DiagnosticError("managementInvalid");
  for (const w of worlds) {
    if (!w || !/^[A-Za-z0-9_-]{1,80}$/.test(w.world) || !/^[a-z0-9_.-]+:[a-z0-9_/-]+$/.test(w.dimension)
      || (w.radius !== undefined && (!Number.isInteger(w.radius) || w.radius < 1 || w.radius > 1_000_000))
      || [w.x, w.z].some(n => n !== undefined && (!Number.isInteger(n) || Math.abs(n) > 30_000_000))) throw new DiagnosticError("managementInvalid");
  }
  const statsDirs: string[]=JSON.parse(env.PLAYER_STATS_DIRS || '["world/players/stats","world/stats"]');
  if(!Array.isArray(statsDirs)||statsDirs.length>32||statsDirs.some(p=>typeof p!=="string"||!p||pathUnsafe(p)))throw new DiagnosticError("managementInvalid");
  return { enabled, token, worlds, statsDirs, observationSeconds: number("LIFECYCLE_OBSERVATION_SECONDS", 45),
    idleSeconds: number("IDLE_SECONDS", 600, 60), startupSeconds: number("STARTUP_SECONDS", 600, 30),
    worldData: env.WORLD_DATA_DIR || "", logFile: env.SERVER_LOG_FILE || "", automationFile: env.AUTOMATION_FILE || "",
    ntfyUrl: env.NTFY_PUBLISH_URL || "", ntfyToken: env.NTFY_TOKEN_FILE ? readFileSync(env.NTFY_TOKEN_FILE, "utf8").trim() : "",
    publicUrl: env.DASHBOARD_PUBLIC_URL || "", mapDays: number("MAP_SESSION_DAYS", 30, 1, 365) };
}
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function secureEqual(a: string, b: string): boolean { return timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b))); }
export function parseChunky(raw: string, world: string): { state: "active" | "completed" | "unknown"; progress: number | null } {
  const text = stripLegacy(raw);
  // A no-task response, a rounded 100%, or another world's output is not completion.
  for (const line of text.split(/[\r\n]+/)) {
    const m = /Task (running|finished) for ([A-Za-z0-9_-]+)\. Processed: .*?\(([\d.]+)%\)/.exec(line);
    if (m?.[2] === world) {
      const n = Number(m[3]);
      if (Number.isFinite(n) && n >= 0 && n <= 100) return { state: m[1] === "finished" ? "completed" : "active", progress: n };
    }
  }
  return { state: "unknown", progress: null };
}

export class Management {
  private busy = false;
  connected: () => boolean = () => true;
  constructor(readonly repo: Repo, readonly config: ManagementConfig,
    private readonly command: (command: string) => Promise<string>,
    private readonly audit: (label: string, ok: boolean, output: string, actor?: string) => void,
    readonly now: () => number = Date.now) {}
  get<T>(key: string, fallback: T): T {
    const row = this.repo.db.prepare("SELECT value FROM management_state WHERE key=?").get(key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) as T : fallback;
  }
  set(key: string, value: unknown): void {
    this.repo.db.prepare("INSERT INTO management_state VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, JSON.stringify(value));
  }
  revision(): number { return this.get("revision", 0); }
  private bump(): void { this.set("revision", this.revision() + 1); }
  holds(): MaintenanceHold[] {
    return (this.repo.db.prepare("SELECT id,owner,reason,created_at AS createdAt FROM maintenance_holds ORDER BY created_at,id").all() as unknown as MaintenanceHold[]);
  }
  hold(reason: unknown, actor: string, id: string = randomUUID(), owner = "manual"): string {
    if (typeof reason !== "string" || !reason.trim() || reason.length > 200 || /[\x00-\x1f]/.test(reason)) throw new DiagnosticError("managementInvalid");
    tx(this.repo.db, () => {
      if (this.holds().length >= 100 && !this.holds().some(h => h.id === id)) throw new DiagnosticError("managementInvalid");
      this.repo.db.prepare("INSERT INTO maintenance_holds VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING").run(id, owner, reason.trim(), this.now());
      this.bump();
    });
    this.audit("Maintenance hold acquired", true, reason, actor);
    return id;
  }
  release(id: string, actor: string, job = false): void {
    const hold = this.holds().find(h => h.id === id);
    if (!hold || (!job && hold.owner !== "manual")) throw new DiagnosticError("managementInvalid");
    tx(this.repo.db, () => { this.repo.db.prepare("DELETE FROM maintenance_holds WHERE id=?").run(id); this.bump(); });
    this.audit("Maintenance hold released", true, hold.reason, actor);
  }
  observe(input: unknown): void {
    if (!this.config.enabled || !input || typeof input !== "object") throw new DiagnosticError("managementInvalid");
    const o = input as LifecycleObservation;
    const last = this.get<LifecycleObservation | null>("observation", null);
    if (o.version !== 1 || !["sleeping", "starting", "running", "stopping", "failed", "unknown"].includes(o.state)
      || typeof o.source !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(o.source)
      || !Number.isSafeInteger(o.sequence) || o.sequence < 0 || !Number.isSafeInteger(o.policyRevision) || o.policyRevision < 0 || o.policyRevision > this.revision()
      || !Number.isSafeInteger(o.observedAt) || Math.abs(this.now() - o.observedAt) > this.config.observationSeconds * 1000
      || !Number.isSafeInteger(o.phaseSince) || o.phaseSince > o.observedAt || o.phaseSince < 0
      || typeof o.intentionalSleep !== "boolean" || (o.state === "sleeping" && !o.intentionalSleep)
      || !(o.reason === null || typeof o.reason === "string" && o.reason.length <= 500)
      || (last && (o.source !== last.source || o.sequence <= last.sequence || o.observedAt < last.observedAt))) throw new DiagnosticError("managementInvalid");
    this.set("observation", o);
    if (o.state === "starting" && this.now()-o.phaseSince >= this.config.startupSeconds*1000 && this.get("timeout.phaseSince", -1)!==o.phaseSince) {
      this.set("timeout.phaseSince", o.phaseSince);
      this.audit("Minecraft startup timeout", false, "The process is not killed");
    }
    if (last?.state !== o.state) this.audit("Lifecycle observed", true, o.state);
  }
  status(): ManagementStatus {
    const o = this.get<LifecycleObservation | null>("observation", null);
    const fresh = !!o && this.now() - o.observedAt <= this.config.observationSeconds * 1000;
    const timedOut = fresh && o.state === "starting" && this.now() - o.phaseSince >= this.config.startupSeconds * 1000;
    return { enabled: this.config.enabled, state: !this.config.enabled || !fresh ? "unknown" : timedOut ? "failed" : o.state,
      observedAt: o?.observedAt ?? null, reason: fresh ? o.reason : null,
      errorData: this.config.enabled ? timedOut ? diagnostic("managementTimeout") : !fresh ? diagnostic("managementStale") : undefined : undefined,
      holds: this.holds(), revision: this.revision(), acknowledged: !this.config.enabled || fresh && o.policyRevision === this.revision(),
      idleSeconds: this.config.idleSeconds, startupSeconds: this.config.startupSeconds,
      worlds: this.config.worlds.map(w => this.generation(w)) };
  }
  canPoll(): boolean {
    if (!this.config.enabled) return true;
    const o = this.get<LifecycleObservation | null>("observation", null);
    return !!o && this.now() - o.observedAt <= this.config.observationSeconds * 1000 && (o.state === "running" || o.state === "starting");
  }
  requireRunning(): void {
    if (!this.connected() || this.config.enabled && this.status().state !== "running") throw new DiagnosticError("managementUnavailable");
  }
  private generation(w: ManagedWorld): GenerationWorld {
    const g = this.get<GenerationWorld>(`generation:${w.world}`, { ...w, state: "unknown", progress: null, observedAt: null, completedAt: null, completionSource: null, raw: "", job: "none" });
    if (!this.canPoll() || !this.connected()) return { ...g, state: "unavailable" };
    if (!g.observedAt || this.now() - g.observedAt > 90_000) return { ...g, state: "unknown" };
    return g;
  }
  private world(name: unknown): ManagedWorld {
    const w = this.config.worlds.find(w => w.world === name);
    if (!w) throw new DiagnosticError("managementInvalid");
    return w;
  }
  private record(w: ManagedWorld, raw: string, override?: "paused"): GenerationWorld {
    const previous = this.get<GenerationWorld | null>(`generation:${w.world}`, null);
    const parsed = parseChunky(raw, w.world);
    const state = override ?? parsed.state;
    const g: GenerationWorld = { ...w, state, progress: parsed.progress ?? previous?.progress ?? null, observedAt: this.now(),
      completedAt: state === "completed" ? this.now() : previous?.completedAt ?? null,
      completionSource: state === "completed" ? "chunky-response" : previous?.completionSource ?? null,
      raw: raw.slice(0, 8000), job: state === "completed" ? "none" : previous?.job ?? "none" };
    this.set(`generation:${w.world}`, g);
    if(state==="active" && !this.holds().some(h=>h.id===`chunky:${w.world}`))this.hold(`Observed Chunky ${w.world}`,"automation",`chunky:${w.world}`,"chunky");
    if (state === "completed" && this.holds().some(h => h.id === `chunky:${w.world}`)) this.release(`chunky:${w.world}`, "automation", true);
    return g;
  }
  async refresh(): Promise<void> {
    this.requireRunning();
    if (this.busy) return;
    this.busy = true;
    try {
      if (!this.config.worlds.length) return;
      const raw = await this.command("chunky progress");
      for (const w of this.config.worlds) {
        const previous = this.get<GenerationWorld | null>(`generation:${w.world}`, null);
        if (parseChunky(raw, w.world).state !== "unknown") this.record(w, raw);
        else if (previous?.state !== "paused" && previous?.state !== "completed") this.record(w, raw);
      }
      // A player joining pauses managed work; only explicitly enabled jobs may resume.
      const list = parseList(await this.command("minecraft:list"), () => {});
      for (const w of this.config.worlds) {
        const g = this.get<GenerationWorld | null>(`generation:${w.world}`, null);
        if (g?.job === "enabled" && g.state === "active" && (!list || list.online > 0)) await this.pause(w, "automation", true);
        if (g?.job === "enabled" && g.state === "paused" && list?.online === 0 && this.status().acknowledged && !g.completedAt) {
          const raw = await this.command(`chunky continue ${w.world}`);
          if (!stripLegacy(raw).includes(`Task continuing for ${w.world}.`)) throw new DiagnosticError("generationUnknown");
          const next = this.record(w, await this.command("chunky progress"));
          this.set(`generation:${w.world}`, { ...next, job: next.completedAt ? "none" : "enabled" });
        }
        // No automatic continuation from unknown/no-task states.
      }
    } finally { this.busy = false; }
  }
  private async pause(w: ManagedWorld, actor: string, keepEnabled = false): Promise<void> {
    const raw = await this.command(`chunky pause ${w.world}`);
    if (!stripLegacy(raw).includes(`Task paused for ${w.world}.`)) {
      this.record(w, raw); throw new DiagnosticError("generationUnknown");
    }
    // stop(false) is asynchronous: verify no running entry before claiming pause.
    const progress = await this.command("chunky progress");
    if (parseChunky(progress, w.world).state === "active" || !this.inactive(progress, w.world)) {
      this.record(w, progress); throw new DiagnosticError("generationUnknown");
    }
    const g = this.record(w, raw, "paused");
    this.set(`generation:${w.world}`, { ...g, job: keepEnabled ? "enabled" : "paused" });
    if (!keepEnabled && this.holds().some(h => h.id === `chunky:${w.world}`)) this.release(`chunky:${w.world}`, actor, true);
  }
  private inactive(raw: string, world: string): boolean {
    const lines = stripLegacy(raw).trim().split(/[\r\n]+/);
    return lines.length > 0 && lines.every(line => /^(?:\[Chunky\] )?No tasks running\.$/.test(line)
      || /Task running for [A-Za-z0-9_-]+\. Processed:/.test(line) && !line.includes(`Task running for ${world}.`) && !line.endsWith("..."));
  }
  async control(world: unknown, action: unknown, confirmed: unknown, actor: string): Promise<void> {
    const w = this.world(world);
    if (!["pause", "resume", "start", "border", "release"].includes(String(action))) throw new DiagnosticError("managementInvalid");
    if (confirmed !== true) throw new DiagnosticError("managementConfirm");
    if (this.busy) throw new DiagnosticError("managementBusy");
    this.requireRunning(); this.busy = true;
    try {
      if (action === "release") {
        const raw = await this.command("chunky progress");
        if (!this.inactive(raw, w.world)) throw new DiagnosticError("generationUnknown");
        this.release(`chunky:${w.world}`, actor, true);
        const g=this.get<GenerationWorld|null>(`generation:${w.world}`,null);
        if(g)this.set(`generation:${w.world}`,{...g,job:"paused"});
      } else if (action === "pause") await this.pause(w, actor);
      else {
        const id = `${action === "border" ? "border" : "chunky"}:${w.world}`;
        if (!this.holds().some(h => h.id === id)) this.hold(`Chunky ${w.world}`, actor, id, "chunky");
        if (!this.status().acknowledged) throw new DiagnosticError("managementHold");
        const list = parseList(await this.command("minecraft:list"), () => {});
        if (!list || list.online !== 0) throw new DiagnosticError("managementPlayers");
        const g = this.get<GenerationWorld | null>(`generation:${w.world}`, null);
        if (action !== "border" && g?.completedAt) throw new DiagnosticError("managementInvalid");
        if (action === "border") {
          if (!w.radius) throw new DiagnosticError("managementInvalid");
          const center = await this.command(`execute in ${w.dimension} run worldborder center ${w.x ?? 0} ${w.z ?? 0}`);
          const result = await this.command(`execute in ${w.dimension} run worldborder set ${w.radius * 2}`);
          if (!/Successfully set|Nothing changed/.test(stripLegacy(center)) || !/Successfully set|Nothing changed/.test(stripLegacy(result))) throw new DiagnosticError("generationUnknown");
          this.release(id, actor, true);
        } else {
          if (action === "start") {
            if (!w.radius) throw new DiagnosticError("managementInvalid");
            const border = await this.command(`execute in ${w.dimension} run worldborder get`);
            const match = /currently ([\d.]+) block/.exec(stripLegacy(border));
            if (!match || Math.abs(Number(match[1]) - w.radius * 2) > 1) throw new DiagnosticError("managementInvalid");
          }
          const raw = await this.command(action === "start" ? `chunky start ${w.world} square ${w.x ?? 0} ${w.z ?? 0} ${w.radius}` : `chunky continue ${w.world}`);
          if (!stripLegacy(raw).includes(action === "start" ? `Task started in ${w.world} for ` : `Task continuing for ${w.world}.`)) throw new DiagnosticError("generationUnknown");
          const next = this.record(w, await this.command("chunky progress"));
          this.set(`generation:${w.world}`, { ...next, job: next.completedAt ? "none" : "enabled" });
        }
      }
      this.audit(`Chunky ${action}`, true, w.world, actor);
    } catch (e) {
      const g = this.get<GenerationWorld | null>(`generation:${w.world}`, null);
      if (g) this.set(`generation:${w.world}`, { ...g, errorData: e instanceof DiagnosticError ? e.messageData : diagnostic("generationUnknown") });
      this.audit(`Chunky ${action}`, false, e instanceof Error ? e.message : "Unknown failure", actor);
      throw e;
    } finally {
      if (action === "border" && this.holds().some(h=>h.id===`border:${w.world}`)) this.release(`border:${w.world}`,actor,true);
      this.busy = false;
    }
  }
}

function pathUnsafe(value:string):boolean{return value.startsWith("/")||value.includes("\\")||value.split("/").includes("..");}
