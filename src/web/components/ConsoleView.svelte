<script lang="ts">
  import { onMount, tick } from "svelte";
  import { t as tr, language } from "../lib/i18n.svelte";
  import { consoleSegments } from "../../shared/console-text";
  import {
    completeCommand,
    applyCompletion,
    needsItemCompletion,
    type Completion,
  } from "../../shared/console-completion";
  import type { ItemInfo } from "../../shared/types";
  import { dangerousReason } from "../../shared/dangerous";
  import { api, ApiError } from "../lib/api";
  import { coord, time } from "../lib/format";
  import { live } from "../lib/live.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import McText from "./McText.svelte";
  import PageHeader from "./ui/PageHeader.svelte";
  import Button from "./ui/Button.svelte";
  import Icon from "./ui/Icon.svelte";
  const id = $props.id();
  const HISTORY_KEY = "mcdash.console.history";
  let input = $state("");
  let cursor = $state(0);
  let busy = $state(false);
  let history = $state<string[]>(loadHistory());
  let histIndex = $state(-1);
  let draft = "";
  let confirm = $state<{ command: string; reason: string } | null>(null);
  let out = $state<HTMLDivElement>();
  let inputEl = $state<HTMLInputElement>();
  let showColors = $state(true);
  let follow = $state(true);
  let filter = $state("");
  let focused = $state(false);
  let dismissed = $state(false);
  let active = $state(-1);
  let historyMode = $state(false);
  let items = $state<ItemInfo[]>([]);
  let itemLocale = "";
  const catalogs = new Map<string, Promise<ItemInfo[]>>();
  const KIND: Record<Completion["kind"], string> = {
    command: "Befehl",
    argument: "Argument",
    player: "Spieler",
    item: "Item",
    history: "Verlauf",
  };
  const suggestions = $derived(
    historyMode
      ? [...new Set([...history].reverse())]
          .slice(0, 8)
          .map((value): Completion => ({
            value,
            label: value,
            start: 0,
            end: input.length,
            description: "Verlauf",
            kind: "history",
          }))
      : completeCommand(input, cursor, {
          players: live.players,
          history,
          items,
        }),
  );
  const expanded = $derived(
    focused && !dismissed && suggestions.length > 0 && !busy && !confirm,
  );
  const renderedEntries = $derived(
    live.console.map((entry) => {
      const segments = consoleSegments(entry.output);
      const plain = segments.map((segment) => segment.text).join("");
      return {
        ...entry,
        segments,
        plain,
        searchText: `${entry.command} ${plain}`.toLowerCase(),
      };
    }),
  );
  const entries = $derived(
    renderedEntries.filter((entry) =>
      entry.searchText.includes(filter.trim().toLowerCase()),
    ),
  );

  onMount(() => {
    void live.loadConsole();
  });
  $effect(() => {
    if (!needsItemCompletion(input, cursor)) return;
    const locale = language.locale;
    if (itemLocale === locale) return;
    let current = true;
    let pending = catalogs.get(locale);
    if (!pending) {
      pending = api.items(locale).catch((error) => {
        catalogs.delete(locale);
        throw error;
      });
      catalogs.set(locale, pending);
    }
    pending
      .then((catalog) => {
        if (current) {
          items = catalog;
          itemLocale = locale;
        }
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  });
  $effect(() => {
    void entries.length;
    if (!follow) return;
    void tick().then(() => {
      if (out) out.scrollTop = out.scrollHeight;
    });
  });
  $effect(() => {
    if (expanded && active >= 0)
      void tick().then(() =>
        document
          .getElementById(`${id}-option-${active}`)
          ?.scrollIntoView({ block: "nearest" }),
      );
  });
  function loadHistory(): string[] {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(HISTORY_KEY) ?? "[]",
      );
      return Array.isArray(value)
        ? value
            .filter(
              (entry): entry is string =>
                typeof entry === "string" && !/[\r\n]/.test(entry),
            )
            .slice(-100)
        : [];
    } catch {
      return [];
    }
  }
  function remember(command: string) {
    if (history[history.length - 1] !== command)
      history = [...history, command].slice(-100);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      /* Storage is optional. */
    }
  }
  async function run(command: string, confirmed = false) {
    if (busy) return;
    busy = true;
    dismissed = true;
    follow = true;
    try {
      live.addConsole(await api.console(command, confirmed));
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.body.needsConfirmation)
        confirm = { command, reason: String(e.body.reason ?? "") };
      else
        live.addConsole({
          id: -Date.now(),
          at: Date.now(),
          command,
          output: tr("Fehler: {message}", { message: (e as Error).message }),
          ok: false,
          durationMs: 0,
        });
    } finally {
      busy = false;
      if (!confirm) inputEl?.focus();
    }
  }
  function submit(event: Event) {
    event.preventDefault();
    if (expanded && active >= 0 && suggestions[active]) {
      void choose(suggestions[active]!);
      return;
    }
    const command = input.trim().replace(/^\/+/, "");
    if (!command || busy || confirm) return;
    remember(command);
    histIndex = -1;
    historyMode = false;
    input = "";
    cursor = 0;
    active = -1;
    dismissed = true;
    const reason = dangerousReason(command, [], 0, language.locale);
    if (reason) {
      confirm = { command, reason };
      return;
    }
    void run(command);
  }
  async function choose(suggestion: Completion) {
    const completion = applyCompletion(input, suggestion);
    input = completion.value;
    cursor = completion.cursor;
    dismissed = true;
    active = -1;
    historyMode = false;
    histIndex = -1;
    await tick();
    inputEl?.focus();
    inputEl?.setSelectionRange(cursor, cursor);
  }
  function update(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    input = target.value;
    cursor = target.selectionStart ?? input.length;
    dismissed = false;
    active = -1;
    historyMode = false;
    histIndex = -1;
  }
  function historyStep(direction: -1 | 1) {
    if (!history.length) return;
    if (histIndex === -1) {
      if (direction === 1) return;
      draft = input;
      histIndex = history.length - 1;
    } else histIndex += direction;
    if (histIndex >= history.length) {
      histIndex = -1;
      input = draft;
    } else {
      histIndex = Math.max(0, histIndex);
      input = history[histIndex] ?? "";
    }
    cursor = input.length;
    dismissed = true;
    active = -1;
    void tick().then(() => inputEl?.setSelectionRange(cursor, cursor));
  }
  function onKey(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === "Escape") {
      dismissed = true;
      historyMode = false;
      active = -1;
      return;
    }
    if (
      event.key === "Tab" &&
      !event.shiftKey &&
      expanded &&
      suggestions.length
    ) {
      event.preventDefault();
      void choose(suggestions[Math.max(0, active)]!);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      if (expanded)
        active =
          (active +
            (event.key === "ArrowDown" ? 1 : active < 0 ? 0 : -1) +
            suggestions.length) %
          suggestions.length;
      else if (dismissed && input && suggestions.length && histIndex === -1) {
        dismissed = false;
        active = 0;
      } else historyStep(event.key === "ArrowUp" ? -1 : 1);
    }
  }
  async function showHistory() {
    historyMode = true;
    dismissed = false;
    active = -1;
    await tick();
    inputEl?.focus();
  }
