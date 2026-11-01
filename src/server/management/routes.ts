import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DashboardUser } from "../../shared/users.js";
import { DiagnosticError, diagnostic, formatDiagnostic } from "../../shared/diagnostic-messages.js";
import { resolveLocale, translate } from "../../shared/translations.js";
import { parseCookies } from "../auth.js";
import type { Automation } from "./automation.js";
import { Management, secureEqual } from "./service.js";

export function registerManagementRoutes(app: FastifyInstance, m: Management, automation: Automation,
  user: (req: FastifyRequest) => DashboardUser | null, secure: (req: FastifyRequest) => boolean): void {
  app.get("/api/management/status", async req => {
    const status=m.status();return req.user?.role === "viewer" ? { ...status, reason:null, holds:[], worlds:status.worlds.map(w=>({...w,raw:""})) } : status;
  });
  app.post<{ Body: { reason?: unknown } }>("/api/management/holds", async req => {
    m.hold(req.body?.reason, req.user!.username); return m.status();
  });
  app.delete<{ Params: { id: string } }>("/api/management/holds/:id", async req => {
    m.release(req.params.id, req.user!.username); return m.status();
  });
  app.post<{ Body: { world?: unknown; action?: unknown; confirmed?: unknown } }>("/api/management/generation", async req => {
    await m.control(req.body?.world, req.body?.action, req.body?.confirmed, req.user!.username); return m.status();
  });
  app.get("/api/management/automation", async () => ({ rules: automation.rules(), approvals: automation.approvals(), error: m.get("automation.error", null) || m.get<{error:unknown}|null>("log.lastError",null)?.error,
    imported: !!m.get("import.digest", ""), generationClaims: m.config.worlds.map(w => ({ world: w.world, claim: m.get(`import.pregen:${w.world}`, null) })) }));
  app.get("/api/management/import", async () => automation.preview());
  app.post<{Body:{digest?:unknown;confirmed?:unknown}}>("/api/management/import", async req => {
    if(req.body?.confirmed!==true)throw new DiagnosticError("managementConfirm");
    automation.import(req.body.digest,req.user!.username);return {ok:true};
  });
  app.post<{Body:{name?:unknown;approved?:unknown}}>("/api/management/approvals",async req=>{
    automation.approve(req.body?.name,req.body?.approved,req.user!.username);return automation.approvals();
  });
  app.post<{Body:{confirmed?:unknown}}>("/api/management/permissions",async req=>{
    await automation.reconcilePermissions(req.body?.confirmed,req.user!.username);return {ok:true};
  });
  // External lifecycle only observes and reads policy. No power capability exists here.
  app.addHook("onRequest",async(req,reply)=>{
    if(!req.url.startsWith("/integrations/v1/"))return;
    const supplied=req.headers.authorization||"";
    if(!m.config.enabled || !m.config.token || !secureEqual(supplied,`Bearer ${m.config.token}`))return reply.code(401).send({error:"Unauthorized"});
  });
  app.get("/integrations/v1/maintenance",async()=>({version:1,revision:m.revision(),holds:m.holds(),idleSeconds:m.config.idleSeconds,startupSeconds:m.config.startupSeconds}));
  app.post("/integrations/v1/observation",async(req)=>{const previous=m.status().state;m.observe(req.body);const current=m.status().state;if(previous!==current)automation.lifecycleObserved(current);return {ok:true};});

  app.get("/api/map/authorize",async(req,reply)=>{
    // Existing dashboard authentication and viewer restrictions apply; player-only access uses the separate gate below.
    if(req.user?.role!=="operator")return reply.code(403).send();
    return reply.code(204).send();
  });
  app.addHook("onSend",async(req,reply,payload)=>{
    if(req.url.startsWith("/map-access") || req.url.startsWith("/integrations/"))reply.header("Cache-Control","no-store");return payload;
  });
  const attempts=new Map<string,{count:number;until:number}>();
  app.post<{Body:{code?:unknown}}>("/map-access/session",async(req,reply)=>{
    if(!req.headers["content-type"]?.startsWith("application/json"))return reply.code(415).send();
    if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)return reply.code(403).send();}catch{return reply.code(403).send();}}
    const now=m.now();
    for(const [key,v]of attempts)if(v.until<=now)attempts.delete(key);
    if(attempts.size>=10000 && !attempts.has(req.ip))return reply.code(429).send();
    const attempt=attempts.get(req.ip)||{count:0,until:now+600000};
    if(attempt.count>=10)return reply.code(429).send();
    attempt.count++;attempts.set(req.ip,attempt);
    try{
      const session=automation.exchangeCode(req.body?.code);
      attempts.delete(req.ip);
      reply.header("Set-Cookie",`mcdash_map=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${session.seconds}${secure(req)?"; Secure":""}`);
      return {ok:true};
    }catch{return reply.code(401).send({errorData:diagnostic("mapCodeInvalid"),error:formatDiagnostic(resolveLocale(req.headers["accept-language"]),diagnostic("mapCodeInvalid"))});}
  });
  app.get("/map-access/authorize",async(req,reply)=>{
    const account=user(req);
    const allowed=account?.role==="operator" || automation.mapAuthorized(parseCookies(req.headers.cookie).mcdash_map||"");
    return reply.header("Cache-Control","no-store").code(allowed?204:403).send();
  });
  app.get("/map-access",async(req,reply)=>{
    const t=(key:string)=>translate(resolveLocale(req.headers["accept-language"]),key);
    reply.type("text/html; charset=utf-8").header("Cache-Control","no-store");
    return `<!doctype html><html lang="${resolveLocale(req.headers["accept-language"])}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t("Kartenzugang")}</title><body><main><h1>${t("Kartenzugang")}</h1><p>${t("Mit /map im Spiel erhältst du einen persönlichen Kartencode.")}</p><form id="map-login"><label>${t("Kartencode")} <input name="code" required maxlength="16" autocomplete="off"></label><button>${t("Anmelden")}</button></form><p id="result" role="status"></p><script src="/map-access/login.js" defer></script></main></body></html>`;
  });
  app.get("/map-access/login.js",async(req,reply)=>{
    const t=(key:string)=>JSON.stringify(translate(resolveLocale(req.headers["accept-language"]),key));
    reply.type("text/javascript; charset=utf-8").header("Cache-Control","no-store");
    const map=m.repo.getSetting("bluemap.url");
    return `const form=document.getElementById('map-login');const code=new URLSearchParams(location.hash.slice(1)).get('code');history.replaceState(null,'',location.pathname);form.addEventListener('submit',async e=>{e.preventDefault();const r=await fetch('/map-access/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:new FormData(form).get('code')})});const target=${JSON.stringify(map)};if(r.ok&&target&&new URL(target).origin===location.origin){location.assign(target);return;}document.getElementById('result').textContent=r.ok?${t("Angemeldet. Öffne die Karte erneut.")}:${t("Kartencode ungültig oder Zugriff nicht verfügbar.")};});if(code){form.elements.code.value=code;form.requestSubmit();}`;

  });
}
