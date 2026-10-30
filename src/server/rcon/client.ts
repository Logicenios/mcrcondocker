import { diagnostic, DiagnosticError, type DiagnosticMessage } from "../../shared/diagnostic-messages.js";
import { EventEmitter } from "node:events";
import net from "node:net";
import {
  encodePacket,
  MAX_OUTGOING_BODY_BYTES,
  PacketDecoder,
  PacketType,
  type RconPacket,
} from "./protocol.js";

export type RconState = "disconnected" | "connecting" | "connected" | "auth_failed" | "stopped";

export interface RconOptions {
  host: string;
  port: number;
  password: string;
  /** Maximale Wartezeit auf eine vollständige Antwort */
  commandTimeoutMs?: number;
  connectTimeoutMs?: number;
  minBackoffMs?: number;
  maxBackoffMs?: number;
}

export interface RconResponse {
  command: string;
  body: string;
  /** Anzahl der RCON-Pakete, aus denen die Antwort zusammengesetzt wurde */
  fragments: number;
  bytes: number;
  durationMs: number;
  receivedAt: number;
}

export type Priority = "high" | "normal";

interface Job {
  command: string;
  timeoutMs: number;
  resolve: (r: RconResponse) => void;
  reject: (e: Error) => void;
}

interface InFlight {
  job: Job;
  commandId: number;
  markerId: number;
  markerSent: boolean;
  fragments: Buffer[];
  startedAt: number;
  timer: NodeJS.Timeout;
}

export class RconError extends DiagnosticError {
  constructor(
    message: DiagnosticMessage,
    readonly code: "not_connected" | "timeout" | "connection_lost" | "too_long" | "stopped",
  ) {
    super(message.id, message.params, message.children);
  }
}

/**
 * Genau eine RCON-Verbindung; alle Befehle laufen nacheinander über eine
 * Warteschlange (Konsole = "high" vor Poller = "normal").
 *
 * Mehrteilige Antworten: Minecraft teilt lange Antworten in mehrere Pakete mit
 * derselben ID auf, ohne das Ende zu markieren. Daher wird nach dem ersten
 * Antwortfragment ein Marker-Paket mit unbekanntem Typ gesendet. Der Server
 * schreibt alle Fragmente, bevor er das nächste Paket liest, also kommt dessen
 * Antwort ("Unknown request 0") erst nach dem letzten Fragment.
 *
 * Wichtig: Der Server liest pro read() genau ein Paket und trennt die Verbindung,
 * wenn mehrere Pakete in einem Lesevorgang ankommen (am Testserver mit Paper 26.3
 * nachgewiesen). Deshalb ist vom Client immer höchstens ein Paket unterwegs.
 */
