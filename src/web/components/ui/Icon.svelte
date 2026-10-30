<script lang="ts">
  let { name, size = 20 }: { name: string; size?: number } = $props();
  const paths: Record<string, string> = {
    players:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    map: "m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3ZM9 3v15M15 6v15",
    world:
      "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18",
    console: "m5 7 5 5-5 5M13 17h6",
    sessions: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2",
    debug: "M12 8v4M12 16h.01M10 3 2 19h20L14 3Z",
    users: "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7ZM9 12l2 2 4-4",
    more: "M4 6h16M4 12h16M4 18h16",
    close: "m6 6 12 12M6 18 18 6",
    logout: "M9 3H4v18h5M9 12h12m-4-4 4 4-4 4",
    search: "M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0m-2 5 6 6",
    messages: "M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5ZM8 10h8M8 14h5",
    sun: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1",
    backup: "M4 4h13l3 3v13H4ZM8 4v6h8V4M8 20v-7h8v7",
    refresh: "M20 7v5h-5M4 17v-5h5M5 8a7 7 0 0 1 12-3l3 7M4 12l3 7a7 7 0 0 0 12-3",
    check: "m5 12 4 4 10-10",
    inventory: "M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z",
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.7"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"><path d={paths[name] ?? paths.inventory} /></svg
>
