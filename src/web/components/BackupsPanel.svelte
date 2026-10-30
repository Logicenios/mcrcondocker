<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { coord, dateTime } from "../lib/format";
  import { t } from "../lib/i18n.svelte";
  import Panel from "./ui/Panel.svelte";
  import Button from "./ui/Button.svelte";
  import Icon from "./ui/Icon.svelte";
  let backups = $state<Awaited<ReturnType<typeof api.backups>>>([]);
  let busy = $state(false);
  let loading = $state(true);
  let error = $state("");
  onMount(() => {
    void load();
  });
  async function load() {
    loading = true;
    try {
      backups = await api.backups();
      error = "";
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }
  async function create() {
    if (busy) return;
    busy = true;
    error = "";
    try {
      await api.createBackup();
      await load();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<Panel
  title={t("Datenbanksicherungen")}
  description={t(
    "Sicherungen werden mit SQLite erstellt und geprüft. Sie enthalten auch Benutzer und Einstellungen.",
  )}
  icon="backup"
>
  {#snippet actions()}<Button
      size="sm"
      disabled={busy || loading}
      onclick={create}
      ><Icon name="backup" size={16} />{busy
        ? t("Sicherung läuft …")
        : t("Sicherung erstellen")}</Button
    >{/snippet}
  {#if error}<div class="notice error" role="alert">
      {error}
      <Button size="sm" variant="outline" onclick={load}
        >{t("Erneut versuchen")}</Button
      >
    </div>{/if}
  {#if loading}<p class="muted" role="status">{t("Lade …")}</p>{:else}
    <ul class="backups">
      {#each backups as backup (backup.name)}<li>
          <span class="backup-icon"><Icon name="backup" size={21} /></span>
          <div class="backup-info">
            <strong>{dateTime(backup.createdAt)}</strong><span class="mono"
              >{backup.name}</span
            >
          </div>
          <span class="size">{coord(backup.bytes / 1024)} KiB</span><Button
            variant="outline"
            size="sm"
            href={`/api/backups/${encodeURIComponent(backup.name)}`}
            download>{t("Herunterladen")}</Button
          >
        </li>{:else}<li class="empty">
          <Icon name="backup" size={24} /><span
            >{t("Noch keine Sicherungen.")}</span
          >
        </li>{/each}
    </ul>
  {/if}
  <details>
    <summary>{t("Wiederherstellung")}</summary>
    <p class="help-text">
      {t(
        "Die Wiederherstellung erfolgt bei gestopptem Dashboard über das Backup-Werkzeug. Sie ersetzt niemals eine vorhandene Datei.",
      )}
    </p>
  </details>
</Panel>

<style>
  .backups {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  li {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 14px;
    padding: 16px 0;
    border-bottom: 1px solid var(--border);
  }
  li:first-child {
    padding-top: 0;
  }
  li:last-child {
    border-bottom: 0;
  }
  .backup-icon {
    color: var(--accent);
    background: #78d5a310;
    padding: 10px;
    border-radius: 10px;
  }
  .backup-info {
    flex: 1;
    min-width: 150px;
    font-size: 13px;
  }
  .backup-info span {
    display: block;
    color: var(--text-faint);
    font-size: 11px;
    margin-top: 5px;
    overflow-wrap: anywhere;
  }
  .size {
    color: var(--text-dim);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .empty {
    color: var(--text-dim);
    justify-content: center;
    padding: 24px;
    font-size: 13px;
  }
  details {
    border-top: 1px solid var(--border);
    padding-top: 16px;
    margin-top: 10px;
  }
  summary {
    cursor: pointer;
    font-size: 13px;
    color: var(--text-dim);
  }
  @media (max-width: 500px) {
    .backup-icon {
      display: none;
    }
    .backup-info {
      flex-basis: 100%;
    }
  }
</style>
