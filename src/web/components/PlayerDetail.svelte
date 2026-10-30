<script lang="ts">
  import { onMount } from "svelte";
  import { t as tr } from "../lib/i18n.svelte";
  import { session } from "../lib/session.svelte";
  import { gameName } from "../lib/game-text.svelte";
  import type { PlayerDetail } from "../../shared/types";
  import { api } from "../lib/api";
  import {
    ago,
    coord,
    dateTime,
    dimColor,
    dimLabel,
    duration,
    GAME_MODES,
    roman,
  } from "../lib/format";
  import { live } from "../lib/live.svelte";
  import { router } from "../lib/router.svelte";
  import Inventory from "./Inventory.svelte";
  import { Tabs } from "bits-ui";
  import Button from "./ui/Button.svelte";
  import Icon from "./ui/Icon.svelte";
  import MinecraftIcon from "./MinecraftIcon.svelte";
  const actionsPage = () => import("./PlayerActions.svelte");
  let tab = $state("inventory");
  import StatBar from "./StatBar.svelte";

  let { uuid, onback }: { uuid: string; onback?: () => void } = $props();

  let detail = $state<PlayerDetail | null>(null);
  let error = $state<string | null>(null);
  let sessionTotal = $state<number | null>(null);

  onMount(() => { live.gameNamesNeeded = true; });

  const summary = $derived(live.players.find((p) => p.uuid === uuid));

  async function load() {
    try {
      detail = await api.player(uuid);
      error = null;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  // neu laden, wenn sich der Datenstand ändert
  $effect(() => {
    void uuid;
    void summary?.snapshotAt;
    void summary?.online;
    load();
  });

  $effect(() => {
    void uuid;
    api
      .sessions(uuid)
      .then(
        (r) =>
          (sessionTotal = r.stats.find((s) => s.uuid === uuid)?.totalMs ?? 0),
      )
      .catch(() => {});
  });

  const d = $derived(detail?.data ?? null);
</script>

<div class="detail">
  {#if onback}
    <Button variant="ghost" size="sm" class="back" onclick={onback}
      >{tr("← Spieler")}</Button
    >
  {/if}
  {#if error}
    <div class="panel err" role="alert">
      {error}
      <Button variant="outline" size="sm" onclick={load}
        >{tr("Erneut versuchen")}</Button
      >
    </div>
  {:else if detail}
    <div class="head">
      <span class="player-avatar"><Icon name="players" size={25} /></span>
      <h2>{detail.name}</h2>
      <span class="dot" class:on={detail.online}></span>
      {#if detail.isBedrock}<span class="badge bedrock">Bedrock</span>{/if}
      <span class="badge">{tr(detail.online ? "Online" : "Offline")}</span>
    </div>
    <div class="stand" class:old={!detail.online}>
      {#if detail.snapshotAt}
        {tr("Stand:")}
        {dateTime(detail.snapshotAt)} ({ago(detail.snapshotAt, live.now)})
      {:else}
        {tr("Noch keine Daten gespeichert.")}
      {/if}
      {#if !detail.online && detail.lastSeen}{tr("· zuletzt gesehen")}
        {dateTime(detail.lastSeen)}{/if}
    </div>
    <div class="faint uuid mono">{detail.uuid}</div>

    {#if d}
      {#if !d.complete}
        <div class="panel warn">
          {tr(
            "Die Spielerdaten konnten nicht vollständig gelesen werden. Inventare fehlen eventuell.",
          )}
          {#if session.operator}<a href="#/debug">{tr("Debug-Seite")}</a>
            {tr("zeigt Details.")}{/if}
        </div>
      {/if}
    {:else}
      <div class="panel muted">
        {tr("Für diesen Spieler liegen noch keine Inventardaten vor.")}
      </div>
    {/if}
    <Tabs.Root bind:value={tab}>
      <Tabs.List class="player-tabs" aria-label={tr("Spielerdetails")}>
        <Tabs.Trigger class="player-tab" value="inventory"
          ><Icon name="inventory" size={17} />{tr("Inventar")}</Tabs.Trigger
        >
        {#if d}<Tabs.Trigger class="player-tab" value="stats"
            ><Icon name="sessions" size={17} />{tr(
              "Spielerdaten",
            )}</Tabs.Trigger
          >{/if}
        {#if session.operator}<Tabs.Trigger class="player-tab" value="actions"
            ><Icon name="users" size={17} />{tr("Aktionen")}</Tabs.Trigger
          >{/if}
      </Tabs.List>
      <Tabs.Content value="inventory" class="player-tab-content">
        {#if d}
          <div class="vitals" aria-label={tr("Spielerdaten")}>
            <span
              ><MinecraftIcon gui="health_full" size={18} /><strong
                >{coord(d.health)} / {coord(d.maxHealth)}</strong
              ><span>{tr("Leben")}</span></span
            >
            <span
              ><MinecraftIcon gui="food_full" size={18} /><strong
                >{coord(d.food)} / {coord(20)}</strong
              ><span>{tr("Hunger")}</span></span
            >
            <span
              ><strong class="level">{coord(d.xpLevel)}</strong><span
                >{tr("Stufe")}</span
              ></span
            >
          </div>
          <Inventory data={d} />
        {/if}
      </Tabs.Content>
      {#if d}<Tabs.Content value="stats" class="player-tab-content">
          <div class="stats panel">
            <div class="stat">
              <div class="k">{tr("Position")}</div>
              <div class="v mono">
                {coord(d.pos.x)} / {coord(d.pos.y)} / {coord(d.pos.z)}
              </div>
              <div class="sub">
                <span
                  class="badge"
                  style:color={dimColor(d.dimension)}
                  style:border-color={dimColor(d.dimension)}
                  >{dimLabel(d.dimension)}</span
                >
                <button
                  class="btn small"
                  onclick={() => router.go("map", d.dimension)}
                  >{tr("auf Karte")}</button
                >
              </div>
              {#if d.dimension === "minecraft:the_nether"}
                <div class="sub faint">
                  {tr("entspricht Oberwelt")}
                  {coord(d.pos.x * 8)} / {coord(d.pos.z * 8)}
                </div>
              {:else if d.dimension === "minecraft:overworld"}
                <div class="sub faint">
                  {tr("entspricht Nether")}
                  {coord(d.pos.x / 8)} / {coord(d.pos.z / 8)}
                </div>
              {/if}
            </div>
            <div class="stat">
              <div class="k">{tr("Leben")}</div>
              <StatBar kind="health" value={d.health} max={d.maxHealth} />
            </div>
            <div class="stat">
              <div class="k">{tr("Hunger")}</div>
              <StatBar kind="food" value={d.food} />
              <div class="sub faint">
                {tr("Sättigung")}
                {coord(d.saturation)}
              </div>
            </div>
            <div class="stat">
              <div class="k">{tr("Erfahrung")}</div>
              <div class="v">
                {tr("Stufe {level}", { level: coord(d.xpLevel) })}
              </div>
              <div class="xp">
                <span style:width={`${Math.round(d.xpProgress * 100)}%`}></span>
              </div>
            </div>
            <div class="stat">
              <div class="k">{tr("Spielmodus")}</div>
              <div class="v">{tr(GAME_MODES[d.gameMode] ?? d.gameMode)}</div>
            </div>
            {#if sessionTotal !== null}
              <div class="stat">
                <div class="k">{tr("Online-Zeit gesamt")}</div>
                <div class="v">{duration(sessionTotal)}</div>
                <div class="sub">
                  <a href="#/sessions/{detail.uuid}">{tr("Sessions ansehen")}</a
                  >
                </div>
              </div>
            {/if}
          </div>

          {#if d.effects.length}
            <div class="effects">
              {#each d.effects as e (e.id)}
                <span class="badge"
                  >{gameName(e.id, "effect", e.name)}
                  {roman(e.amplifier + 1)} · {e.duration < 0
                    ? "∞"
                    : duration((e.duration / 20) * 1000)}</span
                >
              {/each}
            </div>
          {/if}
        </Tabs.Content>{/if}
      {#if session.operator}
        <Tabs.Content value="actions" class="player-tab-content">
          {#if tab === "actions"}
            {#await actionsPage()}<p class="muted">
                {tr("Lade …")}
              </p>{:then module}<module.default {detail} data={d} />{:catch}<p
                role="alert"
              >
                {tr("Seite konnte nicht geladen werden.")}
              </p>{/await}
          {/if}
        </Tabs.Content>
      {/if}
    </Tabs.Root>
  {:else}
    <div class="panel muted" role="status">{tr("Lade …")}</div>
  {/if}
</div>

<style>
  .detail {
    min-width: 0;
  }
  .player-avatar {
    display: grid;
    place-items: center;
    height: 46px;
    width: 46px;
    background: #78d5a312;
    border: 1px solid #78d5a333;
    border-radius: 14px;
    color: var(--accent);
  }
  :global(.detail .back) {
    margin-bottom: 10px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .head h2 {
    margin: 0;
    font-size: 26px;
    letter-spacing: -0.04em;
    word-break: break-all;
  }
  .stand {
    margin-top: 4px;
    color: var(--text-dim);
    font-size: 13px;
  }
  .stand.old {
    color: var(--warn);
    font-weight: 600;
  }
  .uuid {
    font-size: 11px;
    margin: 6px 0 24px;
    word-break: break-all;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 22px 18px;
    padding: 20px;
    margin-bottom: 20px;
  }
  .k {
    color: var(--text-dim);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 3px;
  }
  .v {
    font-weight: 600;
  }
  .sub {
    margin-top: 5px;
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 12px;
    flex-wrap: wrap;
  }
  .xp {
    margin-top: 5px;
    height: 6px;
    background: #2a2f37;
    border-radius: 3px;
    overflow: hidden;
  }
  .xp span {
    display: block;
    height: 100%;
    background: #80ff20;
  }
  .effects {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }
  .panel.muted {
    margin-bottom: 20px;
  }
  .panel.warn {
    border-color: var(--warn);
    color: var(--warn);
    margin-bottom: 20px;
  }
  .panel.err {
    border-color: var(--error);
    color: var(--error);
  }
  :global(.player-tabs) {
    display: flex;
    flex-wrap: wrap;
    max-width: 100%;
    gap: 6px;
    padding: 4px;
    width: fit-content;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 11px;
    margin: 22px 0;
  }
  :global(.player-tab) {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 16px;
    min-height: 40px;
    border: 0;
    background: transparent;
    border-radius: 7px;
    color: var(--text-dim);
    font-weight: 600;
    font-size: 13px;
  }
  :global(.player-tab[data-state="active"]) {
    color: var(--text);
    background: var(--panel-2);
    box-shadow: 0 1px 5px #0003;
  }
  :global(.player-tab-content) {
    outline-offset: 6px;
  }
  .vitals {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px 24px;
    padding: 14px 18px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    margin-bottom: 18px;
    font-size: 12px;
  }
  .vitals > span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--text-dim);
  }
  .vitals strong {
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .vitals .level {
    color: var(--accent);
  }
  @media (max-width: 600px) {
    :global(.player-tabs) {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(0, 1fr);
      width: 100%;
    }
    :global(.player-tab) {
      min-width: 0;
      justify-content: center;
      padding: 9px 8px;
      white-space: normal;
      overflow-wrap: anywhere;
      text-align: center;
    }
  }
  @media (max-width: 420px) {
    .vitals {
      padding: 12px;
      gap: 10px 18px;
    }
    .vitals > span > span:last-child {
      display: none;
    }
    :global(.player-tab) {
      padding: 9px 8px;
      gap: 6px;
    }
    :global(.player-tab svg) { display: none; }
  }
</style>
