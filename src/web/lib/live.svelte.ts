import type { RenderIndex } from "../../shared/appearance";
// Gemeinsamer Live-Zustand, gespeist aus Server-Sent Events.
import type { AuditEntry, ConsoleEntry, LiveEvent, PlayerSummary, ServerStatus } from "../../shared/types";
import { session } from "./session.svelte";
import { api, type AssetsInfo } from "./api";

class LiveState {
  status = $state<ServerStatus | null>(null);
  players = $state<PlayerSummary[]>([]);
  console = $state<ConsoleEntry[]>([]);
  /** neue Protokolleinträge seit dem Verbinden (neueste zuerst) */
  audit = $state<AuditEntry[]>([]);
  /** SSE-Verbindung zum Dashboard selbst (nicht RCON) */
  liveConnected = $state(false);
  renderer = $state<RenderIndex | null>(null);
  translations = $state<Record<string, string>>({});
  gameNamesNeeded = $state(false);
  assets = $state<AssetsInfo | null>(null);
  /** sekündlich aktualisiert, für relative Zeitangaben */
  now = $state(Date.now());

  private generation = 0;
  private rendererRequest: Promise<void> | null = null;
  private consoleRequest: Promise<void> | null = null;
  consoleError = $state(false);
  private es: EventSource | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.stop();
    this.clock = setInterval(() => (this.now = Date.now()), 1000);
    const generation = this.generation;
    api.assets().then((a) => { if (generation === this.generation) this.assets = a; }).catch(() => {});
    const es = new EventSource("/api/events");
    this.es = es;
    es.onopen = () => { if (generation === this.generation) this.liveConnected = true; };
    es.onerror = () => {
      if (generation !== this.generation) return;
      this.liveConnected = false;
      // abgelaufene Anmeldung erkennen (EventSource liefert den Statuscode nicht)
      api.session().then((s) => {
        if (generation === this.generation && !s.authenticated) {
          this.stop();
          window.dispatchEvent(new CustomEvent("mcdash:logout"));
        }
      }).catch(() => {});
    };
    es.onmessage = (msg) => {
      if (generation !== this.generation) return;
      let ev: LiveEvent;
      try {
        ev = JSON.parse(msg.data);
      } catch {
        return;
      }
      if (ev.type === "status") this.status = ev.status;
      else if (ev.type === "players") this.players = ev.players;
      else if (ev.type === "console") {
        if (!this.console.some((c) => c.id === ev.entry.id)) this.console = [...this.console, ev.entry].slice(-200);
      } else if (ev.type === "audit") {
        if (!this.audit.some((a) => a.id === ev.entry.id)) this.audit = [ev.entry, ...this.audit].slice(0, 200);
      }
    };
  }

  // Share requests between all visible item icons; ignore responses from an ended session.
  loadRenderer(): Promise<void> {
    if (this.rendererRequest) return this.rendererRequest;
    const generation = this.generation;
    return this.rendererRequest = api.renderIndex().then((index) => {
      if (generation === this.generation) this.renderer = index;
    }).catch(() => { if (generation === this.generation) this.rendererRequest = null; });
  }

  loadConsole(): Promise<void> {
    if (!session.operator) return Promise.resolve();
    if (this.consoleRequest) return this.consoleRequest;
    const generation = this.generation;
    this.consoleError = false;
    return this.consoleRequest = api.consoleHistory().then((history) => {
      if (generation !== this.generation) return;
      const entries = new Map(history.map((entry) => [entry.id, entry]));
      for (const entry of this.console) entries.set(entry.id, entry);
      this.console = [...entries.values()].sort((a, b) => a.at - b.at || a.id - b.id).slice(-200);
    }).catch(() => {
      if (generation === this.generation) { this.consoleRequest = null; this.consoleError = true; }
    });
  }

  stop(): void {
    this.es?.close();
    this.es = null;
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
    this.liveConnected = false;
    this.generation++;
    this.rendererRequest = this.consoleRequest = null;
    this.renderer = null;
    this.assets = null;
    this.status = null;
    this.players = [];
    this.console = [];
    this.audit = [];
    this.translations = {};
    this.gameNamesNeeded = false;
    this.consoleError = false;
  }

  addConsole(entry: ConsoleEntry): void {
    if (!this.console.some((c) => c.id === entry.id)) this.console = [...this.console, entry].slice(-200);
  }
}

export const live = new LiveState();
