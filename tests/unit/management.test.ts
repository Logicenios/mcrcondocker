import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { openDb, openMemoryDb, CURRENT_SCHEMA_VERSION } from "../../src/server/db/db.js";
import { Repo } from "../../src/server/db/repo.js";
import { Management, managementConfig, parseChunky } from "../../src/server/management/service.js";
import { Automation, offlineUuid, mergedDuration, type StewardImport } from "../../src/server/management/automation.js";
import { isPowerCommand } from "../../src/shared/dangerous.js";
import type { LifecycleObservation } from "../../src/shared/management.js";
import { fixture } from "./helpers.js";

const directories:string[]=[];
const temp=()=>{const dir=mkdtempSync(path.join(tmpdir(),"mcdash-management-"));directories.push(dir);return dir;};
afterEach(()=>{for(const dir of directories.splice(0))rmSync(dir,{recursive:true,force:true});});
function setup(enabled=true){
  let now=1_000_000;
  const repo=new Repo(openMemoryDb());
  const config={...managementConfig({}),enabled,token:"x".repeat(32),worlds:[{world:"world",dimension:"minecraft:overworld",radius:1000}]};
  const command=vi.fn(async(command:string)=>command==="minecraft:list"?"There are 0 of a max of 20 players online:":"[Chunky] No tasks running.");
  const audit=vi.fn();const m=new Management(repo,config,command,audit,()=>now);
  const observe=(state:LifecycleObservation["state"]="running",extra:Partial<LifecycleObservation>={})=>m.observe({version:1,source:"world",sequence:m.get<LifecycleObservation|null>("observation",null)?.sequence!+1||1,observedAt:now,phaseSince:now,state,intentionalSleep:state==="sleeping",reason:null,policyRevision:m.revision(),...extra});
  return {repo,config,command,audit,m,observe,advance:(ms:number)=>now+=ms};
}
function bundle():StewardImport{return {version:1,rules:{version:1,identityMode:"offline-authme",admins:["Exact_Case"],ranks:{group:[{name:"default",display:"Visitor",weight:10,hours:0}]},inviteOnly:true,notifications:false,digestHour:9,timezone:"UTC",serverName:"Test",chatStats:true,personalSkins:false,welcomeMessages:false,notifyGameEvents:true,tpsAlert:18,alertCooldownMinutes:30},state:{ranks:{"00000000-0000-0000-0000-000000000001":"veteran"},ranks_initialized:true,whitelist_seeded:true,pregen:{world:"done"},invites:{Guest:1},sessions:[["Guest",1,2]],last_digest:"2026-01-01"}};}

