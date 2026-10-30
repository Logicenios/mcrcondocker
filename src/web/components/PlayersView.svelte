<script lang="ts">
  import { t as tr } from "../lib/i18n.svelte";
  import { live } from "../lib/live.svelte";
  import { router } from "../lib/router.svelte";
  import Icon from "./ui/Icon.svelte";
  import { coord } from "../lib/format";
  import PlayerCard from "./PlayerCard.svelte";
  const playerPage = () => import("./PlayerDetail.svelte");

  let filter = $state("");
  const selected = $derived(router.param);
  const list = $derived(
    live.players.filter(
      (p) =>
        !filter ||
        p.name.toLowerCase().includes(filter.toLowerCase()) ||
        p.uuid.startsWith(filter.toLowerCase()),
    ),
  );
  const online = $derived(list.filter((p) => p.online));
  const offline = $derived(list.filter((p) => !p.online));
</script>

<div class="page-heading" class:player-open={!!selected}>
  <div>
    <div class="eyebrow">MC-Dashboard</div>
    <h1>{tr("Spieler")}</h1>
    <p>{tr("Spieler, Ausrüstung und Inventare an einem Ort.")}</p>
  </div>
  <span class="badge"
    ><span class="dot" class:on={live.players.some((p) => p.online)}></span>{tr(
      "{online} online · {total} bekannt",
      {
        online: coord(live.players.filter((p) => p.online).length),
        total: coord(live.players.length),
      },
    )}</span
  >
</div>
<div class="layout" class:has-detail={!!selected}>
  <aside class="list">
    <label class="search-field"
      ><Icon name="search" size={17} /><input
        class="search"
        type="search"
        aria-label={tr("Spieler suchen …")}
        placeholder={tr("Spieler suchen …")}
        bind:value={filter}
      /></label
    >
    {#if live.players.length === 0}
      <div class="panel muted">{tr("Noch keine Spieler gesehen.")}</div>
    {/if}
    {#if filter && list.length === 0 && live.players.length > 0}<p
        class="no-results"
      >
        {tr("Keine passenden Spieler.")}
      </p>{/if}
    {#if online.length}
      <h3>{tr("Online")} <span>{coord(online.length)}</span></h3>
      {#each online as p (p.uuid)}
        <PlayerCard
          {p}
          active={p.uuid === selected}
          onselect={() => router.go("players", p.uuid)}
        />
      {/each}
    {/if}
    {#if offline.length}
      <h3>{tr("Offline")} <span>{coord(offline.length)}</span></h3>
      {#each offline as p (p.uuid)}
        <PlayerCard
          {p}
          active={p.uuid === selected}
          onselect={() => router.go("players", p.uuid)}
        />
      {/each}
    {/if}
  </aside>
  <section class="main">
    {#if selected}
      {#key selected}
        {#await playerPage()}<div class="panel muted" role="status">
            {tr("Lade …")}
          </div>{:then module}<module.default
            uuid={selected}
            onback={() => router.go("players")}
          />{:catch}<div class="panel" role="alert">
            {tr("Seite konnte nicht geladen werden.")}
          </div>{/await}
      {/key}
    {:else}
      <div class="empty-state">
        <Icon name="players" size={36} />
        <h2>{tr("Deine Spieler im Überblick")}</h2>
        <p>
          {tr(
            "Wähle einen Spieler aus, um Position, Werte und Inventar zu sehen.",
          )}
        </p>
        <span class="badge"
          >{tr("Offline-Daten zeigen den letzten gespeicherten Stand.")}</span
        >
      </div>
    {/if}
  </section>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: 248px minmax(0, 1fr);
    gap: 26px;
    align-items: start;
  }
  .list {
    background: #111923;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    min-width: 0;
  }
  .search-field {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    border-radius: 9px;
    padding-left: 10px;
    color: var(--text-faint);
  }
  .search {
    width: 100%;
    min-width: 0;
    background: transparent;
    border: 0;
    font-size: 13px;
    padding: 11px 8px 11px 0;
  }
  h3 {
    display: flex;
    justify-content: space-between;
    margin: 22px 8px 10px;
    font-size: 11px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }
  h3 span {
    font-variant-numeric: tabular-nums;
  }
  .main {
    min-width: 0;
  }
  .no-results {
    padding: 12px;
    color: var(--text-dim);
    font-size: 13px;
  }
  @media (min-width: 1101px) {
    :global(.detail .back) {
      display: none;
    }
    .list {
      position: sticky;
      top: 122px;
      max-height: calc(100dvh - 150px);
      overflow-y: auto;
    }
  }
  @media (max-width: 1100px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .layout.has-detail .list {
      display: none;
    }
    .layout:not(.has-detail) .main {
      display: none;
    }
  }
  @media (max-width: 900px) {
    .player-open .eyebrow,
    .player-open p,
    .player-open > .badge {
      display: none;
    }
    .player-open {
      margin-bottom: 12px;
    }
    .player-open h1 {
      font-size: 20px;
    }
  }
</style>