</script>

<PageHeader
  title={tr("Konsole")}
  description={tr("Befehle senden und RCON-Antworten live verfolgen.")}
  icon="console"
/>
<div class="console">
  <div class="console-toolbar">
    <div class="quick">
      {#each ["list", "tps", "mspt", "version", "help"] as command}<Button
          variant="outline"
          size="sm"
          onclick={() => {
            remember(command);
            void run(command);
          }}
          disabled={busy || !!confirm}
          ><span class="mono">{command}</span></Button
        >{/each}
    </div>
    <span class="badge"
      ><span class="dot" class:on={live.liveConnected}></span>{tr(
        live.liveConnected ? "Verbunden" : "Verbinde …",
      )}</span
    >
  </div>
  {#if live.status?.paused}<div class="notice warning">
      {tr(
        "Automatische Abfragen sind pausiert – manuelle Befehle funktionieren trotzdem.",
      )}
    </div>{/if}
  {#if live.consoleError}<div class="notice error" role="alert">
      {tr("Konsolenverlauf konnte nicht geladen werden.")}
      <Button size="sm" variant="outline" onclick={() => live.loadConsole()}
        >{tr("Erneut versuchen")}</Button
      >
    </div>{/if}
  <div class="terminal">
    <div class="terminal-toolbar">
      <label class="inline-search"
        ><Icon name="search" size={15} /><input
          type="search"
          placeholder={tr("Ausgabe durchsuchen")}
          aria-label={tr("Ausgabe durchsuchen")}
          bind:value={filter}
        /></label
      >
      <div class="terminal-options">
        <label class="switch-label"
          ><input type="checkbox" bind:checked={showColors} />{tr(
            "Farben",
          )}</label
        ><label class="switch-label"
          ><input type="checkbox" bind:checked={follow} />{tr(
            "Ausgabe folgen",
          )}</label
        >
      </div>
    </div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to focus and scroll the log.) -->
    <div
      class="out mono"
      bind:this={out}
      role="log"
      aria-label={tr("Konsolenausgabe")}
      aria-live="polite"
      aria-relevant="additions"
      tabindex="0"
      onscroll={() => {
        if (out)
          follow = out.scrollHeight - out.scrollTop - out.clientHeight < 48;
      }}
    >
      {#each entries as entry (entry.id)}
        <article class="entry" class:failed={!entry.ok}>
          <header class="entry-header">
            <time>{time(entry.at)}</time><span class="prompt">›</span><code
              >{entry.command}</code
            ><span class="elapsed">{coord(entry.durationMs)} ms</span>
          </header>
          <div class="res" class:err={!entry.ok}>
            {#if entry.output === ""}<span class="faint"
                >{tr("(keine Ausgabe)")}</span
              >{:else if showColors}<McText
                segments={entry.segments}
              />{:else}{entry.segments
                .map((segment) => segment.text)
                .join("")}{/if}
          </div>
        </article>
      {:else}<div class="console-empty">
          <Icon name="console" size={32} />
          <h2>
            {tr(
              filter
                ? "Keine passenden Ausgaben."
                : "Bereit für deinen ersten Befehl",
            )}
          </h2>
          <p>
            {tr(
              filter
                ? "Andere Suchbegriffe ausprobieren."
                : "Noch keine Befehle. Ausgaben erscheinen hier.",
            )}
          </p>
        </div>{/each}
    </div>
    <div class="command-area">
      {#if expanded}
        <div class="completion-popup">
          <div class="completion-heading">
            {tr(historyMode ? "Verlauf" : "Vorschläge")}<span
              >{tr("Tab zum Ergänzen")}</span
            >
          </div>
          <div
            role="listbox"
            id={`${id}-suggestions`}
            aria-label={tr("Befehlsvorschläge")}
            class="suggestions"
          >
            {#each suggestions as suggestion, index (suggestion.start + ":" + suggestion.value)}<button
                type="button"
                role="option"
                tabindex="-1"
                id={`${id}-option-${index}`}
                aria-selected={active === index}
                onpointerdown={(event) => event.preventDefault()}
                onclick={() => choose(suggestion)}
                ><div>
                  <strong class="mono">{suggestion.label}</strong
                  >{#if suggestion.description}<span
                      >{suggestion.kind === "item"
                        ? suggestion.description
                        : tr(suggestion.description)}</span
                    >{/if}
                </div>
                <span class="kind">{tr(KIND[suggestion.kind])}</span></button
              >{/each}
          </div>
        </div>
      {/if}
      <form class="command-form" onsubmit={submit}>
        <span class="prompt mono">/</span><input
          bind:this={inputEl}
          value={input}
          oninput={update}
          onkeydown={onKey}
          onkeyup={() => {
            cursor = inputEl?.selectionStart ?? input.length;
          }}
          onclick={() => {
            cursor = inputEl?.selectionStart ?? input.length;
            active = -1;
          }}
          onfocus={() => (focused = true)}
          onblur={() => (focused = false)}
          class="mono"
          placeholder={tr("Befehl eingeben …")}
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          enterkeyhint="send"
          aria-label={tr("Befehl")}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={`${id}-suggestions`}
          aria-activedescendant={expanded && active >= 0 && suggestions[active]
            ? `${id}-option-${active}`
            : undefined}
          aria-describedby={`${id}-command-help`}
          disabled={busy || !!confirm}
        /><Button
          size="sm"
          type="submit"
          disabled={busy || !!confirm || !input.trim()}
          >{busy ? tr("Prüfe …") : tr("Senden")}</Button
        >
      </form>
      <div class="command-help" id={`${id}-command-help`}>
        <span
          >{tr(
            expanded && active >= 0
              ? "Tab ergänzt · ↑/↓ wählt · Enter übernimmt · Esc schließt"
              : "Tab ergänzt · ↑/↓ wählt · Enter sendet · Esc schließt",
          )}</span
        ><Button
          variant="ghost"
          size="sm"
          disabled={!history.length}
          onclick={showHistory}
          ><Icon name="sessions" size={14} />{tr("Verlauf")}</Button
        >
      </div>
    </div>
  </div>
  <p class="console-note">
    {tr("Lokale Vorschläge; verfügbare Befehle hängen vom Server ab.")}
  </p>
</div>
<ConfirmDialog
  open={!!confirm}
  title={tr("Befehl bestätigen")}
  message={confirm
    ? tr(
        "Dieser Befehl ist potenziell gefährlich: {reason}. Wirklich ausführen?",
        { reason: confirm.reason },
      )
    : ""}
  detail={confirm ? "/" + confirm.command : ""}
  onconfirm={() => {
    const pending = confirm;
    confirm = null;
    if (pending) void run(pending.command, true);
  }}
  oncancel={() => {
    confirm = null;
    void tick().then(() => inputEl?.focus());
  }}
/>

<style>
  .console {
    display: flex;
    flex-direction: column;
    gap: 14px;
    height: clamp(460px, calc(100dvh - 240px), 900px);
  }
  .console-toolbar,
  .quick {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .console-toolbar {
    justify-content: space-between;
  }
  .terminal {
    display: flex;
    flex: 1;
    min-height: 350px;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: #0a1019;
    box-shadow: 0 12px 36px #0002;
  }
  .terminal-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 16px;
    background: #121a25;
    border-radius: var(--radius) var(--radius) 0 0;
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }
  .terminal-toolbar .inline-search {
    border: 0;
    background: transparent;
    padding: 0;
    flex: 1;
    min-width: min(180px, 100%);
  }
  .terminal-options {
    display: flex;
    gap: 16px;
  }
  .terminal-options .switch-label {
    font-size: 11px;
    gap: 6px;
  }
  .terminal-options input {
    appearance: auto;
    width: auto;
    height: auto;
    padding: 0;
  }
  .terminal-options input::before {
    content: none;
  }
  .out {
    flex: 1;
    min-height: 140px;
    overflow: auto;
    padding: 18px;
    font-size: 12px;
    line-height: 1.7;
    color: #dce3ed;
  }
  .entry {
    padding: 12px 0;
    border-bottom: 1px solid #ffffff08;
  }
  .entry:first-child {
    padding-top: 0;
  }
  .entry-header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    font-size: 12px;
  }
  .entry-header time {
    color: var(--text-faint);
    font-size: 10px;
    white-space: nowrap;
  }
  .entry-header code {
    color: #a6c4ff;
    min-width: 0;
    overflow-wrap: anywhere;
    flex: 1;
  }
  .elapsed {
    color: var(--text-faint);
    font-size: 10px;
    flex: none;
  }
  .prompt {
    color: var(--accent);
  }
  .res {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    margin: 6px 0 0 72px;
  }
  .res.err {
    color: #ff8c8c;
  }
  .command-area {
    position: relative;
    border-top: 1px solid var(--border);
    padding: 14px 16px 4px;
  }
  .command-form {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .command-form input {
    min-width: 0;
    flex: 1;
    border: 0;
    padding: 10px 0;
    font-size: 14px;
    background: transparent;
  }
  .command-help {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 10px;
    color: var(--text-faint);
  }
  .console-note {
    margin: 0;
    color: var(--text-faint);
    font-size: 11px;
  }
  .console-empty {
    display: grid;
    place-items: center;
    align-content: center;
    height: 100%;
    min-height: 160px;
    text-align: center;
    color: var(--text-faint);
  }
  .console-empty h2 {
    font-family: var(--font);
    font-size: 15px;
    color: var(--text-dim);
    margin-top: 16px;
  }
  .console-empty p {
    font-family: var(--font);
    font-size: 12px;
  }
  .completion-popup {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 10px;
    right: 10px;
    z-index: 20;
    border: 1px solid #42546b;
    background: #172231;
    border-radius: 12px;
    box-shadow: 0 8px 30px #0006;
    overflow: hidden;
  }
  .completion-heading {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 14px;
    font-size: 11px;
    color: var(--text-dim);
    border-bottom: 1px solid var(--border);
  }
  .completion-heading span {
    color: var(--text-faint);
  }
  .suggestions {
    max-height: 260px;
    overflow-y: auto;
    padding: 5px;
  }
  .suggestions button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 0;
    width: 100%;
    text-align: left;
    padding: 10px;
    border-radius: 7px;
    background: transparent;
  }
  .suggestions button:hover,
  .suggestions button[aria-selected="true"] {
    background: #78d5a31a;
  }
  .suggestions strong {
    display: block;
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .suggestions button > div {
    min-width: 0;
  }
  .suggestions button > div > span {
    display: block;
    margin-top: 3px;
    font-size: 11px;
    color: var(--text-dim);
  }
  .kind {
    flex: none;
    color: var(--text-faint);
    font-size: 10px;
  }
  @media (max-width: 600px) {
    .terminal-toolbar,
    .command-area {
      padding-left: 12px;
      padding-right: 12px;
    }
    .out {
      padding: 12px;
    }
    .res {
      margin-left: 0;
    }
    .command-form {
      gap: 8px;
    }
    .command-form input {
      font-size: 16px;
    }
    .elapsed {
      display: none;
    }
    .console {
      height: max(500px, calc(100dvh - 270px));
    }
    .terminal-options {
      gap: 10px;
    }
  }
</style>
