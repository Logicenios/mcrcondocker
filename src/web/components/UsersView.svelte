<script lang="ts">
  import { onMount } from "svelte";
  import BackupsPanel from "./BackupsPanel.svelte";
  import PageHeader from "./ui/PageHeader.svelte";
  import Panel from "./ui/Panel.svelte";
  import Button from "./ui/Button.svelte";
  import Icon from "./ui/Icon.svelte";
  import { api } from "../lib/api";
  import { session } from "../lib/session.svelte";
  import { coord } from "../lib/format";
  import { t } from "../lib/i18n.svelte";
  import type { DashboardUser, UserRole } from "../../shared/users";
  type Draft = { role: UserRole; enabled: boolean; password: string };
  let users = $state<DashboardUser[]>([]);
  let drafts = $state<Record<number, Draft>>({});
  let username = $state("");
  let password = $state("");
  let role = $state<UserRole>("viewer");
  let search = $state("");
  let error = $state("");
  let success = $state<{ key: string; name: string } | null>(null);
  let loading = $state(true);
  let busy = $state(false);
  const filtered = $derived(
    users.filter((user) =>
      user.username.toLowerCase().includes(search.trim().toLowerCase()),
    ),
  );
  const draftOf = (user: DashboardUser): Draft => ({
    role: user.role,
    enabled: user.enabled,
    password: "",
  });
  onMount(() => {
    void load();
  });
  async function load() {
    loading = true;
    error = "";
    try {
      users = await api.users();
      for (const user of users) drafts[user.id] ??= draftOf(user);
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
    success = null;
    try {
      const user = await api.createUser(username, password, role);
      users = [...users, user];
      drafts[user.id] = draftOf(user);
      username = "";
      password = "";
      success = { key: "Benutzer {name} erstellt", name: user.username };
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function save(user: DashboardUser) {
    if (busy) return;
    const draft = drafts[user.id];
    if (!draft) return;
    busy = true;
    error = "";
    success = null;
    try {
      const updated = await api.updateUser(
        user.id,
        draft.role,
        draft.enabled,
        draft.password || undefined,
      );
      users = users.map((entry) => (entry.id === user.id ? updated : entry));
      drafts[user.id] = draftOf(updated);
      success = { key: "Benutzer {name} gespeichert", name: user.username };
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<div class="page-stack">
  <PageHeader
    title={t("Benutzer")}
    description={t("Zugriff auf dein Dashboard verwalten und Daten sichern.")}
    icon="users"
  />
  {#if error}<div class="notice error" role="alert">
      {error}<Button
        size="sm"
        variant="outline"
        onclick={load}
        disabled={loading}>{t("Aktualisieren")}</Button
      >
    </div>{/if}
  {#if success}<div class="notice success" role="status">
      {t(success.key, { name: success.name })}
    </div>{/if}
  <div class="metric-grid">
    <div class="metric">
      <div class="metric-label">
        <Icon name="players" size={17} />{t("Benutzer")}
      </div>
      <div class="metric-value">{loading ? "–" : coord(users.length)}</div>
    </div>
    <div class="metric">
      <div class="metric-label">
        <Icon name="users" size={17} />{t("Operator")}
      </div>
      <div class="metric-value">
        {loading
          ? "–"
          : coord(
              users.filter((user) => user.enabled && user.role === "operator")
                .length,
            )}
      </div>
      <div class="metric-note">{t("Server und Dashboard verwalten")}</div>
    </div>
    <div class="metric">
      <div class="metric-label">
        <Icon name="players" size={17} />{t("Betrachter")}
      </div>
      <div class="metric-value">
        {loading
          ? "–"
          : coord(
              users.filter((user) => user.enabled && user.role === "viewer")
                .length,
            )}
      </div>
      <div class="metric-note">{t("Lesender Zugriff")}</div>
    </div>
  </div>
  <div class="accounts-layout">
    <Panel
      title={t("Benutzer erstellen")}
      description={t("Ein eigenes Konto für jedes Teammitglied.")}
      icon="players"
    >
      <form
        class="create-form"
        onsubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <label class="field"
          >{t("Benutzername")}<input
            bind:value={username}
            autocomplete="off"
            pattern={"[a-zA-Z0-9](?:[a-zA-Z0-9_.]|-){0,39}"}
            maxlength="40"
            required
          /></label
        >
        <label class="field"
          >{t("Passwort")}<input
            type="password"
            bind:value={password}
            autocomplete="new-password"
            minlength="8"
            maxlength="1024"
            required
          /></label
        >
        <label class="field"
          >{t("Rolle")}<select aria-label={t("Rolle")} bind:value={role}
            ><option value="viewer">{t("Betrachter")}</option><option
              value="operator">{t("Operator")}</option
            ></select
          ><small
            >{t(
              role === "viewer"
                ? "Lesender Zugriff"
                : "Server und Dashboard verwalten",
            )}</small
          ></label
        >
        <Button type="submit" disabled={busy || loading}
          >{t("Benutzer erstellen")}</Button
        >
      </form>
      <p class="help-text">
        {t(
          "Betrachter sehen Spieler, Inventare, Karte und Online-Zeiten. Operatoren dürfen den Server verwalten.",
        )}
      </p>
    </Panel>
    <Panel
      title={t("Konten")}
      description={t(
        "Änderungen an Passwort, Rolle oder Aktivierung beenden die Sitzungen dieses Benutzers.",
      )}
      icon="users"
    >
      <label class="inline-search"
        ><Icon name="search" size={17} /><input
          type="search"
          aria-label={t("Benutzer suchen")}
          placeholder={t("Benutzer suchen")}
          bind:value={search}
        /></label
      >
      {#if loading}<p class="muted" role="status">{t("Lade …")}</p>{/if}
      <div class="accounts">
        {#each filtered as user (user.id)}
          <article class="account" data-username={user.username}>
            <header class="account-head">
              <span class="avatar"
                >{user.username.slice(0, 1).toUpperCase()}</span
              >
              <div class="identity">
                <strong>{user.username}</strong><span class="muted"
                  >{t(
                    user.role === "operator" ? "Operator" : "Betrachter",
                  )}{#if user.id === session.user?.id}
                    · {t("Dein Konto")}{/if}</span
                >
              </div>
              <span class="badge" class:disabled={!user.enabled}
                >{t(user.enabled ? "Aktiv" : "Deaktiviert")}</span
              >
            </header>
            {#if user.bootstrap}<p class="help-text bootstrap">
                {t(
                  "Administratorkonto: Passwort über DASHBOARD_PASSWORD ändern",
                )}
              </p>
            {:else if drafts[user.id]}
              {@const draft = drafts[user.id]!}
              <form
                class="edit-form"
                onsubmit={(event) => {
                  event.preventDefault();
                  void save(user);
                }}
              >
                <label class="field"
                  >{t("Rolle")}<select
                    aria-label={t("Rolle")}
                    bind:value={draft.role}
                    disabled={busy || user.id === session.user?.id}
                    ><option value="viewer">{t("Betrachter")}</option><option
                      value="operator">{t("Operator")}</option
                    ></select
                  ></label
                >
                <label class="field password"
                  >{t("Neues Passwort (optional)")}<input
                    type="password"
                    bind:value={draft.password}
                    autocomplete="new-password"
                    minlength="8"
                    maxlength="1024"
                  /></label
                >
                <div class="account-save">
                  <label class="switch-label"
                    ><input
                      type="checkbox"
                      role="switch"
                      bind:checked={draft.enabled}
                      disabled={busy || user.id === session.user?.id}
                    />{t("Aktiv")}</label
                  ><Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={busy ||
                      (draft.role === user.role &&
                        draft.enabled === user.enabled &&
                        !draft.password)}>{t("Speichern")}</Button
                  >
                </div>
              </form>
            {/if}
          </article>
        {:else}{#if !loading}<div class="empty-state">
              <Icon name="players" size={28} />
              <p>{t("Keine passenden Benutzer.")}</p>
            </div>{/if}{/each}
      </div>
    </Panel>
  </div>
  <BackupsPanel />
</div>

<style>
  .accounts-layout {
    display: grid;
    grid-template-columns: minmax(250px, 310px) minmax(0, 1fr);
    gap: 22px;
    align-items: start;
  }
  .create-form {
    display: grid;
    gap: 18px;
  }
  .accounts {
    display: grid;
    gap: 14px;
    margin-top: 18px;
  }
  .account {
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
    background: var(--bg-2);
    min-width: 0;
  }
  .account-head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .avatar {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex: none;
    background: #78d5a315;
    color: var(--accent);
    border-radius: 10px;
  }
  .identity {
    min-width: 0;
    flex: 1;
  }
  .identity strong {
    display: block;
    overflow-wrap: anywhere;
  }
  .identity > span {
    font-size: 12px;
  }
  .disabled {
    color: var(--warn);
  }
  .bootstrap {
    margin: 14px 0 0;
  }
  .edit-form {
    display: grid;
    grid-template-columns: minmax(100px, 1fr) minmax(0, 1.6fr);
    gap: 14px;
    margin-top: 20px;
  }
  .account-save {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    grid-column: 1 / -1;
  }
  .notice {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }
  @media (max-width: 1100px) {
    .accounts-layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .create-form {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
    }
  }
  @media (max-width: 500px) {
    .create-form,
    .edit-form {
      grid-template-columns: minmax(0, 1fr);
    }
    .metric-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .metric {
      padding: 12px;
    }
    .metric-label {
      font-size: 11px;
      gap: 4px;
    }
    .metric-label :global(svg) {
      display: none;
    }
    .metric-note {
      display: none;
    }
    .metric-value {
      font-size: 22px;
    }
  }
</style>
