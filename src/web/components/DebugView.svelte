<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { formatDiagnostic } from "../../shared/diagnostic-messages";
  import { t as tr, language } from "../lib/i18n.svelte";
  import { api } from "../lib/api";
  import { coord, dateTime, time } from "../lib/format";
  import PageHeader from "./ui/PageHeader.svelte";
  import Panel from "./ui/Panel.svelte";
  import Button from "./ui/Button.svelte";
  import Icon from "./ui/Icon.svelte";
  type Debug = Awaited<ReturnType<typeof api.debug>>;
  let data = $state<Debug | null>(null);
  let dataLocale = $state("");
  let error = $state("");
  let auto = $state(true);
  let loading = $state(false);
  let clearing = $state(false);
  let copied = $state("");
  let copyError = $state(false);
  let filter = $state("");
  let rawKind = $state("all");
  let openKinds = $state<Record<string, boolean>>({ list: true });
  let request = 0;
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  async function load() {
    const current = ++request,
      locale = language.locale;
    loading = true;
    try {
      const result = await api.debug();
      if (current === request) {
        data = result;
        dataLocale = locale;
        error = "";
      }
    } catch (e) {
      if (current === request) error = (e as Error).message;
    } finally {
      if (current === request) loading = false;
    }
  }
  $effect(() => {
    void language.locale;
    const refresh = auto;
    untrack(() => {
      void load();
    });
    const interval = refresh ? setInterval(load, 5000) : undefined;
    return () => {
      clearInterval(interval);
      request++;
    };
  });
  onDestroy(() => {
    request++;
    clearTimeout(copyTimer);
  });
  async function clearWarnings() {
    clearing = true;
    try {
      await api.clearWarnings();
      await load();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      clearing = false;
    }
  }
  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = key;
      copyError = false;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied = ""), 1500);
    } catch {
      copied = "";
      copyError = true;
    }
  }
  const KIND_LABEL: Record<string, string> = {
    list: "Online-Liste (list uuids)",
    player: "Spielerdaten",
    "player-fallback": "Spielerdaten (Rückfallweg)",
    tps: "TPS",
    mspt: "MSPT",
    console: "Konsole",
    world: "Welt",
    action: "Aktion",
  };
  const STATE_LABEL: Record<string, string> = {
    connected: "Verbunden",
    connecting: "Verbinde …",
    disconnected: "Getrennt",
    auth_failed: "RCON-Passwort falsch",
    stopped: "Gestoppt",
  };
  const warnings = $derived(
    data?.warnings.filter((warning) =>
      `${warning.messageData ? formatDiagnostic(language.locale, warning.messageData) : warning.message} ${warning.context ?? ""}`
        .toLowerCase()
        .includes(filter.trim().toLowerCase()),
    ) ?? [],
  );
  const responses = $derived(
    Object.entries(data?.raw ?? {}).filter(
      ([kind]) => rawKind === "all" || rawKind === kind,
    ),
  );
</script>

