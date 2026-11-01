import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import path from "node:path";
import {tmpdir} from "node:os";
import type {FastifyInstance} from "fastify";
import {buildApp} from "../../src/server/app.js";
import {loadConfig} from "../../src/server/config.js";
import {Repo} from "../../src/server/db/repo.js";
import {openMemoryDb} from "../../src/server/db/db.js";
import {RconClient} from "../../src/server/rcon/client.js";
import {Poller} from "../../src/server/poller.js";
import {SessionTracker} from "../../src/server/sessions.js";
import {Diagnostics} from "../../src/server/parse/diagnostics.js";
import {ActionService} from "../../src/server/actions.js";
import {ConsoleService} from "../../src/server/console.js";
import {Assets} from "../../src/server/assets.js";
let app:FastifyInstance;let repo:Repo;let directory:string;let operator:string;let viewer:string;
const token="integration-secret-".repeat(3);
const json={"content-type":"application/json"};
beforeAll(async()=>{
  directory=mkdtempSync(path.join(tmpdir(),"management-api-"));writeFileSync(path.join(directory,"token"),token);
  const config=loadConfig({MOCK:"true",ON_DEMAND:"true",MANAGEMENT_TOKEN_FILE:path.join(directory,"token"),LOG_LEVEL:"silent"});
  repo=new Repo(openMemoryDb());const rcon=new RconClient({host:"127.0.0.1",port:1,password:"mock"});const diag=new Diagnostics();
  const poller=new Poller(rcon,repo,new SessionTracker(repo),diag,{pollIntervalMs:60000,perfIntervalMs:60000,floodgatePrefix:".",mock:true,version:"test"});
  const actions=new ActionService(rcon,repo,diag,{nameOf:()=>null});
  app=await buildApp({config,repo,rcon,poller,diag,actions,console:new ConsoleService(rcon,diag,[]),assets:new Assets(directory),version:"test",webRoot:"/nonexistent"});
  const login=await app.inject({method:"POST",url:"/api/login",headers:json,payload:{password:"mock"}});operator=String(login.headers["set-cookie"]).split(";")[0]!;
  await app.inject({method:"POST",url:"/api/users",headers:{...json,cookie:operator},payload:{username:"reader",password:"reader-password",role:"viewer"}});
  const read=await app.inject({method:"POST",url:"/api/login",headers:json,payload:{username:"reader",password:"reader-password"}});viewer=String(read.headers["set-cookie"]).split(";")[0]!;
});
afterAll(async()=>{await app.close();repo.db.close();rmSync(directory,{recursive:true,force:true});});
describe("optional management API",()=>{
  it("keeps offline accounts, settings and management available; readiness stays false",async()=>{
    expect((await app.inject({url:"/healthz"})).statusCode).toBe(200);
    expect((await app.inject({url:"/readyz"})).statusCode).toBe(503);
    for(const url of ["/api/management/status","/api/management/automation","/api/users","/api/settings/bluemap"])expect((await app.inject({url,headers:{cookie:operator}})).statusCode).toBe(200);
  });
  it("requires authenticated operators and enforces JSON and origin protections",async()=>{
    expect((await app.inject({url:"/api/management/status"})).statusCode).toBe(401);
    expect((await app.inject({url:"/api/management/status",headers:{cookie:viewer}})).statusCode).toBe(200);
    for(const cookie of [viewer])expect((await app.inject({method:"POST",url:"/api/management/holds",headers:{...json,cookie},payload:{reason:"work"}})).statusCode).toBe(403);
    expect((await app.inject({method:"POST",url:"/api/management/holds",headers:{...json,cookie:operator,origin:"https://foreign.example"},payload:{reason:"work"}})).statusCode).toBe(403);
    expect((await app.inject({method:"POST",url:"/api/management/holds",headers:{...json,cookie:operator},payload:{reason:""}})).statusCode).toBe(400);
  });
  it("allows holds while asleep without exposing their administrative details to viewers",async()=>{
    const r=await app.inject({method:"POST",url:"/api/management/holds",headers:{...json,cookie:operator},payload:{reason:"Private maintenance"}});expect(r.statusCode).toBe(200);expect(r.json().holds).toHaveLength(1);
    const view=await app.inject({url:"/api/status",headers:{cookie:viewer}});expect(view.body).not.toContain("Private maintenance");
  });
  it("restricts integration to authenticated observations and read-only policy with no power endpoint",async()=>{
    expect((await app.inject({url:"/integrations/v1/maintenance"})).statusCode).toBe(401);
    expect((await app.inject({url:"/integrations/v1/maintenance",headers:{cookie:operator}})).statusCode).toBe(401);
    const headers={...json,authorization:`Bearer ${token}`};
    const policy=(await app.inject({url:"/integrations/v1/maintenance",headers})).json();expect(policy.holds).toHaveLength(1);
    const now=Date.now();const payload={version:1,source:"world",sequence:1,observedAt:now,phaseSince:now,state:"sleeping",intentionalSleep:true,reason:null,policyRevision:policy.revision};
    expect((await app.inject({method:"POST",url:"/integrations/v1/observation",headers,payload})).statusCode).toBe(200);
    expect((await app.inject({url:"/api/management/status",headers:{cookie:operator}})).json().state).toBe("sleeping");
    for(const action of ["start","stop","restart","wake"]){
      expect((await app.inject({method:"POST",url:`/integrations/v1/${action}`,headers,payload:{}})).statusCode).toBe(404);
      expect((await app.inject({method:"POST",url:`/api/management/${action}`,headers:{...json,cookie:operator},payload:{}})).statusCode).toBe(404);
    }
  });
  it("does not permit power commands through the RCON console",async()=>{
    for(const command of ["stop","/stop","/minecraft:stop","minecraft:stop","spigot:restart","execute as @a run minecraft:stop"]){
      const r=await app.inject({method:"POST",url:"/api/console",headers:{...json,cookie:operator},payload:{command,confirmed:true}});expect(r.statusCode).toBe(403);
    }
  });
  it("keeps map authorization independent of Minecraft and rejects legacy cookies and viewers",async()=>{
    expect((await app.inject({url:"/map-access/authorize",headers:{cookie:operator}})).statusCode).toBe(204);
    expect((await app.inject({url:"/map-access/authorize",headers:{cookie:viewer}})).statusCode).toBe(403);
    expect((await app.inject({url:"/map-access/authorize",headers:{cookie:"legacy_map=Guest:old"}})).statusCode).toBe(403);
    expect((await app.inject({method:"POST",url:"/map-access/session",headers:json,payload:{code:"OLD-CODE"}})).statusCode).toBe(401);
    expect((await app.inject({url:"/map-access"})).statusCode).toBe(200);
  });
});
