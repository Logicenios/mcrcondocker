<script lang="ts">
  import Button from "./ui/Button.svelte";
  import { session } from "../lib/session.svelte";
  import MinecraftIcon from "./MinecraftIcon.svelte";
  import LanguagePicker from "./LanguagePicker.svelte";
  import { formatDiagnostic } from "../../shared/diagnostic-messages";
  import { t as tr, language } from "../lib/i18n.svelte";
  import { api } from "../lib/api";
  import { ago, time, coord } from "../lib/format";
  import { live } from "../lib/live.svelte";

  let busy = $state(false);

  const s = $derived(live.status);
  const statusMessage = $derived(s?.messageData ? formatDiagnostic(language.locale, s.messageData) : s?.message);
  const conn = $derived.by(() => {
    if (!live.liveConnected)
      return { cls: "error", label: "Dashboard nicht erreichbar" };
    if (!s) return { cls: "connecting", label: "Verbinde …" };
    switch (s.connection) {
      case "connected":
        return { cls: "ok", label: "Verbunden" };
      case "paused":
        return { cls: "paused", label: "Pausiert" };
      case "connecting":
        return { cls: "connecting", label: "Wartet auf Minecraft RCON" };
      case "auth_failed":
        return { cls: "error", label: "RCON-Passwort falsch" };
      default:
        return { cls: "error", label: "Verbindungsfehler" };
    }
  });
  // Aktualisierung ist "alt", wenn sie mehr als 3 Intervalle zurückliegt
  const stale = $derived(
    !!s?.lastUpdate &&
      !s.paused &&
      live.now - s.lastUpdate > s.pollIntervalMs * 3 + 2000,
  );
  const tps = $derived(s?.perf?.tps?.[0] ?? null);
  const mspt = $derived(s?.perf?.mspt?.[0]?.avg ?? null);

  async function togglePause() {
    if (!s) return;
    busy = true;
    try {
      live.status = await api.setPaused(!s.paused);
    } finally {
      busy = false;
    }
  }

  function tpsColor(v: number) {
    return v >= 19 ? "var(--accent)" : v >= 15 ? "var(--warn)" : "var(--error)";
  }
  function msptColor(v: number) {
    return v <= 40 ? "var(--accent)" : v <= 50 ? "var(--warn)" : "var(--error)";
  }
</script>

<a
  class="skip-link"
  href="#main-content"
  onclick={(event) => {
    event.preventDefault();
    document.getElementById("main-content")?.focus();
  }}>{tr("Zum Inhalt")}</a
>
<header class="top">
  <div class="brand">
    <img src="/icons/icon.svg" alt="" width="26" height="26" />
    <span class="title">{tr("Serverübersicht")}</span>
    {#if s?.mock}<span class="badge mock">Mock</span>{/if}
  </div>

  <div class="status {conn.cls}" role="status" aria-live="polite">
    <span class="light"></span>
    <span class="label">{tr(conn.label)}</span>
    {#if statusMessage && conn.cls === "error"}<span class="msg">{statusMessage}</span
      >{/if}
  </div>

  <div class="meta">
    <span
      class:stale
      title={s?.lastUpdate
        ? tr("Letzte Aktualisierung {time}", { time: time(s.lastUpdate) })
        : ""}
    >
      {#if s?.paused}
        {tr("pausiert")} {s.pausedSince ? ago(s.pausedSince, live.now) : ""}
      {:else}
        {tr("Stand")} {s?.lastUpdate ? time(s.lastUpdate) : "–"}
      {/if}
    </span>
    {#if s?.online !== null && s?.online !== undefined}
      <span title={tr("Spieler online")}
        ><MinecraftIcon item="minecraft:player_head" size={16} />
        {s.online}/{s.maxPlayers ?? "?"}</span
      >
    {/if}
    {#if tps !== null}<span title={tr("TPS (letzte Minute)")}
        >TPS <b style:color={tpsColor(tps)}>{coord(tps)}</b></span
      >{/if}
    {#if mspt !== null}<span title={tr("MSPT (Durchschnitt 5 s)")}
        >MSPT <b style:color={msptColor(mspt)}>{coord(mspt)}</b></span
      >{/if}
  </div>

  <div class="actions">
    <LanguagePicker />
    {#if session.operator}
      <Button
        variant="outline"
        size="sm"
        class="pause"
        onclick={togglePause}
        disabled={busy || !s}
        aria-pressed={s?.paused ?? false}
        title={s?.paused
          ? tr("Automatische Abfragen fortsetzen")
          : tr("Alle automatischen RCON-Abfragen pausieren")}
      >
        {s?.paused ? tr("▶ Fortsetzen") : tr("⏸ Pausieren")}
      </Button>
    {/if}
  </div>
</header>
{#if s?.paused}
  <div class="banner paused">
    {tr(
      "Automatische Abfragen sind pausiert. Online-Zeiten werden in dieser Zeit als „unbekannt“ gespeichert. Die Konsole funktioniert weiter.",
    )}
  </div>
{:else if conn.cls === "error"}
  <div class="banner error">
    {tr(conn.label)}{statusMessage ? `: ${statusMessage}` : ""}{tr(
      ". Es wird automatisch neu verbunden. Angezeigt wird der letzte bekannte Stand.",
    )}
  </div>
{:else if stale}
  <div class="banner warn">
    {tr("Letzte Aktualisierung {time}", { time: ago(s?.lastUpdate, live.now) })}
  </div>
{/if}

<style>
  .top {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 14px;
    padding: calc(17px + var(--safe-top)) 32px 17px;
    background: #0e1219ed;
    backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--border);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-dim);
  }
  .brand img {
    display: none;
  }
  .badge.mock {
    color: var(--warn);
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    font-weight: 600;
  }
  .light {
    width: 7px;
    height: 7px;
    border-radius: 100%;
    background: currentColor;
  }
  .ok {
    color: var(--accent);
  }
  .error {
    color: var(--error);
  }
  .paused {
    color: var(--warn);
  }
  .connecting {
    color: var(--info);
  }
  .msg {
    display: none;
  }
  .meta {
    display: flex;
    gap: 14px;
    color: var(--text-dim);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .meta > span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .meta .stale {
    color: var(--warn);
  }
  .actions {
    margin-left: auto;
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .banner {
    padding: 12px 32px;
    font-size: 13px;
    border-bottom: 1px solid var(--border);
  }
  .banner.paused,
  .banner.warn {
    background: #302816;
    color: var(--warn);
  }
  .banner.error {
    background: #311b21;
    color: #ffb1b6;
  }
  .skip-link {
    position: fixed;
    top: -100px;
    left: 16px;
    z-index: 100;
    background: var(--panel);
    padding: 12px;
  }
  .skip-link:focus {
    top: 12px;
  }
  @media (max-width: 1200px) {
    .meta {
      width: 100%;
      order: 4;
    }
  }
  @media (max-width: 900px) {
    .top {
      padding: calc(12px + var(--safe-top)) calc(16px + var(--safe-right)) 12px
        calc(16px + var(--safe-left));
      gap: 10px;
    }
    .title {
      display: none;
    }
    .brand img {
      display: block;
    }
    .banner {
      padding: 12px 16px;
    }
  }
  @media (max-width: 420px) {
    .top {
      gap: 8px;
    }
    .actions {
      gap: 6px;
    }
    .brand img {
      width: 22px;
      height: 22px;
    }
    .status {
      font-size: 11px;
    }
    .badge.mock {
      display: none;
    }
  }
</style>
