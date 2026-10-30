import { buildApp } from "../../src/server/app.js";
import { ActionService } from "../../src/server/actions.js";
import { Assets } from "../../src/server/assets.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { diagnostic, DiagnosticError, formatDiagnostic } from "../../src/shared/diagnostic-messages.js";
import { readiness } from "../../src/shared/readiness.js";
import { loadConfig } from "../../src/server/config.js";
import { openMemoryDb } from "../../src/server/db/db.js";
import { Repo } from "../../src/server/db/repo.js";
import { MockWorld } from "../../src/server/mock-world.js";
import { Diagnostics } from "../../src/server/parse/diagnostics.js";
import { Poller, UUID_QUERY_COMMAND } from "../../src/server/poller.js";
import { RconClient, describeSocketError, rconLogMessage, waitingForRcon } from "../../src/server/rcon/client.js";
import { startMockRconServer } from "../../src/server/rcon/mock-server.js";
import { SessionTracker } from "../../src/server/sessions.js";
import { ConsoleService } from "../../src/server/console.js";
import { fixture } from "./helpers.js";

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const unsupported = fixture("polling/namespaced-unsupported.txt");

async function setup(handler?: (command: string, world: MockWorld) => string) {
  const world = new MockWorld();
  // Stable roster with real offline-mode UUIDs from the existing mock fixtures.
  world.players.splice(1);
  for (const player of world.players) {
    const hex = player.uuid.replaceAll("-", "");
    player.uuidInts = `[I;${[0, 8, 16, 24].map((offset) => Number.parseInt(hex.slice(offset, offset + 8), 16) | 0).join(",")}]`;
  }
  const commands: string[] = [];
  const server = await startMockRconServer({ password: "private-test-password", handler: (command) => {
    commands.push(command);
    return handler ? handler(command, world) : world.handle(command);
  } });
  cleanup.push(() => server.close());
  const repo = new Repo(openMemoryDb());
  cleanup.push(() => repo.db.close());
  const rcon = new RconClient({ host: "127.0.0.1", port: server.port, password: "private-test-password", minBackoffMs: 20, maxBackoffMs: 40 });
  cleanup.push(() => rcon.stop());
  const diagnostics = new Diagnostics();
  const poller = new Poller(rcon, repo, new SessionTracker(repo), diagnostics, { pollIntervalMs: 10_000, perfIntervalMs: 60_000, floodgatePrefix: ".", mock: false, version: "test" });
  cleanup.push(() => poller.stop());
  rcon.start();
  await rcon.waitForConnected();
  return { world, commands, server, repo, rcon, diagnostics, poller };
}

