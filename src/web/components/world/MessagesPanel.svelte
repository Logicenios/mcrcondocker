<script lang="ts">
  import Panel from "../ui/Panel.svelte";
  import { t as tr } from "../../lib/i18n.svelte";
  import { actions } from "../../lib/actions.svelte";
  import { live } from "../../lib/live.svelte";

  let say = $state("");
  let title = $state("");
  let subtitle = $state("");
  let target = $state("");
  let msg = $state("");

  const busy = $derived(actions.busy > 0);
  const online = $derived(live.players.filter((p) => p.online));
</script>

<div class="grid">
  <Panel
    title={tr("Chat-Nachricht an alle")}
    description={tr("Erscheint im Chat als „[Rcon] …“ bzw. „[Server] …“.")}
    icon="messages"
  >
    <form
      class="row"
      onsubmit={async (e) => {
        e.preventDefault();
        if (say.trim() && (await actions.run({ type: "say", text: say }))?.ok)
          say = "";
      }}
    >
      <input
        class="grow"
        maxlength="256"
        aria-label={tr("Chat-Nachricht")}
        placeholder={tr("Nachricht …")}
        bind:value={say}
      />
      <button class="btn primary" type="submit" disabled={busy || !say.trim()}
        >{tr("Senden")}</button
      >
    </form>
  </Panel>

  <Panel
    title={tr("Titel auf dem Bildschirm")}
    description={tr(
      "Große Einblendung in der Bildschirmmitte bei allen Spielern (ca. 5 Sekunden).",
    )}
    icon="inventory"
  >
    <form
      class="col"
      onsubmit={async (e) => {
        e.preventDefault();
        if (
          title.trim() &&
          (
            await actions.run({
              type: "title",
              text: title,
              subtitle: subtitle || undefined,
            })
          )?.ok
        ) {
          title = "";
          subtitle = "";
        }
      }}
    >
      <input
        maxlength="256"
        aria-label={tr("Titel")}
        placeholder={tr("Titel, z. B. Neustart in 5 Minuten")}
        bind:value={title}
      />
      <input
        maxlength="256"
        aria-label={tr("Untertitel")}
        placeholder={tr("Untertitel (optional)")}
        bind:value={subtitle}
      />
      <div>
        <button
          class="btn primary"
          type="submit"
          disabled={busy || !title.trim()}>{tr("Anzeigen")}</button
        >
      </div>
    </form>
  </Panel>

  <Panel
    title={tr("Private Nachricht")}
    description={tr(
      "Nachrichten an Spieler senden, ohne die Konsole zu öffnen.",
    )}
    icon="players"
  >
    <form
      class="col"
      onsubmit={async (e) => {
        e.preventDefault();
        if (
          target &&
          msg.trim() &&
          (await actions.run({ type: "msg", uuid: target, text: msg }))?.ok
        )
          msg = "";
      }}
    >
      <select bind:value={target} aria-label={tr("Empfänger")}>
        <option value="">{tr("Spieler wählen …")}</option>
        {#each online as p (p.uuid)}
          <option value={p.uuid}>{p.name}</option>
        {/each}
      </select>
      <input
        maxlength="256"
        aria-label={tr("Private Nachricht")}
        placeholder={tr("Nachricht …")}
        bind:value={msg}
      />
      <div>
        <button
          class="btn primary"
          type="submit"
          disabled={busy || !target || !msg.trim()}>{tr("Senden")}</button
        >
      </div>
    </form>
    {#if !online.length}<div class="faint small">
        {tr("Niemand online.")}
      </div>{/if}
  </Panel>
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
    gap: 20px;
  }
  .row {
    display: flex;
    gap: 6px;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .small {
    font-size: 12px;
    margin: 0;
  }
  .col input,
  .col select {
    min-width: 0;
    width: 100%;
  }
</style>
