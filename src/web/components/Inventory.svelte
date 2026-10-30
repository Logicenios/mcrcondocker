<script lang="ts">
  import { t as tr } from "../lib/i18n.svelte";
  import { live } from "../lib/live.svelte";
  import type { Item, PlayerData } from "../../shared/types";
  import ItemSlot from "./ItemSlot.svelte";

  let { data }: { data: PlayerData } = $props();

  function bySlot(
    list: Item[] | null,
    from: number,
    count: number,
  ): (Item | null)[] {
    const out: (Item | null)[] = Array.from({ length: count }, () => null);
    for (const it of list ?? []) {
      const i = it.slot - from;
      if (i >= 0 && i < count) out[i] = it;
    }
    return out;
  }

  const main = $derived(bySlot(data.inventory, 9, 27));
  const hotbar = $derived(bySlot(data.inventory, 0, 9));
  const ender = $derived(
    data.enderChest ? bySlot(data.enderChest, 0, 27) : null,
  );
</script>

{#if live.assets && !live.assets.textures}
  <p class="muted">
    {tr(
      "Keine Texturen installiert. Für korrekte Inventarsymbole: npm run assets:download.",
    )}
  </p>
{/if}
<div class="inv">
  <section
    class="inventory-panel equipment-panel"
    aria-label={tr("Ausrüstung")}
  >
    <div class="section-heading">
      <h3>{tr("Ausrüstung")}</h3>
      <span class="muted">{tr("Rüstung und Nebenhand")}</span>
    </div>
    <div class="equipment-row">
      <div class="mc-grid">
        <div class="mc-label">{tr("Rüstung")}</div>
        <div class="armor">
          <ItemSlot
            item={data.armor.head}
            equipment="head"
            placeholder={tr("Kopf")}
          />
          <ItemSlot
            item={data.armor.chest}
            equipment="chest"
            placeholder={tr("Brust")}
          />
          <ItemSlot
            item={data.armor.legs}
            equipment="legs"
            placeholder={tr("Beine")}
          />
          <ItemSlot
            item={data.armor.feet}
            equipment="feet"
            placeholder={tr("Füße")}
          />
        </div>
      </div>
      <div class="mc-grid">
        <div class="mc-label">{tr("Nebenhand")}</div>
        <ItemSlot
          item={data.offhand}
          equipment="offhand"
          placeholder={tr("Off")}
        />
      </div>
    </div>
  </section>
  <section class="inventory-panel" aria-label={tr("Inventar")}>
    <div class="section-heading">
      <h3>{tr("Inventar")}</h3>
      <span class="muted">{tr("36 Plätze")}</span>
    </div>
    <div class="mc-grid">
      <div class="mc-label">{tr("Inventar")}</div>
      <div class="rows">
        {#each main as it, i (i)}<ItemSlot item={it} />{/each}
      </div>
      <div class="gap"></div>
      <div class="mc-label">{tr("Hotbar")}</div>
      <div class="rows">
        {#each hotbar as it, i (i)}<ItemSlot
            item={it}
            selected={i === data.selectedSlot}
          />{/each}
      </div>
    </div>
  </section>
  <section class="inventory-panel" aria-label={tr("Enderkiste")}>
    <div class="section-heading">
      <h3>{tr("Enderkiste")}</h3>
      <span class="muted">{tr("27 Plätze")}</span>
    </div>
    {#if ender}
      <div class="mc-grid">
        <div class="mc-label">{tr("Enderkiste")}</div>
        <div class="rows">
          {#each ender as it, i (i)}<ItemSlot item={it} />{/each}
        </div>
      </div>
    {:else}<p class="muted">{tr("nicht verfügbar")}</p>{/if}
  </section>
</div>

<style>
  .inv {
    --slot-size: clamp(24px, calc((100vw - 92px) / 9), 40px);
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    align-items: start;
  }
  .inventory-panel {
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--panel);
    min-width: 0;
    max-width: 100%;
  }
  .equipment-panel {
    flex-basis: 100%;
  }
  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
  }
  .section-heading h3 {
    margin: 0;
    color: var(--text);
    font-size: 14px;
  }
  .section-heading span {
    font-size: 11px;
  }
  .equipment-row {
    display: flex;
    gap: 18px;
  }
  .armor {
    display: flex;
  }
  .rows {
    display: grid;
    grid-template-columns: repeat(9, var(--slot-size));
  }
  .gap {
    height: 9px;
  }
  @media (max-width: 420px) {
    .inventory-panel {
      padding: 12px;
    }
    .inv {
      gap: 14px;
    }
  }
</style>
