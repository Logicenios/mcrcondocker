<script lang="ts">
  import { tick } from "svelte";
  import { session } from "../lib/session.svelte";
  import { t as tr } from "../lib/i18n.svelte";
  import { router, type View } from "../lib/router.svelte";
  import Icon from "./ui/Icon.svelte";
  import Button from "./ui/Button.svelte";
  let { onlogout }: { onlogout: () => void } = $props();
  let menuOpen = $state(false);
  let moreButton = $state<HTMLButtonElement>();
  const mobileMenu = () => import("./ui/MobileMenu.svelte");
  const returnFocus = () => {
    void tick().then(() => moreButton?.focus());
  };
  const items: { view: View; label: string }[] = [
    { view: "players", label: "Spieler" },
    { view: "map", label: "Karte" },
    { view: "sessions", label: "Zeiten" },
    { view: "world", label: "Welt" },
    { view: "console", label: "Konsole" },
    { view: "users", label: "Benutzer" },
    { view: "debug", label: "Debug" },
  ];
  const visible = $derived(
    items.filter(
      (item) =>
        session.operator || ["players", "map", "sessions"].includes(item.view),
    ),
  );
  $effect(() => {
    void router.view;
    void router.param;
    menuOpen = false;
  });
</script>

<aside class="sidebar">
  <a class="brand" href="#/players"
    ><img src="/icons/icon.svg" alt="" width="34" height="34" /><span
      >MC-Dashboard<span class="brand-sub">{tr("Serververwaltung")}</span></span
    ></a
  >
  <div class="nav-label">{tr("Arbeitsbereich")}</div>
  <nav class="desktop-nav" aria-label={tr("Hauptnavigation")}>
    {#each visible as item (item.view)}
      <a
        href="#/{item.view}"
        class:active={router.view === item.view}
        aria-current={router.view === item.view ? "page" : undefined}
        ><Icon name={item.view} /><span>{tr(item.label)}</span></a
      >
    {/each}
  </nav>
  <div class="sidebar-footer">
    <div class="account">
      <span class="avatar"
        >{session.user?.username.slice(0, 1).toUpperCase()}</span
      ><span class="min-w-0"
        ><strong class="block truncate">{session.user?.username}</strong><span
          class="muted text-xs"
          >{tr(session.operator ? "Operator" : "Betrachter")}</span
        ></span
      >
    </div>
    <Button variant="ghost" class="w-full justify-start" onclick={onlogout}
      ><Icon name="logout" size={17} />{tr("Abmelden")}</Button
    >
  </div>
</aside>

<nav class="mobile-nav" aria-label={tr("Mobile Navigation")}>
  {#each visible.slice(0, 3) as item (item.view)}
    <a
      href="#/{item.view}"
      class:active={router.view === item.view}
      aria-current={router.view === item.view ? "page" : undefined}
      ><Icon name={item.view} /><span>{tr(item.label)}</span></a
    >
  {/each}
  <button
    class="mobile-more"
    bind:this={moreButton}
    onclick={() => (menuOpen = !menuOpen)}
    aria-haspopup="dialog"
    aria-expanded={menuOpen}
    ><Icon name="more" /><span>{tr("Mehr")}</span></button
  >
</nav>
{#if menuOpen}
  {#await mobileMenu()}<div class="menu-loading" role="status">
      {tr("Lade …")}
    </div>{:then module}<module.default
      items={visible}
      {onlogout}
      {returnFocus}
      onclose={() => (menuOpen = false)}
    />{:catch}<div class="menu-loading" role="alert">
      {tr("Seite konnte nicht geladen werden.")}
    </div>{/await}
{/if}

<style>
  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: var(--sidebar-width);
    z-index: 55;
    background: #111823;
    border-right: 1px solid var(--border);
    padding: 30px 16px 18px;
    display: flex;
    flex-direction: column;
  }
  .brand {
    display: flex;
    gap: 10px;
    align-items: center;
    color: var(--text);
    text-decoration: none;
    font-weight: 750;
    font-size: 16px;
    letter-spacing: -0.03em;
    padding: 0 8px 36px;
  }
  .brand-sub {
    display: block;
    color: var(--text-faint);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0;
    margin-top: 3px;
  }
  .nav-label {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 10px;
    font-weight: 700;
    color: var(--text-faint);
    padding: 0 14px 12px;
  }
  .desktop-nav {
    display: grid;
    gap: 5px;
  }
  .desktop-nav a {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 9px;
    text-decoration: none;
    color: var(--text-dim);
    font-size: 14px;
    font-weight: 550;
  }
  .desktop-nav a:hover {
    background: var(--panel);
    color: var(--text);
  }
  .desktop-nav a.active {
    color: var(--accent);
    background: #78d5a312;
    box-shadow: inset 3px 0 var(--accent);
  }
  .sidebar-footer {
    margin-top: auto;
    border-top: 1px solid var(--border);
    padding-top: 18px;
  }
  .account {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 8px 12px;
    font-size: 13px;
  }
  .avatar {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    color: var(--accent);
    background: #78d5a318;
    flex: none;
  }
  .mobile-nav {
    display: none;
  }
  .menu-loading {
    position: fixed;
    bottom: 90px;
    left: 16px;
    right: 16px;
    z-index: 80;
    background: var(--panel);
    padding: 16px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }
  @media (max-width: 900px) {
    .sidebar {
      display: none;
    }
    .mobile-nav {
      display: flex;
      position: fixed;
      inset: auto 0 0;
      z-index: 60;
      border-top: 1px solid var(--border);
      background: #111823f5;
      backdrop-filter: blur(16px);
      padding: 7px calc(8px + var(--safe-right)) calc(7px + var(--safe-bottom))
        calc(8px + var(--safe-left));
    }
    .mobile-nav a,
    .mobile-more {
      display: flex;
      flex: 1;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 6px 2px;
      min-height: 48px;
      color: var(--text-dim);
      text-decoration: none;
      background: transparent;
      border: 0;
      font-size: 11px;
    }
    .mobile-nav a.active {
      color: var(--accent);
    }
  }
</style>
