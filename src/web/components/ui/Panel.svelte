<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";
  let {
    title,
    description,
    icon,
    children,
    actions,
    class: className = "",
  }: {
    title: string;
    description?: string;
    icon?: string;
    children: Snippet;
    actions?: Snippet;
    class?: string;
  } = $props();
</script>

<section class="panel surface {className}">
  <header class="surface-heading">
    <div>
      {#if icon}<span class="surface-icon"><Icon name={icon} size={18} /></span
        >{/if}
      <h2>{title}</h2>
      {#if description}<p>{description}</p>{/if}
    </div>
    {#if actions}<div class="surface-actions">{@render actions()}</div>{/if}
  </header>
  {@render children()}
</section>
