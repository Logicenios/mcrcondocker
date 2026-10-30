<script lang="ts">
  import { onMount } from "svelte";
  import Panel from "../ui/Panel.svelte";
  import { t as tr } from "../../lib/i18n.svelte";
  import type { BanLists } from "../../../shared/types";
  import { actions } from "../../lib/actions.svelte";
  import { api } from "../../lib/api";

  let bans = $state<BanLists | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);
  const busy = $derived(actions.busy > 0);

  async function load() {
    loading = true;
    try {
      bans = await api.bans();
      error = null;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
  });

  async function pardon(name: string, ip: boolean) {
    const r = await actions.run(
      ip ? { type: "pardon_ip", ip: name } : { type: "pardon", name },
    );
    if (r) await load();
  }
</script>

<Panel
  title={tr("Aktive Sperren")}
  description={tr("Spieler und IP-Adressen mit Serversperre.")}
  icon="users"
>
  {#snippet actions()}<button
      class="btn small"
      onclick={load}
      disabled={loading}>{loading ? tr("Lade …") : tr("Aktualisieren")}</button
    >{/snippet}
  {#if error}
    <div class="err">
      {tr("Bann-Liste konnte nicht gelesen werden:")}
      {error}
    </div>
  {:else if !bans}
    <div class="faint">{tr("Lade …")}</div>
  {:else}
    {#each [{ title: tr("Gebannte Spieler"), list: bans.players, ip: false }, { title: tr("Gebannte IP-Adressen"), list: bans.ips, ip: true }] as part (part.ip)}
      {#if part.title}<h3 class="sub">{part.title}</h3>{/if}
      {#if part.list.length === 0}
        <div class="faint">{tr("Keine Einträge.")}</div>
      {:else}
        <div class="scroll-x">
          <table>
            <thead
              ><tr
                ><th>{tr(part.ip ? "IP-Adresse" : "Name")}</th><th
                  >{tr("Gebannt von")}</th
                ><th>{tr("Grund")}</th><th></th></tr
              ></thead
            >
            <tbody>
              {#each part.list as b (b.target)}
                <tr>
                  <td class="mono">{b.target}</td>
                  <td>{b.source}</td>
                  <td>{b.reason}</td>
                  <td class="act"
                    ><button
                      class="btn small"
                      disabled={busy}
                      onclick={() => pardon(b.target, part.ip)}
                      >{tr("Entbannen")}</button
                    ></td
                  >
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/each}
    <p class="faint small">
      {tr("Spieler bannen: auf der Spielerseite unter „Verwaltung“.")}
    </p>
  {/if}
</Panel>

<style>
  h3 {
    margin: 0;
    color: var(--text);
  }
  .sub {
    margin-top: 22px;
    margin-bottom: 12px;
  }
  .act {
    text-align: right;
  }
  .err {
    color: var(--error);
  }
  .small {
    font-size: 12px;
    margin: 0;
  }
</style>
