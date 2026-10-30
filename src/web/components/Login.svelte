<script lang="ts">
  import Button from "./ui/Button.svelte";
  import type { DashboardUser } from "../../shared/users";
  import LanguagePicker from "./LanguagePicker.svelte";
  import { t as tr } from "../lib/i18n.svelte";
  import { api } from "../lib/api";

  let {
    onlogin,
    mock = false,
  }: { onlogin: (user: DashboardUser) => void; mock?: boolean } = $props();
  let username = $state("admin");
  let password = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function submit(e: Event) {
    e.preventDefault();
    if (!password || busy) return;
    busy = true;
    error = null;
    try {
      const result = await api.login(password, username);
      password = "";
      onlogin(result.user);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<div class="login">
  <div class="login-container">
    <div class="login-brand">
      <img src="/icons/icon.svg" alt="" width="42" height="42" />
      <div>
        <strong>MC-Dashboard</strong><span>{tr("Serververwaltung")}</span>
      </div>
    </div>
    <form class="panel login-panel" onsubmit={submit}>
      <div class="login-language"><LanguagePicker /></div>
      <h1>{tr("Willkommen zurück")}</h1>
      <p class="login-description">
        {tr("Melde dich an, um deinen Minecraft-Server zu verwalten.")}
      </p>
      <label class="field" for="username"
        >{tr("Benutzername")}<input
          id="username"
          bind:value={username}
          autocomplete="username"
          required
          maxlength="40"
        /></label
      >
      <label class="field" for="pw"
        >{tr("Passwort")}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          id="pw"
          type="password"
          bind:value={password}
          autocomplete="current-password"
          autofocus
          required
        />
      </label>
      {#if error}<div class="notice error" role="alert">{error}</div>{/if}
      <Button
        type="submit"
        size="lg"
        class="w-full"
        disabled={busy || !password}
        >{busy ? tr("Prüfe …") : tr("Anmelden")}</Button
      >
      {#if mock}<div class="mock-hint">
          {tr("Mock-Modus: Passwort „mock“ (falls nicht anders gesetzt)")}
        </div>{/if}
    </form>
  </div>
</div>

<style>
  .login {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: calc(32px + var(--safe-top)) 20px calc(32px + var(--safe-bottom));
    background: radial-gradient(ellipse at 50% 15%, #1a342b66, transparent 55%);
  }
  .login-container {
    width: min(420px, 100%);
  }
  .login-brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 30px;
  }
  .login-brand strong {
    display: block;
    font-size: 20px;
    letter-spacing: -0.04em;
  }
  .login-brand span {
    display: block;
    color: var(--text-faint);
    font-size: 12px;
    margin-top: 3px;
  }
  .login-panel {
    padding: 30px;
    box-shadow: 0 20px 80px #0004;
    display: grid;
    gap: 22px;
  }
  .login-language {
    display: flex;
    justify-content: end;
  }
  h1 {
    font-size: 26px;
    margin: 0;
    letter-spacing: -0.04em;
  }
  .login-description {
    color: var(--text-dim);
    margin: -10px 0 4px;
    line-height: 1.7;
    font-size: 14px;
  }
  input {
    font-size: 16px;
  }
  .mock-hint {
    font-size: 12px;
    color: var(--text-faint);
    border-top: 1px solid var(--border);
    padding-top: 16px;
    line-height: 1.6;
  }
  @media (max-width: 420px) {
    .login-panel {
      padding: 22px;
    }
  }
</style>