describe("lifecycle observations and maintenance",()=>{
  it("requires explicit intentional sleep, fresh ordered evidence and no power capability",()=>{
    const {m,observe,advance,command}=setup();
    expect(m.status().state).toBe("unknown");expect(m.canPoll()).toBe(false);
    expect(()=>observe("sleeping",{intentionalSleep:false})).toThrow();
    observe("sleeping");expect(m.status().state).toBe("sleeping");expect(m.canPoll()).toBe(false);
    expect(()=>observe("running",{sequence:1})).toThrow();
    observe();expect(m.canPoll()).toBe(true);
    advance(46000);expect(m.status().state).toBe("unknown");expect(m.canPoll()).toBe(false);
    expect(command).not.toHaveBeenCalled();
  });
  it("reports startup timeout without sending a command and accepts late recovery",()=>{
    const {m,observe,advance,command}=setup();observe("starting");const phaseSince=m.now();advance(600000);observe("starting",{phaseSince});
    expect(m.status().state).toBe("failed");expect(m.status().errorData?.id).toBe("managementTimeout");expect(command).not.toHaveBeenCalled();
    observe();expect(m.status().state).toBe("running");
  });
  it("persists manual holds, acknowledges revisions and keeps job ownership separate",()=>{
    const {m,observe,repo,config,command,audit}=setup();observe("sleeping");const id=m.hold("Maintenance","operator");
    expect(m.status().acknowledged).toBe(false);expect(command).not.toHaveBeenCalled();observe("sleeping");expect(m.status().acknowledged).toBe(true);
    const again=new Management(repo,config,command,audit,m.now);expect(again.holds()[0]?.id).toBe(id);
    m.hold("Job","operator","chunky:world","chunky");expect(()=>m.release("chunky:world","operator")).toThrow();m.release(id,"operator");expect(m.holds()).toHaveLength(1);
  });
});
describe("Chunky evidence and controls",()=>{
  it("parses realistic upstream responses without treating rounded progress or no task as completion",()=>{
    expect(parseChunky(fixture("chunky/progress.txt"),"world")).toEqual({state:"active",progress:99.99});
    expect(parseChunky("[Chunky] Task running for world. Processed: 1 chunks (100%), ETA: 0:00:00","world").state).toBe("active");
    expect(parseChunky(fixture("chunky/finished.txt"),"world").state).toBe("completed");
    expect(parseChunky(fixture("chunky/no-tasks.txt"),"world").state).toBe("unknown");
    expect(parseChunky(fixture("chunky/progress.txt"),"world_nether").state).toBe("unknown");
  });
  it("never wakes, auto-starts, or creates completion from no-task output",async()=>{
    const {m,observe,command}=setup();observe("sleeping");await expect(m.refresh()).rejects.toThrow();expect(command).not.toHaveBeenCalled();
    observe();await m.refresh();expect(m.status().worlds[0]?.completedAt).toBeNull();expect(command.mock.calls.every(([c])=>!c.includes("start")&&!c.includes("continue"))).toBe(true);
  });
  it("releases only the paused job hold after asynchronous pause is confirmed",async()=>{
    const {m,observe,command}=setup();observe();m.hold("manual","operator");m.hold("job","operator","chunky:world","chunky");observe();
    command.mockImplementation(async c=>c==="chunky pause world"?"[Chunky] Task paused for world.":"[Chunky] No tasks running.");
    await m.control("world","pause",true,"operator");expect(m.holds()).toHaveLength(1);expect(m.holds()[0]?.owner).toBe("manual");expect(m.status().worlds[0]?.state).toBe("paused");
    expect(command.mock.calls.map(([c])=>c)).toEqual(["chunky pause world","chunky progress"]);
  });
  it("retains the job hold on a failed or still-active pause",async()=>{
    const {m,observe,command}=setup();observe();m.hold("job","operator","chunky:world","chunky");observe();
    command.mockImplementation(async c=>c==="chunky pause world"?"[Chunky] Task paused for world.":fixture("chunky/progress.txt"));
    await expect(m.control("world","pause",true,"operator")).rejects.toThrow();expect(m.holds()).toHaveLength(1);expect(m.status().worlds[0]?.state).toBe("active");
  });
  it("requires confirmation, acknowledged protection and zero verified players before resume",async()=>{
    const {m,observe,command}=setup();observe();
    await expect(m.control("world","resume",false,"operator")).rejects.toThrow();
    await expect(m.control("world","resume",true,"operator")).rejects.toThrow();expect(command).not.toHaveBeenCalled();observe();
    command.mockResolvedValue("There are 1 of a max of 20 players online: Guest");
    await expect(m.control("world","resume",true,"operator")).rejects.toThrow();expect(command.mock.calls).toEqual([["minecraft:list"]]);
  });
  it("retains verified completion and never continues completed worlds",async()=>{
    const {m,observe,command}=setup();observe();command.mockResolvedValue(fixture("chunky/finished.txt"));await m.refresh();
    const completed=m.status().worlds[0]?.completedAt;expect(completed).not.toBeNull();
    command.mockResolvedValue("[Chunky] No tasks running.");await m.refresh();expect(m.status().worlds[0]?.completedAt).toBe(completed);
    observe("sleeping");expect(m.status().worlds[0]).toMatchObject({state:"unavailable",completedAt:completed});
  });
});
describe("Steward import, queued approvals and map-only access",()=>{
  function automation(){const s=setup();const dir=temp();s.config.worldData=dir;s.config.automationFile=path.join(dir,"import.json");writeFileSync(s.config.automationFile,JSON.stringify(bundle()));const a=new Automation(s.m,s.command,s.audit);a.import(a.preview().digest,"operator");return {...s,a,dir};}
  it("imports repeat-safely without claiming pre-generation completed or changing existing accounts",()=>{
    const {a,m,repo}=automation();repo.setSetting("existing","keep");a.import(a.preview().digest,"operator");
    expect(m.get("steward.import",{})).toEqual(bundle().state);expect(m.get("ranks.awarded",{})).toEqual(bundle().state.ranks);
    expect(m.status().worlds[0]?.completedAt).toBeNull();expect(m.get("import.pregen:world",{})).toEqual({claimed:"done",verified:false});expect(repo.getSetting("existing")).toBe("keep");
  });
  it("queues approval during sleep and confirms exact identity rather than a success string",async()=>{
    const {a,m,observe,command,dir}=automation();observe("sleeping");a.approve("Guest",true,"operator");await a.tick();expect(a.approvals()[0]?.state).toBe("pending");expect(command).not.toHaveBeenCalled();
    observe();writeFileSync(path.join(dir,"whitelist.json"),JSON.stringify([{name:"Guest",uuid:offlineUuid("guest")}]))
    await a.tick();expect(a.approvals()[0]?.state).toBe("pending");
    writeFileSync(path.join(dir,"whitelist.json"),JSON.stringify([{name:"Guest",uuid:offlineUuid("Guest")}]))
    await a.tick();expect(a.approvals()[0]?.state).toBe("applied");
    expect(offlineUuid("Guest")).not.toBe(offlineUuid("guest"));expect(m.canPoll()).toBe(true);
  });
  it("trusts AuthMe login events, not joins or chat; codes stay stable and resets revoke sessions",async()=>{
    const {a,observe,dir,command}=automation();observe();writeFileSync(path.join(dir,"banned-players.json"),"[]");
    await a.handleLine("[12:00:00] [Async Chat Thread #1/INFO]: [AuthMe] Guest logged in 127.0.0.1");await expect(a.mapCode("Guest")).rejects.toThrow();
    await a.handleLine("[12:00:00] [Server thread/INFO]: [AuthMe] Guest logged in 127.0.0.1");
    const code=await a.mapCode("Guest");expect(await a.mapCode("Guest")).toBe(code);
    const session=a.exchangeCode(code);expect(a.mapAuthorized(session.token)).toBe(true);
    const next=await a.mapCode("Guest",true);expect(next).not.toBe(code);expect(a.mapAuthorized(session.token)).toBe(false);expect(()=>a.exchangeCode(code)).toThrow();
    const newSession=a.exchangeCode(next);writeFileSync(path.join(dir,"banned-players.json"),JSON.stringify([{uuid:offlineUuid("Guest")}]))
    expect(a.mapAuthorized(newSession.token)).toBe(false);writeFileSync(path.join(dir,"banned-players.json"),"broken");expect(a.mapAuthorized(newSession.token)).toBe(false);
    expect(command.mock.calls.some(([c])=>c.includes("parent add admin"))).toBe(false);
  });
  it("denies symlinks outside the configured read-only data root",()=>{
    const {a,dir}=automation();const outside=temp();writeFileSync(path.join(outside,"list.json"),"[]");symlinkSync(path.join(outside,"list.json"),path.join(dir,"whitelist.json"));expect(()=>a.readJson("whitelist.json")).toThrow();
  });
});
it("upgrades v3 without changing accounts, settings, sessions or audit",()=>{
  const directory=temp();const db=openDb(directory);const repo=new Repo(db);repo.setSetting("keep","value");
  db.exec("DROP TABLE management_state; DROP TABLE maintenance_holds; DROP TABLE automation_events; DROP TABLE guest_approvals; DROP TABLE map_sessions; DROP TABLE map_identities; DROP TABLE notification_outbox; PRAGMA user_version=3;");db.close();
  const upgraded=openDb(directory);expect(new Repo(upgraded).getSetting("keep")).toBe("value");expect(upgraded.prepare("PRAGMA user_version").get()).toMatchObject({user_version:CURRENT_SCHEMA_VERSION});upgraded.close();
});