describe("vanilla player-list capability", () => {
  it("bypasses an Essentials-shadowed list; manual console commands stay unchanged", async () => {
    const { commands, poller, rcon, diagnostics, world, repo } = await setup((command, world) => command === "list uuids" ? fixture("polling/essentials-list.txt") : world.handle(command));
    await poller.cycle();
    await poller.cycle();
    expect(commands.filter((command) => command.includes("list"))).toEqual(["minecraft:list uuids", "minecraft:list uuids"]);
    expect(poller.summaries()[0]).toMatchObject({ uuid: world.players[0]!.uuid, online: true });
    expect(repo.sessionsFor(world.players[0]!.uuid, 10)).toHaveLength(1);
    expect(diagnostics.getWarnings().filter((warning) => warning.key.startsWith("list-"))).toEqual([]);
    const console = new ConsoleService(rcon, diagnostics, []);
    const result = await console.run("list uuids", false, "en");
    expect(result).toMatchObject({ kind: "done", entry: { output: fixture("polling/essentials-list.txt"), ok: true } });
    expect(commands.at(-1)).toBe("list uuids");
  });

  it("keeps one poller and RCON connection when multiple SSE clients connect", async () => {
    const { commands, poller, rcon, server, repo, diagnostics } = await setup();
    const actions = new ActionService(rcon, repo, diagnostics, { nameOf: () => null });
    const app = await buildApp({ config: loadConfig({ MOCK: "true", LOG_LEVEL: "silent" }), repo, poller, rcon, diag: diagnostics, console: new ConsoleService(rcon, diagnostics, []), actions, assets: new Assets("/nonexistent"), version: "test", webRoot: "/nonexistent" });
    cleanup.push(() => app.close());
    const base = await app.listen({ host: "127.0.0.1", port: 0 });
    const login = await app.inject({ method: "POST", url: "/api/login", payload: { password: "mock" } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    poller.start();
    await vi.waitFor(() => expect(poller.status().lastUpdate).not.toBeNull(), { interval: 5 });
    const controllers = [new AbortController(), new AbortController(), new AbortController()];
    cleanup.push(() => { for (const controller of controllers) controller.abort(); });
    const streams = await Promise.all(controllers.map((controller) => fetch(`${base}/api/events`, { headers: { cookie }, signal: controller.signal })));
    for (const stream of streams) {
      expect(stream.status).toBe(200);
      const first = await stream.body!.getReader().read();
      expect(new TextDecoder().decode(first.value)).toContain('"type":"status"');
    }
    expect(poller.status().pollIntervalMs).toBe(10_000);
    expect(commands.filter((command) => command.includes("list"))).toEqual(["minecraft:list uuids"]);
    expect(server.connections()).toBe(1);
  });

  it("caches explicit namespace rejection across cycles and reconnects", async () => {
    const { commands, poller, rcon, server, diagnostics } = await setup((command, world) => command.startsWith("minecraft:list") ? unsupported : world.handle(command));
    await poller.cycle();
    server.dropConnections();
    await vi.waitFor(() => expect(rcon.state).not.toBe("connected"), { interval: 1 });
    await rcon.waitForConnected();
    await poller.cycle();
    expect(commands.filter((command) => command.includes("list"))).toEqual(["minecraft:list uuids", "minecraft:list", "list uuids", "list uuids"]);
    expect(diagnostics.getWarnings().find((warning) => warning.key === "list-legacy-fallback")).toMatchObject({ messageData: { id: "listLegacyFallback" }, context: unsupported });
    expect(diagnostics.getRaw().list?.find((response) => response.command === "minecraft:list uuids")?.body).toBe(unsupported);
  });

  it("recovers UUIDs when a legacy server supports namespaced list without the uuids argument", async () => {
    const { commands, poller, world } = await setup((command, world) => command === "minecraft:list uuids" ? unsupported : world.handle(command));
    await poller.cycle();
    await poller.cycle();
    expect(commands.filter((command) => command.includes("list"))).toEqual(["minecraft:list uuids", "minecraft:list", "minecraft:list"]);
    expect(commands.filter((command) => command === UUID_QUERY_COMMAND)).toHaveLength(2);
    expect(poller.summaries()[0]?.uuid).toBe(world.players[0]!.uuid);
  });

  it("bounds all rejected candidates, including the oldest bare-list fallback", async () => {
    const { commands, poller } = await setup((command, world) => command.includes("list") && command !== "list" ? unsupported : world.handle(command));
    await poller.cycle();
    await poller.cycle();
    expect(commands.filter((command) => command.includes("list"))).toEqual(["minecraft:list uuids", "minecraft:list", "list uuids", "list", "list"]);
    expect(poller.summaries()[0]?.online).toBe(true);
  });

  it("does not downgrade on malformed or Essentials-like namespaced responses", async () => {
    const { commands, poller } = await setup((command, world) => command === "minecraft:list uuids" ? fixture("polling/essentials-list.txt") : world.handle(command));
    await poller.cycle();
    await poller.cycle();
    expect(commands.filter((command) => command.includes("list"))).toEqual(["minecraft:list uuids", "minecraft:list uuids"]);
    expect(poller.summaries()[0]?.online).toBe(true);
  });

  it("does not probe rejected commands again when every list capability is unavailable", async () => {
    const { commands, poller } = await setup(() => unsupported);
    await poller.cycle();
    await poller.cycle();
    await poller.cycle();
    expect(commands).toEqual(["minecraft:list uuids", "minecraft:list", "list uuids", "list"]);
    expect(poller.status()).toMatchObject({ connection: "error", messageData: { id: "listUnavailable" } });
  });

  it("keeps a malformed response visible without probing legacy commands", async () => {
    const { commands, poller } = await setup(() => "Unexpected server output: Spieler Inventar");
    await poller.cycle();
    await poller.cycle();
    expect(commands).toEqual(["minecraft:list uuids", "minecraft:list uuids"]);
    expect(poller.status()).toMatchObject({ connection: "error", messageData: { id: "listUnreadable" } });
  });

  it.each([false, true])("recovers truncated UUID lists (legacy namespace fallback: %s)", async (legacy) => {
    const { commands, poller, world } = await setup((command, world) => legacy && command.startsWith("minecraft:list") ? unsupported : world.handle(command));
    const base = world.players[0]!;
    for (let i = 0; i < 9; i++) world.players.push({ ...base, name: `Offline${i}`, uuid: `11110000-2222-3000-8000-${String(i).padStart(12, "0")}`, uuidInts: `[I;286326784,572665856,-2147483648,${i}]`, schedule: undefined });
    // Use consistent actual UUID values, independent of online/offline authentication mode.
    for (const player of world.players.slice(1)) {
      const i = Number(player.name.slice(7));
      player.uuid = `11110000-2222-3000-8000-${i.toString(16).padStart(12, "0")}`;
    }
    await poller.cycle();
    expect(commands).toContain(UUID_QUERY_COMMAND);
    expect(poller.status().online).toBe(world.players.length);
    expect(poller.summaries().filter((player) => player.online).map((player) => player.uuid).sort()).toEqual(world.players.map((player) => player.uuid).sort());
  });
});

describe("structured backend diagnostics", () => {
  it("uses error codes, never German-word detection, and keeps log text English", () => {
    const error = Object.assign(new Error("Verbindung abgelehnt SECRET"), { code: "ECONNREFUSED" });
    const data = describeSocketError(error);
    expect(data).toEqual({ id: "rconRefused" });
    expect(formatDiagnostic("en", data)).toMatch(/^Connection refused/);
    expect(formatDiagnostic("de", data)).toMatch(/^Verbindung abgelehnt/);
    expect(formatDiagnostic("en", data)).not.toContain("SECRET");
    expect(describeSocketError(new Error("Verbindung abgelehnt"))).toEqual({ id: "rconSocket", params: { code: "UNKNOWN" } });
    expect(formatDiagnostic("de", diagnostic("listNoUuid", { name: "Inventory" }))).toContain('"Inventory"');
    expect(formatDiagnostic("en", diagnostic("listNoUuid", { name: "Inventar" }))).toContain('"Inventar"');
  });

  it("LANGUAGE_FILE controls no backend log locale, including config errors", () => {
    expect(loadConfig({ MOCK: "true", LANGUAGE_FILE: "de_de" }).pollIntervalMs).toBe(5000);
    expect(() => loadConfig({ LANGUAGE_FILE: "de_de" })).toThrow("DASHBOARD_PASSWORD is not set");
    expect(() => loadConfig({ MOCK: "true", PORT: "secret-not-a-number" })).toThrow("PORT must be a number");
    expect(() => loadConfig({ MOCK: "true", PORT: "secret-not-a-number" })).not.toThrow("secret-not-a-number");
  });

  it("waits through startup refusal, recovers, and reports later losses as errors", async () => {
    const { server, rcon, poller } = await setup();
    const port = server.port;
    // Fresh client starts before Minecraft. Keep it separate from setup's authenticated client.
    rcon.stop();
    await server.close();
    cleanup.shift();
    const booting = new RconClient({ host: "127.0.0.1", port, password: "secret", minBackoffMs: 30, maxBackoffMs: 60 });
    cleanup.push(() => booting.stop());
    const repo = new Repo(openMemoryDb());
    cleanup.push(() => repo.db.close());
    const p = new Poller(booting, repo, new SessionTracker(repo), new Diagnostics(), { pollIntervalMs: 5000, perfIntervalMs: 30_000, mock: false, floodgatePrefix: ".", version: "test" });
    cleanup.push(() => p.stop());
    const diag = new Diagnostics();
    const actions = new ActionService(booting, repo, diag, { nameOf: () => null });
    const app = await buildApp({ config: loadConfig({ MOCK: "true", LOG_LEVEL: "silent", TRUST_PROXY: "true", DASHBOARD_PASSWORD: "dashboard-password" }), repo, poller: p, rcon: booting, diag, console: new ConsoleService(booting, diag, []), actions, assets: new Assets("/nonexistent"), version: "test", webRoot: "/nonexistent" });
    cleanup.push(() => app.close());
    expect((await app.inject({ url: "/healthz" })).statusCode).toBe(200);
    expect((await app.inject({ url: "/readyz" })).statusCode).toBe(503);
    const login = await app.inject({ method: "POST", url: "/api/login", payload: { password: "dashboard-password" } });
    expect(login.statusCode).toBe(200);
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    booting.start();
    await vi.waitFor(() => expect(booting.lastErrorData?.id).toBe("rconRefused"));
    await p.cycle();
    expect(p.status()).toMatchObject({ connection: "connecting", lastUpdate: null, messageData: { id: "rconWaiting" } });
    expect(readiness(p.status()).ready).toBe(false);
    expect(rconLogMessage(booting)).toContain("waiting for Minecraft RCON");
    expect(booting.lastErrorContext).toMatchObject({ code: "ECONNREFUSED", syscall: "connect" });
    const exported = (await app.inject({ url: "/api/debug/export?lang=en", headers: { cookie } })).json();
    expect(exported.rcon).toMatchObject({ lastErrorData: { id: "rconRefused" }, lastErrorContext: { code: "ECONNREFUSED" } });
    expect(JSON.stringify(exported)).not.toContain("secret");
    for (const locale of ["en", "de"]) {
      const response = await app.inject({ url: "/api/world", headers: { cookie, "accept-language": locale } });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ code: "rconRefused" });
      expect(response.json().error).toMatch(locale === "en" ? /^Connection refused/ : /^Verbindung abgelehnt/);
      const action = await app.inject({ method: "POST", url: "/api/action", headers: { cookie, "accept-language": locale }, payload: { action: { type: "heal", uuid: "36532b5e-c442-3dbb-a24c-c7e55d0f979a" } } });
      expect(action.json()).toMatchObject({ ok: false, errorData: { id: "commandFailure", children: { error: { id: "rconRefused" } } } });
      expect(action.json().output).toMatch(locale === "en" ? /^Error: Connection refused/ : /^Fehler: Verbindung abgelehnt/);
      expect(diag.getRaw().action?.[0]).toMatchObject({ errorData: { id: "rconRefused" } });
    }
    // Preserve a representative same-origin HTTPS URL through the trusted reverse proxy.
    const host = "dashboard.example.com:2053";
    const headers = { cookie, host, "x-forwarded-proto": "https", origin: `https://${host}` };
    const url = `https://${host}/map/`;
    const settings = await app.inject({ method: "POST", url: "/api/settings/bluemap", headers, payload: { url } });
    expect(settings.json()).toEqual({ url, access: "operator" });
    const frame = await app.inject({ url: "/api/bluemap/view", headers });
    expect(frame.statusCode).toBe(200);
    expect(frame.body).toContain(`src="${url}"`);
    expect(frame.headers["content-security-policy"]).toContain(`frame-src https://${host};`);
    const recovered = await startMockRconServer({ port, password: "secret", handler: () => "There are 0 of a max of 20 players online:" });
    cleanup.push(() => recovered.close());
    await booting.waitForConnected(2000);
    await p.cycle();
    expect(readiness(p.status()).ready).toBe(true);
    expect((await app.inject({ url: "/readyz" })).statusCode).toBe(200);
    expect(booting.lastErrorData).toBeNull();
    recovered.dropConnections();
    await vi.waitFor(() => expect(booting.state).not.toBe("connected"), { interval: 1 });
    await p.cycle();
    expect(waitingForRcon(booting)).toBe(false);
    expect(p.status().connection).toBe("error");
    expect(readiness(p.status()).ready).toBe(false);
    expect(rconLogMessage(booting)).not.toContain("waiting for Minecraft");
    poller.stop();
  });

  it("preserves raw diagnostic messages and server responses alongside localized metadata", () => {
    const diagnostics = new Diagnostics();
    diagnostics.warn("warn", "original", "Unveränderte ursprüngliche Meldung", "Spieler Inventar: /list uuids");
    const original = diagnostics.getWarnings()[0];
    expect(original).toMatchObject({ message: "Unveränderte ursprüngliche Meldung", context: "Spieler Inventar: /list uuids" });
    const error = new DiagnosticError("rconCommandTimeout", { milliseconds: 1000 });
    expect(error.message).toBe("RCON command timed out (1000 ms)");
    expect(formatDiagnostic("de", error.messageData)).toBe("Zeitüberschreitung bei RCON-Befehl (1000 ms)");
  });
});
