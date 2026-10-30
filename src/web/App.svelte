<script lang="ts">
  import { session } from "./lib/session.svelte";
  import { t as tr } from "./lib/i18n.svelte";
  import { language } from "./lib/i18n.svelte";
  import { onMount, untrack } from "svelte";
  import { api, setUnauthorizedHandler } from "./lib/api";
  import { live } from "./lib/live.svelte";
  import { router } from "./lib/router.svelte";
  import { tooltip } from "./lib/tooltip.svelte";
  import ActionHost from "./components/ActionHost.svelte";
  import ItemTooltip from "./components/ItemTooltip.svelte";
  import Login from "./components/Login.svelte";
  import Nav from "./components/Nav.svelte";
  import PlayersView from "./components/PlayersView.svelte";
  import TopBar from "./components/TopBar.svelte";

  const pages = {
    map: () => import("./components/MapView.svelte"),
    world: () => import("./components/WorldView.svelte"),
    console: () => import("./components/ConsoleView.svelte"),
    sessions: () => import("./components/SessionsView.svelte"),
    debug: () => import("./components/DebugView.svelte"),
    users: () => import("./components/UsersView.svelte"),
  };
  const page = $derived(router.view === "players" ? null : pages[router.view]);
  const allowed = $derived(
    session.operator || ["players", "map", "sessions"].includes(router.view),
  );

  $effect(() => {
    document.documentElement.lang = language.locale;
  });

  let auth = $state<"unknown" | "in" | "out">("unknown");
  let mock = $state(false);

  function loggedOut() {
    live.stop();
    session.user = null;
    auth = "out";
  }

  async function check() {
    try {
      const s = await api.session();
      mock = s.mock;
      session.user = s.user;
      auth = s.authenticated ? "in" : "out";
    } catch {
      auth = "out";
    }
  }

  async function logout() {
    await api.logout().catch(() => {});
    loggedOut();
  }

  onMount(() => {
    setUnauthorizedHandler(loggedOut);
    window.addEventListener("mcdash:logout", loggedOut);
    void check();
    return () => window.removeEventListener("mcdash:logout", loggedOut);
  });

  $effect(() => {
    if (auth !== "in") return;
    // Request headers read the locale; changing language must not restart the session.
    untrack(() => live.start());
    return () => live.stop();
  });

  $effect(() => {
    if (auth !== "in" || !live.gameNamesNeeded) return;
    const locale = language.locale;
    let current = true;
    live.translations = {};
    api
      .translations(locale)
      .then((catalog) => {
        if (current) live.translations = catalog;
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  });

  // Tooltip beim Seitenwechsel schließen
  $effect(() => {
    void router.view;
    void router.param;
    tooltip.close();
  });
</script>

{#if auth === "unknown"}
  <div class="loading muted">{tr("Lade …")}</div>
{:else if auth === "out"}
  <Login
    {mock}
    onlogin={(user) => {
      session.user = user;
      auth = "in";
    }}
  />
{:else}
  <div class="app-shell">
    <Nav onlogout={logout} />
    <div class="workspace">
      <TopBar />
      <main class="content" id="main-content" tabindex="-1">
        {#if router.view === "players"}
          <PlayersView />
        {:else if allowed && page}
          {#key router.view}
            {#await page()}
              <div class="panel muted" role="status">{tr("Lade …")}</div>
            {:then module}
              <module.default />
            {:catch}
              <div class="panel" role="alert">
                <p>{tr("Seite konnte nicht geladen werden.")}</p>
                <button class="btn" onclick={() => location.reload()}
                  >{tr("Erneut versuchen")}</button
                >
              </div>
            {/await}
          {/key}
        {:else}
          <div class="empty-state">
            <h2>{tr("Operator-Rechte erforderlich")}</h2>
            <a href="#/players">{tr("Spieler ansehen")}</a>
          </div>
        {/if}
      </main>
    </div>
  </div>
  <ItemTooltip />
  <ActionHost />
{/if}

<style>
  .loading {
    padding: 40px;
    text-align: center;
  }
  .app-shell {
    --sidebar-width: 216px;
    min-height: 100dvh;
  }
  .workspace {
    margin-left: var(--sidebar-width);
    min-width: 0;
  }
  .content {
    padding: 30px 32px 40px;
    max-width: 1600px;
    margin: 0 auto;
    outline: none;
  }
  @media (max-width: 1100px) {
    .content {
      padding: 24px;
    }
  }
  @media (max-width: 900px) {
    .workspace {
      margin-left: 0;
    }
    .content {
      padding: 22px calc(16px + var(--safe-right))
        calc(96px + var(--safe-bottom)) calc(16px + var(--safe-left));
    }
  }
</style>