<div class="page-stack">
  <PageHeader
    title={tr("Selbstdiagnose")}
    description={tr(
      "Verbindung, Datenquellen und Serverantworten im Überblick.",
    )}
    icon="debug"
  >
    {#snippet actions()}<Button
        variant="outline"
        size="sm"
        href={`/api/debug/export?lang=${language.locale}`}
        download>{tr("Als JSON herunterladen")}</Button
      ><Button variant="secondary" size="sm" onclick={load} disabled={loading}
        ><Icon name="refresh" size={16} />{tr("Aktualisieren")}</Button
      >{/snippet}
  </PageHeader>
  <div class="refresh-bar">
    <label class="switch-label"
      ><input type="checkbox" role="switch" bind:checked={auto} />{tr(
        "automatisch aktualisieren",
      )}</label
    ><span
      >{tr("Aktualisierung alle {seconds} Sekunden", {
        seconds: coord(5),
      })}</span
    >
  </div>
  {#if error}<div class="notice error" role="alert">{error}</div>{/if}
  {#if !data && loading}<div class="panel muted" role="status">
      {tr("Lade …")}
    </div>{/if}
  {#if data}
    {@const snapshot = data}
    <div class="metric-grid">
      <div class="metric">
        <div class="metric-label">
          <Icon name="world" size={17} />{tr("RCON-Status")}
        </div>
        <div
          class="metric-value connection"
          class:healthy={snapshot.rcon.state === "connected"}
        >
          {tr(STATE_LABEL[snapshot.rcon.state] ?? snapshot.rcon.state)}
        </div>
        <div class="metric-note">
          {tr("Intervall")}
          {coord(snapshot.status.pollIntervalMs / 1000)} s
        </div>
      </div>
      <div class="metric">
        <div class="metric-label">
          <Icon name="console" size={17} />{tr("Befehle gesendet")}
        </div>
        <div class="metric-value">{coord(snapshot.rcon.commandsSent)}</div>
        <div class="metric-note">
          {tr("Warteschlange")}: {coord(snapshot.rcon.queueLength)}
        </div>
      </div>
      <div class="metric">
        <div class="metric-label">
          <Icon name="debug" size={17} />{tr("Hinweise und Warnungen")}
        </div>
        <div class="metric-value" class:warning={snapshot.warnings.length > 0}>
          {coord(snapshot.warnings.length)}
        </div>
        <div class="metric-note">{tr("Version")} {snapshot.version}</div>
      </div>
    </div>
    {#if snapshot.rcon.lastError}<div class="notice error">
        {snapshot.rcon.lastErrorData ? formatDiagnostic(language.locale, snapshot.rcon.lastErrorData) : snapshot.rcon.lastError}
      </div>{/if}
    {#if snapshot.status.degraded}<div class="notice warning">
        {tr("Rückfallweg aktiv: Spielerdaten nur eingeschränkt lesbar")}
      </div>{/if}
    <Panel
      title={tr("Datenquellen")}
      description={tr(
        "Diese Seite zeigt die letzten Rohantworten des Servers und alle Hinweise des Parsers. Wenn etwas nicht stimmt, lade die JSON-Datei herunter und schick sie zur Analyse – Passwörter und Serveradresse sind nicht enthalten.",
      )}
      icon="inventory"
    >
      <dl class="source-grid">
        <div>
          <dt>{tr("Texturen")}</dt>
          <dd>
            {snapshot.assets.textures
              ? `${snapshot.assets.textures} (${snapshot.assets.textureSource})`
              : tr("keine (Ersatz-Kacheln)")}
          </dd>
        </div>
        <div data-testid="catalog-language">
          <dt>{tr("Sprachdatei")}</dt>
          <dd>
            {#if dataLocale !== language.locale}<span class="muted"
                >{tr("Lade …")}</span
              >{:else if snapshot.assets.language}<code
                >{snapshot.assets.language}</code
              ><span class="badge">{coord(snapshot.assets.translations)}</span
              >{:else}{tr("keine")}{/if}
          </dd>
        </div>
        <div>
          <dt>{tr("Gestartet")}</dt>
          <dd>{dateTime(snapshot.startedAt)}</dd>
        </div>
        <div>
          <dt>{tr("Lizenzen")}</dt>
          <dd>
            <a
              href="https://github.com/Logicenios/mcrcondocker/blob/main/LICENSE"
              target="_blank"
              rel="noopener">MIT</a
            >
            ·
            <a href="/third-party-licenses.md" target="_blank" rel="noopener"
              >{tr("Drittanbieter")}</a
            >
          </dd>
        </div>
      </dl>
    </Panel>
    <Panel title={tr("Hinweise und Warnungen")} icon="debug">
      {#snippet actions()}<span class="badge"
          >{coord(snapshot.warnings.length)}</span
        >{#if snapshot.warnings.length}<Button
            variant="outline"
            size="sm"
            disabled={clearing}
            onclick={clearWarnings}>{tr("Liste leeren")}</Button
          >{/if}{/snippet}
      {#if !snapshot.warnings.length}<div class="healthy-state">
          <Icon name="check" size={22} />
          <div>
            <strong>{tr("Keine Warnungen")}</strong>
            <p>
              {tr("Keine Warnungen – alle Antworten konnten gelesen werden.")}
            </p>
          </div>
        </div>
      {:else}
        <label class="inline-search"
          ><Icon name="search" size={17} /><input
            type="search"
            aria-label={tr("Hinweise durchsuchen")}
            placeholder={tr("Hinweise durchsuchen")}
            bind:value={filter}
          /></label
        >
        <div class="warning-list">
          {#each warnings as warning (warning.key)}<article
              class="warning-entry"
            >
              <div class="warning-meta">
                <span class="level {warning.level}"
                  >{tr(
                    warning.level === "error"
                      ? "Fehler"
                      : warning.level === "warn"
                        ? "Warnung"
                        : "Hinweis",
                  )}</span
                ><span
                  >{tr("{count} Vorkommen", {
                    count: coord(warning.count),
                  })}</span
                ><time title={dateTime(warning.firstAt)}
                  >{time(warning.lastAt)}</time
                >
              </div>
              <p>
                {warning.messageData
                  ? formatDiagnostic(language.locale, warning.messageData)
                  : warning.message}
              </p>
              {#if warning.context}<pre
                  class="context mono">{warning.contextData
                    ? formatDiagnostic(language.locale, warning.contextData)
                    : warning.context}</pre>{/if}
            </article>{:else}<p class="muted">
              {tr("Keine passenden Hinweise.")}
            </p>{/each}
        </div>
      {/if}
    </Panel>
    <Panel
      title={tr("Letzte Rohantworten")}
      description={tr(
        "Originalantworten bleiben unverändert und können kopiert oder exportiert werden.",
      )}
      icon="console"
    >
      {#snippet actions()}<select
          aria-label={tr("Antworttyp")}
          bind:value={rawKind}
          ><option value="all">{tr("Alles")}</option
          >{#each Object.keys(snapshot.raw) as kind}<option value={kind}
              >{tr(KIND_LABEL[kind] ?? kind)}</option
            >{/each}</select
        >{/snippet}
      {#if copyError}<p class="notice error" role="alert">
          {tr("Kopieren fehlgeschlagen. Bitte den Text manuell markieren.")}
        </p>{/if}
      {#each responses as [kind, list] (kind)}
        <details
          class="response-group"
          open={!!openKinds[kind]}
          ontoggle={(event) => {
            openKinds[kind] = event.currentTarget.open;
          }}
        >
          <summary
            ><span>{tr(KIND_LABEL[kind] ?? kind)}</span><span class="badge"
              >{coord(list.length)}</span
            ></summary
          >
          {#if openKinds[kind]}
            {#each list as response, i (response.at + "-" + i)}
              <article class="raw">
                <header>
                  <div class="response-time">
                    {time(response.at)} · {coord(response.durationMs)} ms · {coord(
                      response.bytes,
                    )} Bytes · {tr("{count} Pakete", {
                      count: coord(response.fragments),
                    })}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onclick={() => copy(response.body, kind + i)}
                    >{copied === kind + i
                      ? tr("kopiert ✓")
                      : tr("kopieren")}</Button
                  >
                </header>
                <code class="raw-command">{response.command}</code
                >{#if response.error}<div class="notice error">
                    {response.errorData ? formatDiagnostic(language.locale, response.errorData) : response.error}
                  </div>{/if}{#if response.truncatedForDisplay}<span
                    class="level warn">{tr("gekürzt")}</span
                  >{/if}
                <pre class="mono">{response.body || tr("(leer)")}</pre>
              </article>
            {/each}
          {/if}
        </details>
      {:else}<div class="muted">{tr("Noch keine Antworten.")}</div>{/each}
    </Panel>
  {/if}
</div>

<style>
  .refresh-bar {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    color: var(--text-faint);
    font-size: 12px;
  }
  .connection {
    font-size: 22px;
    color: var(--warn);
  }
  .healthy {
    color: var(--accent);
  }
  .warning {
    color: var(--warn);
  }
  .source-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 22px;
    margin: 0;
  }
  dt {
    font-size: 12px;
    color: var(--text-faint);
    margin-bottom: 8px;
  }
  dd {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .healthy-state {
    display: flex;
    gap: 14px;
    color: var(--accent);
    padding: 12px 0;
    align-items: center;
    font-size: 14px;
  }
  .healthy-state p {
    color: var(--text-dim);
    margin: 5px 0 0;
    font-size: 13px;
  }
  .warning-list {
    margin-top: 16px;
    display: grid;
    gap: 12px;
  }
  .warning-entry {
    background: var(--bg-2);
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 10px;
    font-size: 13px;
  }
  .warning-entry p {
    line-height: 1.7;
    overflow-wrap: anywhere;
  }
  .warning-meta {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    font-size: 11px;
    color: var(--text-dim);
  }
  .warning-meta time {
    margin-left: auto;
  }
  .level {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 6px;
  }
  .level.error {
    background: #4a1714;
    color: #ffaca5;
  }
  .level.warn {
    background: #4a3510;
    color: #ffd27a;
  }
  .level.info {
    background: #12304a;
    color: #9ccfff;
  }
  .response-group {
    border: 1px solid var(--border);
    border-radius: 10px;
    margin-top: 12px;
    overflow: hidden;
  }
  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 15px;
    cursor: pointer;
    background: var(--bg-2);
    font-size: 13px;
    font-weight: 600;
    gap: 12px;
  }
  summary::before {
    content: "+";
    color: var(--accent);
  }
  details[open] > summary::before {
    content: "−";
  }
  summary > span:first-child {
    flex: 1;
  }
  .raw {
    padding: 16px;
    border-top: 1px solid var(--border);
  }
  .raw header {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .response-time {
    color: var(--text-faint);
    font-size: 11px;
  }
  .raw-command {
    display: block;
    margin: 8px 0;
    font-size: 12px;
    color: var(--info);
    overflow-wrap: anywhere;
  }
  pre {
    background: #0a1019;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px;
    max-height: 280px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 12px;
    margin: 8px 0 0;
    line-height: 1.6;
  }
  @media (max-width: 600px) {
    .source-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .metric-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .raw {
      padding: 12px;
    }
  }
</style>