export class RconClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private decoder = new PacketDecoder();
  private queueHigh: Job[] = [];
  private queueNormal: Job[] = [];
  private inFlight: InFlight | null = null;
  private nextId = 1;
  private authId = 0;
  private backoffMs: number;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectTimer: NodeJS.Timeout | null = null;
  private _state: RconState = "disconnected";
  private _lastError: string | null = null;
  private _lastErrorData: DiagnosticMessage | null = null;
  private _lastErrorContext: Record<string, string> | null = null;
  private _hasConnected = false;
  private _sentCount = 0;
  private readonly opts: Required<RconOptions>;

  constructor(options: RconOptions) {
    super();
    this.opts = {
      commandTimeoutMs: 10_000,
      connectTimeoutMs: 5_000,
      minBackoffMs: 1_000,
      maxBackoffMs: 60_000,
      ...options,
    };
    this.backoffMs = this.opts.minBackoffMs;
  }

  get state(): RconState {
    return this._state;
  }

  get lastError(): string | null {
    return this._lastError;
  }

  get lastErrorData(): DiagnosticMessage | null { return this._lastErrorData; }
  get lastErrorContext(): Record<string, string> | null { return this._lastErrorContext; }
  get hasConnected(): boolean { return this._hasConnected; }

  /** Anzahl gesendeter Befehle seit Start */
  get sentCount(): number {
    return this._sentCount;
  }

  get queueLength(): number {
    return this.queueHigh.length + this.queueNormal.length + (this.inFlight ? 1 : 0);
  }

  start(): void {
    if (this._state !== "stopped" && this.socket) return;
    this._state = "disconnected";
    this.connect();
  }

  stop(): void {
    this.clearTimers();
    this.setState("stopped");
    this.failAll(new RconError(diagnostic("rconStopped"), "stopped"));
    this.socket?.destroy();
    this.socket = null;
  }

  /** Wartet, bis die Verbindung steht (oder bricht nach timeoutMs ab). */
  waitForConnected(timeoutMs = 10_000): Promise<void> {
    if (this._state === "connected") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off("state", onState);
        reject(new RconError(this._lastErrorData ?? diagnostic("rconNotConnected"), "not_connected"));
      }, timeoutMs);
      const onState = (s: RconState) => {
        if (s === "connected") {
          clearTimeout(timer);
          this.off("state", onState);
          resolve();
        }
      };
      this.on("state", onState);
    });
  }

  send(command: string, priority: Priority = "normal", timeoutMs?: number): Promise<RconResponse> {
    if (this._state === "stopped") {
      return Promise.reject(new RconError(diagnostic("rconStopped"), "stopped"));
    }
    if (this._state !== "connected") {
      return Promise.reject(
        new RconError(this._lastErrorData ?? diagnostic("rconNotConnected"), "not_connected"),
      );
    }
    if (Buffer.byteLength(command, "utf8") > MAX_OUTGOING_BODY_BYTES) {
      return Promise.reject(
        new RconError(diagnostic("rconTooLong", { bytes: MAX_OUTGOING_BODY_BYTES }), "too_long"),
      );
    }
    return new Promise((resolve, reject) => {
      const job: Job = {
        command,
        timeoutMs: timeoutMs ?? this.opts.commandTimeoutMs,
        resolve,
        reject,
      };
      (priority === "high" ? this.queueHigh : this.queueNormal).push(job);
      this.pump();
    });
  }

  // --- intern -------------------------------------------------------------

  private setState(state: RconState, error?: DiagnosticMessage): void {
    if (error !== undefined) {
      this._lastErrorData = error;
      this._lastError = new DiagnosticError(error.id, error.params, error.children).message;
    }
    if (state === "connected") {
      this._hasConnected = true;
      this._lastError = null;
      this._lastErrorData = null;
      this._lastErrorContext = null;
    }
    const changed = state !== this._state;
    this._state = state;
    if (changed) this.emit("state", state, this._lastError);
  }

  private allocId(): number {
    const id = this.nextId;
    this.nextId = this.nextId >= 0x7fff_fff0 ? 1 : this.nextId + 1;
    return id;
  }

  private connect(): void {
    if (this._state === "stopped") return;
    this.clearTimers();
    this.decoder.reset();
    this.setState("connecting");
    const socket = net.connect({ host: this.opts.host, port: this.opts.port });
    this.socket = socket;
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30_000);

    this.connectTimer = setTimeout(() => {
      this.handleDisconnect(socket, diagnostic("rconConnectTimeout"));
    }, this.opts.connectTimeoutMs);

    socket.on("connect", () => {
      this.authId = this.allocId();
      socket.write(encodePacket(this.authId, PacketType.AUTH, this.opts.password));
    });
    socket.on("data", (chunk) => {
      let packets: RconPacket[];
      try {
        packets = this.decoder.push(chunk);
      } catch (e) {
        this.handleDisconnect(socket, diagnostic("rconProtocol", { error: (e as Error).message }, e instanceof DiagnosticError ? { error: e.messageData } : undefined));
        return;
      }
      for (const p of packets) this.handlePacket(socket, p);
    });
    socket.on("error", (err: NodeJS.ErrnoException) => {
      this.handleDisconnect(socket, describeSocketError(err), "disconnected", "connection_lost", { code: err.code ?? "UNKNOWN", ...(err.syscall ? { syscall: err.syscall } : {}) });
    });
    socket.on("close", () => {
      this.handleDisconnect(socket, this._lastErrorData ?? diagnostic("rconClosed"));
    });
  }

  private handlePacket(socket: net.Socket, p: RconPacket): void {
    if (this._state === "connecting") {
      // Minecraft antwortet auf Auth mit Typ 2 und ID = Anfrage-ID bzw. -1 bei falschem Passwort.
      // Manche Server senden vorher ein leeres Typ-0-Paket; das wird ignoriert.
      if (p.type !== PacketType.AUTH_RESPONSE) return;
      if (this.connectTimer) clearTimeout(this.connectTimer);
      this.connectTimer = null;
      if (p.id === -1) {
        this.handleDisconnect(socket, diagnostic("rconAuth"), "auth_failed");
        return;
      }
      if (p.id !== this.authId) return;
      this.backoffMs = this.opts.minBackoffMs;
      this.setState("connected");
      this.pump();
      return;
    }

    const f = this.inFlight;
    if (!f) return; // unaufgeforderte Pakete ignorieren
    if (p.id === f.commandId) {
      f.fragments.push(p.body);
      if (!f.markerSent) {
        f.markerSent = true;
        socket.write(encodePacket(f.markerId, PacketType.RESPONSE_VALUE, ""));
      }
    } else if (p.id === f.markerId) {
      clearTimeout(f.timer);
      this.inFlight = null;
      const body = Buffer.concat(f.fragments);
      f.job.resolve({
        command: f.job.command,
        // Erst nach dem Zusammensetzen dekodieren, damit Mehrbyte-Zeichen an
        // Paketgrenzen nicht zerbrechen.
        body: body.toString("utf8"),
        fragments: f.fragments.length,
        bytes: body.length,
        durationMs: Date.now() - f.startedAt,
        receivedAt: Date.now(),
      });
      this.pump();
    } else if (p.id === -1) {
      // Server hält uns für nicht authentifiziert
      this.handleDisconnect(socket, diagnostic("rconNotAuthenticated"), "auth_failed");
    }
  }

  private pump(): void {
    if (this.inFlight || this._state !== "connected" || !this.socket) return;
    const job = this.queueHigh.shift() ?? this.queueNormal.shift();
    if (!job) return;
    const commandId = this.allocId();
    const markerId = this.allocId();
    const socket = this.socket;
    const timer = setTimeout(() => {
      // Ohne vollständige Antwort ist die Zuordnung der folgenden Pakete
      // unsicher, deshalb Verbindung neu aufbauen.
      this.handleDisconnect(socket, diagnostic("rconCommandTimeout", { milliseconds: job.timeoutMs }), "disconnected", "timeout");
    }, job.timeoutMs);
    this.inFlight = {
      job,
      commandId,
      markerId,
      markerSent: false,
      fragments: [],
      startedAt: Date.now(),
      timer,
    };
    // Der Marker folgt erst nach dem ersten Antwortfragment (siehe handlePacket).
    this._sentCount++;
    socket.write(encodePacket(commandId, PacketType.EXEC_COMMAND, job.command));
  }

  private handleDisconnect(
    socket: net.Socket,
    reason: DiagnosticMessage,
    state: RconState = "disconnected",
    code: RconError["code"] = "connection_lost",
    context: Record<string, string> | null = null,
  ): void {
    if (socket !== this.socket) return; // alte Verbindung
    this.socket = null;
    socket.removeAllListeners();
    socket.on("error", () => {});
    socket.destroy();
    this.clearTimers();
    if (this._state === "stopped") return;

    if (this.inFlight) {
      clearTimeout(this.inFlight.timer);
      this.inFlight.job.reject(new RconError(reason, code));
      this.inFlight = null;
    }
    // Wartende Befehle nicht über eine neue Verbindung nachholen: Konsolenbefehle
    // könnten sonst unerwartet später ausgeführt werden.
    this.failAll(new RconError(reason, "connection_lost"));

    this._lastErrorContext = context;
    this.setState(state, reason);
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, this.opts.maxBackoffMs);
    this.emit("reconnect_scheduled", delay);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private failAll(err: Error): void {
    const jobs = [...this.queueHigh, ...this.queueNormal];
    this.queueHigh = [];
    this.queueNormal = [];
    if (this.inFlight) {
      clearTimeout(this.inFlight.timer);
      jobs.push(this.inFlight.job);
      this.inFlight = null;
    }
    for (const j of jobs) j.reject(err);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.reconnectTimer = null;
    this.connectTimer = null;
  }
}

