<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";
  let {
    title,
    description,
    icon,
    actions,
  }: { title: string; description: string; icon: string; actions?: Snippet } =
    $props();
</script>

<header class="page-heading">
  <div class="page-title">
    <span class="page-icon"><Icon name={icon} size={23} /></span>
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  </div>
  {#if actions}<div class="page-actions">{@render actions()}</div>{/if}
</header>
