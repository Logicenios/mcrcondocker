<script lang="ts">
  import { Tabs } from "bits-ui";
  import { t as tr } from "../lib/i18n.svelte";
  import { router } from "../lib/router.svelte";
  import PageHeader from "./ui/PageHeader.svelte";
  import Icon from "./ui/Icon.svelte";
  const tabs = [
    {
      id: "welt",
      label: "Welt",
      icon: "world",
      load: () => import("./world/WorldSettings.svelte"),
    },
    {
      id: "nachrichten",
      label: "Nachrichten",
      icon: "messages",
      load: () => import("./world/MessagesPanel.svelte"),
    },
    {
      id: "banns",
      label: "Bann-Liste",
      icon: "users",
      load: () => import("./world/BansPanel.svelte"),
    },
    {
      id: "protokoll",
      label: "Protokoll",
      icon: "sessions",
      load: () => import("./world/AuditLog.svelte"),
    },
  ];
  const tab = $derived(tabs.find((t) => t.id === router.param) ?? tabs[0]!);
</script>

<div class="page-stack">
  <PageHeader
    title={tr("Welt")}
    description={tr(
      "Welteinstellungen, Nachrichten und Serveraktionen verwalten.",
    )}
    icon="world"
  />
  <Tabs.Root
    value={tab.id}
    onValueChange={(value) => router.go("world", value)}
  >
    <Tabs.List class="section-tabs" aria-label={tr("Weltverwaltung")}>
      {#each tabs as item (item.id)}<Tabs.Trigger
          class="section-tab"
          value={item.id}
          ><Icon name={item.icon} size={17} />{tr(item.label)}</Tabs.Trigger
        >{/each}
    </Tabs.List>
    {#each tabs as item (item.id)}
      <Tabs.Content value={item.id} class="world-content">
        {#if tab.id === item.id}
          {#await item.load()}<div class="panel muted" role="status">
              {tr("Lade …")}
            </div>{:then module}<module.default />{:catch}<div
              class="notice error"
              role="alert"
            >
              {tr("Seite konnte nicht geladen werden.")}
            </div>{/await}
        {/if}
      </Tabs.Content>
    {/each}
  </Tabs.Root>
</div>

<style>
  :global(.world-content) {
    margin-top: 24px;
    outline-offset: 6px;
  }
  @media (max-width: 420px) {
    :global(.world-content) {
      margin-top: 16px;
    }
    :global(.section-tab svg) {
      display: none;
    }
  }
</style>