export function describeSocketError(err: NodeJS.ErrnoException): DiagnosticMessage {
  switch (err.code) {
    case "ECONNREFUSED": return diagnostic("rconRefused");
    case "ENOTFOUND":
    case "EAI_AGAIN": return diagnostic("rconHostNotFound");
    case "ETIMEDOUT": return diagnostic("rconConnectTimeout");
    case "ECONNRESET": return diagnostic("rconReset");
    case "EHOSTUNREACH":
    case "ENETUNREACH": return diagnostic("rconUnreachable");
    // Do not send the socket message/address or credentials to browsers/logs.
    default: return diagnostic("rconSocket", { code: err.code ?? "UNKNOWN" });
  }
}

/** Startup refusal is recoverable; auth/DNS/protocol failures remain visible as errors. */
export function waitingForRcon(client: RconClient): boolean {
  return !client.hasConnected && (client.state === "connecting" || client.state === "disconnected")
    && (!client.lastErrorData || client.lastErrorData.id === "rconRefused" || client.lastErrorData.id === "rconConnectTimeout");
}

export function rconLogMessage(client: RconClient): string {
  const state = waitingForRcon(client) ? "waiting for Minecraft RCON" : client.state;
  return `RCON: ${state}${client.lastError ? ` (${client.lastError})` : ""}`;
}
