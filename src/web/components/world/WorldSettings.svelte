<script lang="ts">
  import { onMount } from "svelte";
  import Panel from "../ui/Panel.svelte";
  import Button from "../ui/Button.svelte";
  import Icon from "../ui/Icon.svelte";
  import { coord } from "../../lib/format";
  import { t as tr } from "../../lib/i18n.svelte";
  import { GAMERULES } from "../../../shared/gamerules";
  import type {
    Difficulty,
    GameruleState,
    TimePreset,
    WeatherKind,
    WorldState,
  } from "../../../shared/types";
  import { actions } from "../../lib/actions.svelte";
  import { api } from "../../lib/api";

  let world = $state<WorldState | null>(null);
  let search = $state("");
  let error = $state<string | null>(null);
  let loading = $state(false);
  let numbers = $state<Record<string, string | number>>({});
  let spawn = $state({ x: "", y: "", z: "" });

  const busy = $derived(actions.busy > 0 || loading);

  async function load() {
    loading = true;
    try {
      world = await api.world();
      error = null;
      numbers = Object.fromEntries(
        world.gamerules
          .filter((g) => typeof g.value === "number")
          .map((g) => [g.key, String(g.value)]),
      );
      const s = world.worldSpawn;
      spawn = s
        ? { x: String(s.x), y: String(s.y), z: String(s.z) }
        : { x: "", y: "", z: "" };
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
  });

  /** Aktion ausführen und danach den Zustand neu lesen */
  async function run(a: Parameters<typeof actions.run>[0]) {
    const r = await actions.run(a);
    if (r) await load();
  }

  const times: { id: TimePreset; label: string; icon: string }[] = [
    { id: "morning", label: "Morgen", icon: "🌅" },
    { id: "noon", label: "Mittag", icon: "☀️" },
    { id: "evening", label: "Abend", icon: "🌇" },
    { id: "night", label: "Nacht", icon: "🌙" },
    { id: "midnight", label: "Mitternacht", icon: "🌑" },
  ];
  const weathers: { id: WeatherKind; label: string; icon: string }[] = [
    { id: "clear", label: "Klar", icon: "☀️" },
    { id: "rain", label: "Regen", icon: "🌧️" },
    { id: "thunder", label: "Gewitter", icon: "⛈️" },
  ];
  const difficulties: { id: Difficulty; label: string }[] = [
    { id: "peaceful", label: "Friedlich" },
    { id: "easy", label: "Leicht" },
    { id: "normal", label: "Normal" },
    { id: "hard", label: "Schwer" },
  ];

  /** Ticks → "13:45" (Tick 0 = 6 Uhr morgens) */
  function clock(ticks: number): string {
    const h = (Math.floor(ticks / 1000) + 6) % 24;
    const m = Math.floor(((ticks % 1000) * 60) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const rule = (key: string) => world?.gamerules.find((g) => g.key === key);
  const SPECIAL = new Set(["doDaylightCycle", "doWeatherCycle"]);
  const listed = $derived(
    GAMERULES.filter((d) => !SPECIAL.has(d.key))
      .map((d) => ({ def: d, state: rule(d.key) }))
      .filter(
        (r): r is { def: (typeof GAMERULES)[number]; state: GameruleState } =>
          !!r.state,
      ),
  );
  const filtered = $derived(
    listed.filter(({ def, state }) =>
      `${tr(def.label)} ${tr(def.hint)} ${state.name}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    ),
  );
  const missing = $derived(
    world ? GAMERULES.filter((d) => !rule(d.key)).map((d) => d.label) : [],
  );

  const num = (s: string) => Number(s.replace(",", "."));
  const spawnValid = $derived(
    [spawn.x, spawn.y, spawn.z].every(
      (v) => v.trim() !== "" && Number.isFinite(num(v)),
    ),
  );

  async function saveSpawn(clear = false) {
    if (loading || actions.busy) return;
    loading = true;
    try {
      const r = await api.setWorldSpawn(
        clear ? null : { x: num(spawn.x), y: num(spawn.y), z: num(spawn.z) },
      );
      if (world) world.worldSpawn = r.worldSpawn;
      actions.toast(
        true,
        clear ? tr("Weltspawn entfernt") : tr("Weltspawn gespeichert"),
      );
    } catch (e) {
      actions.toast(
        false,
        tr("Speichern fehlgeschlagen"),
        (e as Error).message,
      );
    } finally {
      loading = false;
    }
  }
</script>

<div class="page-stack">
  {#if error}<div class="notice error" role="alert">
      {tr("Weltdaten konnten nicht gelesen werden:")}
      {error}
      <Button size="sm" variant="outline" onclick={load}
        >{tr("Erneut versuchen")}</Button
      >
    </div>{/if}
  {#snippet toggle(key: string)}
    {@const g = rule(key)}
    {#if g && typeof g.value === "boolean"}
      <label class="switch-label"
        ><input
          type="checkbox"
          role="switch"
          checked={g.value}
          disabled={busy}
          onchange={(e) => {
            const value = e.currentTarget.checked;
            e.currentTarget.checked = g.value as boolean;
            void run({ type: "gamerule", rule: g.name, value });
          }}
        /><span>{tr(GAMERULES.find((d) => d.key === key)?.label)}</span></label
      >
    {/if}
  {/snippet}
  <div class="settings-grid">
    <Panel
      title={tr("Uhrzeit")}
      description={tr("Tageszeit und Tageszyklus festlegen.")}
      icon="sun"
    >
      {#snippet actions()}<Button
          variant="ghost"
          size="sm"
          onclick={load}
          disabled={loading}
          aria-label={tr("Weltdaten aktualisieren")}
          ><Icon name="refresh" size={16} />{tr("Aktualisieren")}</Button
        >{/snippet}
      <div class="world-clock">
        {world?.daytime != null ? clock(world.daytime) : "–"}<span
          >{world?.day != null
            ? `${tr("· Tag")} ${coord(world.day + 1)}`
            : ""}</span
        >
      </div>
      <div class="presets">
        {#each times as preset (preset.id)}<Button
            variant="secondary"
            size="sm"
            disabled={busy || !world}
            onclick={() => run({ type: "time", preset: preset.id })}
            >{tr(preset.label)}</Button
          >{/each}
      </div>
      <div class="setting-footer">{@render toggle("doDaylightCycle")}</div>
    </Panel>
    <Panel
      title={tr("Wetter")}
      description={tr("Wetter und automatischen Wetterwechsel steuern.")}
      icon="world"
    >
      <div class="current-value">
        {world?.weather
          ? tr(weathers.find((w) => w.id === world?.weather)?.label)
          : tr("unbekannt")}
      </div>
      <div class="presets">
        {#each weathers as weather (weather.id)}<Button
            variant={world?.weather === weather.id ? "default" : "secondary"}
            size="sm"
            aria-pressed={world?.weather === weather.id}
            disabled={busy || !world}
            onclick={() => run({ type: "weather", weather: weather.id })}
            >{tr(weather.label)}</Button
          >{/each}
      </div>
      {#if world && world.weather === null}<p class="help-text">
          {tr("Aktuelles Wetter konnte nicht gelesen werden.")}
        </p>{/if}
      <div class="setting-footer">{@render toggle("doWeatherCycle")}</div>
    </Panel>
    <Panel
      title={tr("Schwierigkeit")}
      description={tr("Die Schwierigkeit gilt für alle Spieler.")}
      icon="users"
    >
      <div class="presets">
        {#each difficulties as difficulty (difficulty.id)}<Button
            variant={world?.difficulty === difficulty.id
              ? "default"
              : "secondary"}
            size="sm"
            aria-pressed={world?.difficulty === difficulty.id}
            disabled={busy || !world || world.difficulty === difficulty.id}
            onclick={() =>
              run({ type: "difficulty", difficulty: difficulty.id })}
            >{tr(difficulty.label)}</Button
          >{/each}
      </div>
    </Panel>
    <Panel
      title={tr("Weltspawn")}
      description={tr(
        "Lässt sich über RCON nicht auslesen. Hier hinterlegt, erscheint auf jeder Spielerseite „Zum Weltspawn“.",
      )}
      icon="map"
    >
      <form
        onsubmit={(event) => {
          event.preventDefault();
          if (spawnValid) void saveSpawn();
        }}
      >
        <div class="coordinates">
          {#each ["x", "y", "z"] as axis}<label class="field"
              >{axis.toUpperCase()}<input
                inputmode="decimal"
                aria-label={axis.toUpperCase()}
                bind:value={spawn[axis as keyof typeof spawn]}
              /></label
            >{/each}
        </div>
        <div class="presets">
          <Button type="submit" size="sm" disabled={busy || !spawnValid}
            >{tr("Speichern")}</Button
          >{#if world?.worldSpawn}<Button
              variant="outline"
              size="sm"
              disabled={busy}
              onclick={() => saveSpawn(true)}>{tr("Entfernen")}</Button
            >{/if}
        </div>
      </form>
    </Panel>
  </div>
  <Panel
    title={tr("Spielregeln")}
    description={tr(
      "Regeln für Spieler und Welt. Änderungen werden im Protokoll erfasst.",
    )}
    icon="inventory"
  >
    {#snippet actions()}<span class="badge"
        >{coord(filtered.length)} / {coord(listed.length)}</span
      >{/snippet}
    <label class="inline-search"
      ><Icon name="search" size={17} /><input
        type="search"
        aria-label={tr("Spielregeln suchen")}
        placeholder={tr("Spielregeln suchen")}
        bind:value={search}
      /></label
    >
    {#if !world && !error}<p class="muted" role="status">{tr("Lade …")}</p>{/if}
    <div class="rules">
      {#each filtered as { def, state } (def.key)}
        <div class="rule">
          <div class="rule-label">
            <strong>{tr(def.label)}</strong>{#if def.hint}<p>
                {tr(def.hint)}
              </p>{/if}<code>{state.name}</code>
          </div>
          {#if typeof state.value === "boolean"}
            <label class="switch-label"
              ><input
                type="checkbox"
                role="switch"
                aria-label={tr(def.label)}
                checked={state.value}
                disabled={busy}
                onchange={(event) => {
                  const value = event.currentTarget.checked;
                  event.currentTarget.checked = state.value as boolean;
                  void run({ type: "gamerule", rule: state.name, value });
                }}
              /><span class="switch-value"
                >{state.value ? tr("an") : tr("aus")}</span
              ></label
            >
          {:else}
            <form
              class="rule-number"
              onsubmit={(event) => {
                event.preventDefault();
                const value = Number(numbers[def.key]);
                if (
                  String(numbers[def.key] ?? "").trim() &&
                  Number.isInteger(value)
                )
                  void run({ type: "gamerule", rule: state.name, value });
              }}
            >
              <input
                type="number"
                bind:value={numbers[def.key]}
                aria-label={tr(def.label)}
              /><Button
                size="sm"
                variant="outline"
                type="submit"
                disabled={busy ||
                  !String(numbers[def.key] ?? "").trim() ||
                  !Number.isInteger(Number(numbers[def.key])) ||
                  Number(numbers[def.key]) === state.value}
                >{tr("Setzen")}</Button
              >
            </form>
          {/if}
        </div>
      {:else}{#if world}<p class="muted">
            {tr("Keine passenden Spielregeln.")}
          </p>{/if}{/each}
    </div>
    {#if missing.length}<details class="unsupported">
        <summary
          >{tr("Nicht unterstützte Regeln")}
          <span class="badge">{coord(missing.length)}</span></summary
        >
        <p class="help-text">
          {tr("Vom Server nicht unterstützt:")}
          {missing.map((label) => tr(label)).join(", ")}
        </p>
      </details>{/if}
  </Panel>
</div>

<style>
  .settings-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
  }
  .world-clock {
    font-size: 34px;
    font-weight: 650;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
    margin-bottom: 18px;
  }
  .world-clock span {
    font-size: 13px;
    margin-left: 12px;
    color: var(--text-dim);
    letter-spacing: 0;
    font-weight: 400;
  }
  .current-value {
    font-size: 28px;
    font-weight: 650;
    margin-bottom: 20px;
  }
  .presets {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .setting-footer {
    border-top: 1px solid var(--border);
    margin-top: 20px;
    padding-top: 16px;
  }
  .coordinates {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 14px;
  }
  .rules {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 32px;
    margin-top: 14px;
  }
  .rule {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 0;
    border-bottom: 1px solid var(--border);
  }
  .rule-label {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 13px;
  }
  .rule-label p {
    color: var(--text-dim);
    margin: 5px 0;
    font-size: 12px;
    line-height: 1.5;
  }
  .rule-label code {
    display: block;
    margin-top: 5px;
    font-size: 10px;
    color: var(--text-faint);
    overflow-wrap: anywhere;
  }
  .rule-number {
    display: flex;
    align-items: center;
    flex: none;
    gap: 6px;
  }
  .rule-number input {
    width: 70px;
    min-width: 0;
  }
  .unsupported {
    margin-top: 18px;
    color: var(--text-dim);
    font-size: 13px;
  }
  summary {
    cursor: pointer;
  }
  @media (max-width: 1200px) {
    .rules {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 650px) {
    .settings-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
    }
  }
  @media (max-width: 380px) {
    .rule-number {
      flex-direction: column;
      align-items: stretch;
    }
    .switch-value {
      display: none;
    }
  }
</style>