it("merges imported and dashboard session overlaps without inflating playtime",()=>{
  expect(mergedDuration([[100,500],[300,700],[800,900],[100,500]])).toBe(700);
});
it("blocks nested lifecycle commands while preserving ordinary chat messages",()=>{
  expect(isPowerCommand("/execute as @a run minecraft:stop")).toBe(true);
  expect(isPowerCommand("execute as @a run execute at @s run spigot:restart")).toBe(true);
  expect(isPowerCommand("say Please stop mining here")).toBe(false);
});
it("keeps a generation hold when a separate border operation finishes",async()=>{
  const {m,observe,command}=setup();observe();m.hold("generation","operator","chunky:world","chunky");m.hold("border","operator","border:world","chunky");observe();
  command.mockImplementation(async c=>c==="minecraft:list"?"There are 0 of a max of 20 players online:":"Successfully set the world border");
  await m.control("world","border",true,"operator");expect(m.holds().map(h=>h.id)).toEqual(["chunky:world"]);
});
it("starts only an explicitly bounded world task after protection acknowledgement",async()=>{
  const {m,observe,command}=setup();observe();m.hold("generation","operator","chunky:world","chunky");observe();
  command.mockImplementation(async c=>{
    if(c==="minecraft:list")return "There are 0 of a max of 20 players online:";
    if(c.includes("worldborder get"))return "The world border is currently 2000 blocks wide";
    if(c.startsWith("chunky start"))return "[Chunky] Task started in world for the square region centered at 0, 0 with radius 1000.";
    return fixture("chunky/progress.txt");
  });
  await m.control("world","start",true,"operator");
  expect(command.mock.calls.map(([c])=>c)).toContain("chunky start world square 0 0 1000");
  expect(command.mock.calls.some(([c])=>c==="chunky start"||c.startsWith("chunky world"))).toBe(false);
});
it("imports an existing maintenance marker as persistent protection without adopting or waking generation",()=>{
  const {m,config,command}=setup();const dir=temp();config.automationFile=path.join(dir,"import.json");
  const data=bundle();data.state.legacy_maintenance={reason:"pregen"};writeFileSync(config.automationFile,JSON.stringify(data));
  const a=new Automation(m,command,()=>{});a.import(a.preview().digest,"operator");
  expect(m.holds()).toMatchObject([{id:"import:maintenance",owner:"manual",reason:"pregen"}]);
  expect(m.status().worlds[0]?.job).toBe("none");expect(command).not.toHaveBeenCalled();
});
it("protects an observed active task without automatically adopting or resuming it",async()=>{
  const {m,observe,command}=setup();observe();command.mockResolvedValue(fixture("chunky/progress.txt"));await m.refresh();
  expect(m.holds().some(h=>h.id==="chunky:world")).toBe(true);expect(m.status().worlds[0]?.job).toBe("none");
  command.mockResolvedValue("[Chunky] No tasks running.");await m.refresh();
  expect(m.status().worlds[0]?.state).toBe("unknown");expect(m.status().worlds[0]?.completedAt).toBeNull();
  expect(command.mock.calls.some(([c])=>c.startsWith("chunky continue")||c.startsWith("chunky start"))).toBe(false);
});
