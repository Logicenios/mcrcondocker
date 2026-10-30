<script lang="ts">
  import { onMount } from "svelte";
  import Panel from "../ui/Panel.svelte";
  import Icon from "../ui/Icon.svelte";
  import McText from "../McText.svelte";
  import { consoleSegments } from "../../../shared/console-text";
  import { t as tr } from "../../lib/i18n.svelte";
  import type { AuditEntry } from "../../../shared/types";
  import { api } from "../../lib/api";
  import { dateTime } from "../../lib/format";
  import { live } from "../../lib/live.svelte";

  const PAGE = 100;
  let search = $state("");
  let loaded = $state<AuditEntry[]>([]);
  let more = $state(false);
  let error = $state<string | null>(null);
  let filter = $state<"all" | "action" | "console">("all");
  let openId = $state<number | null>(null);

  async function load(before?: number) {
    try {
      const page = await api.audit(PAGE, before);
      loaded = before ? [...loaded, ...page] : page;
      more = page.length === PAGE;
      error = null;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  onMount(() => {
    void load();
  });

  // neue Einträge per Live-Verbindung oben einfügen
  const entries = $derived.by(() => {
    const ids = new Set(loaded.map((e) => e.id));
    const all = [...live.audit.filter((e) => !ids.has(e.id)), ...loaded];
    return all.filter(
      (entry) =>
        (filter === "all" || entry.source === filter) &&
        `${entry.label} ${entry.command} ${entry.actor ?? ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    );
  });
</script>

<Panel
  title={tr("Aktionsprotokoll")}
  description={tr(
    "Alles, was über das Dashboard am Server ausgeführt wurde (die letzten 5000 Einträge).",
  )}
  icon="sessions"
>
  {#snippet actions()}<select bind:value={filter} aria-label={tr("Filter")}
      ><option value="all">{tr("Alles")}</option><option value="action"
        >{tr("Nur Aktionen")}</option
      ><option value="console">{tr("Nur Konsole")}</option></select
    >{/snippet}
  <label class="inline-search"
    ><Icon name="search" size={16} /><input
      type="search"
      placeholder={tr("Geladene Einträge durchsuchen")}
      aria-label={tr("Protokoll durchsuchen")}
      bind:value={search}
    /></label
  >
  {#if error}
    <div class="err">{error}</div>
  {/if}
  {#if !entries.length && !error}
    <div class="faint">
      {tr(search ? "Keine passenden Einträge." : "Noch keine Einträge.")}
    </div>
  {/if}
  <ul>
    {#each entries as e (e.id)}
      <li class:fail={!e.ok}>
        <button
          class="line"
          onclick={() => (openId = openId === e.id ? null : e.id)}
          aria-expanded={openId === e.id}
        >
          <span class="t faint">{dateTime(e.at)}</span>
          <span class="badge"
            >{e.source === "console" ? tr("Konsole") : tr("Aktion")}</span
          >
          {#if e.actor}<span class="faint">{e.actor}</span>{/if}
          <span class="lbl">{e.ok ? "" : "✕ "}{e.label}</span>
        </button>
        {#if openId === e.id}
          <div class="more">
            <div class="mono cmd">
              {e.command
                .split("\n")
                .map((c) => "/" + c)
                .join("\n")}
            </div>
            {#if e.output}<div class="mono out">
                <McText segments={consoleSegments(e.output)} />
              </div>{/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
  {#if more}
    <button
      class="btn small"
      onclick={() => load(loaded[loaded.length - 1]?.id)}
      >{tr("Ältere laden")}</button
    >
  {/if}
</Panel>

<style>
  ul {
    list-style: none;
    margin: 14px 0;
    padding: 0;
  }
  li {
    border-bottom: 1px solid var(--border);
  }
  .line {
    display: flex;
    gap: 8px;
    align-items: baseline;
    width: 100%;
    background: none;
    border: none;
    padding: 16px 2px;
    text-align: left;
    flex-wrap: wrap;
  }
  .t {
    font-size: 12px;
    white-space: nowrap;
  }
  .lbl {
    flex: 1;
    min-width: 0;
    word-break: break-word;
  }
  li.fail .lbl {
    color: var(--error);
  }
  .more {
    padding: 0 2px 8px;
    font-size: 12px;
  }
  .cmd {
    color: #9ad1ff;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .out {
    color: var(--text-dim);
    white-space: pre-wrap;
    word-break: break-word;
    margin-top: 3px;
  }
  .err {
    color: var(--error);
  }
  .line > span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
</style>
