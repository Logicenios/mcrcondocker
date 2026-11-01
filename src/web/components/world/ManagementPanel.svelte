<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../../lib/api";
  import { t, language } from "../../lib/i18n.svelte";
  import { formatDiagnostic } from "../../../shared/diagnostic-messages";
  import type { ManagementStatus, GuestApproval } from "../../../shared/management";
  import ConfirmDialog from "../ConfirmDialog.svelte";
  import { time } from "../../lib/format";
  let status = $state<ManagementStatus | null>(null);
  let approvals = $state<GuestApproval[]>([]);
  let rules = $state<unknown>(null);
  let generationClaims = $state<unknown>(null);
  let reason = $state("");
  let error = $state("");
  let workerError = $state("");
  let busy = $state(false);
  let preview = $state<{digest:string;bundle:unknown;imported:boolean} | null>(null);
  let confirmation = $state<{label:string;detail:string;run:()=>Promise<unknown>} | null>(null);
  const states: Record<string,string> = {sleeping:"Schläft",starting:"Startet",running:"Läuft",stopping:"Stoppt",failed:"Fehlgeschlagen",unknown:"Unbekannt",active:"Aktiv",paused:"Pausiert",completed:"Abgeschlossen",unavailable:"Nicht verfügbar"};
  const approvalStates:Record<string,string>={requested:"Angefragt",pending:"Genehmigt, Anwendung ausstehend",applied:"Whitelist-Anwendung bestätigt",rejected:"Abgelehnt"};
  async function load() {
    const [s,a] = await Promise.all([api.management(),api.automation()]);
    status=s;approvals=a.approvals;rules=a.rules;workerError=a.error?formatDiagnostic(language.locale,a.error):"";generationClaims=a.generationClaims;
  }
  async function run(task:()=>Promise<unknown>) {
    busy=true;error="";
    try{await task();await load();}catch(e){error=(e as Error).message;}finally{busy=false;}
  }
  function confirm(label:string,detail:string,task:()=>Promise<unknown>){confirmation={label,detail,run:task};}
  onMount(()=>{void load().catch(e=>error=e.message);const timer=setInterval(()=>{if(!busy)void load().catch(e=>error=e.message);},5000);return()=>clearInterval(timer);});
</script>
<div class="page-stack">
  <section class="panel">
    <h2>{t("Betrieb und Wartung")}</h2>
    <p class="muted">{t("Start, Stopp und Neustart werden außerhalb des Dashboards verwaltet.")}</p>
    {#if status}
      <p role="status">{t("Lebenszyklus")}: <strong>{status.enabled?t(states[status.state]||"Unbekannt"):t("RCON-Modus")}</strong></p>
      {#if status.observedAt}<p>{t("Stand")}: {time(status.observedAt)}</p>{/if}
      {#if status.errorData}<p role="alert">{formatDiagnostic(language.locale,status.errorData)}</p>{/if}
      {#if status.reason}<pre>{status.reason}</pre>{/if}
      <p>{t("Leerlauf: {seconds} Sekunden",{seconds:status.idleSeconds})} · {t("Startzeitlimit: {seconds} Sekunden",{seconds:status.startupSeconds})}</p>
      <p>{status.acknowledged?t("Wartungsrichtlinie bestätigt"):t("Wartungsrichtlinie wartet auf Bestätigung")}</p>
      <h3>{t("Wartungsschutz")}</h3>
      <form onsubmit={e=>{e.preventDefault();void run(async()=>{await api.hold(reason);reason="";});}}>
        <label>{t("Grund")} <input bind:value={reason} required maxlength="200" /></label>
        <button class="btn" disabled={busy||!reason.trim()}>{t("Wartungsschutz hinzufügen")}</button>
      </form>
      <p class="muted">{t("Wartungsschutz verhindert Leerlauf-Abschaltung und weckt Minecraft nicht.")}</p>
      {#each status.holds as hold (hold.id)}
        <div class="row">
<span>{hold.reason} · {hold.owner}</span>
          {#if hold.owner==="manual"}<button class="btn small" disabled={busy} onclick={()=>confirm("Wartungsschutz freigeben",hold.reason,()=>api.releaseHold(hold.id))}>{t("Freigeben")}</button>{/if}
        </div>
      {/each}
    {/if}
  </section>
  <section class="panel">
    <h2>{t("Chunky und Weltgrenzen")}</h2>
    <p class="muted">{t("Abfragen wecken Minecraft nicht. Keine aktive Aufgabe bedeutet nicht abgeschlossen.")}</p>
    {#each status?.worlds||[] as world (world.world)}
      <article>
        <h3>{world.world} · {t(states[world.state]||"Unbekannt")}</h3>
        {#if world.progress!==null}<p>{t("Zuletzt gemeldeter Fortschritt")}: {new Intl.NumberFormat(language.locale,{maximumFractionDigits:2}).format(world.progress)}%</p>{/if}
        {#if world.observedAt}<p>{t("Stand")}: {time(world.observedAt)}</p>{/if}
        {#if world.completedAt}<p>{t("Abschlussnachweis")}: {time(world.completedAt)} · {world.completionSource}</p>{/if}
        {#if world.errorData}<p role="alert">{formatDiagnostic(language.locale,world.errorData)}</p>{/if}
        <div class="row">
          {#if status?.holds.some(h=>h.id===`chunky:${world.world}`)&&world.state!=="active"}<button class="btn" disabled={busy||world.state==="unavailable"} onclick={()=>confirm("Wartungsschutz nach Prüfung freigeben",world.world,()=>api.generation(world.world,"release"))}>{t("Schutz prüfen und freigeben")}</button>{/if}
          <button class="btn" disabled={busy||world.state==="unavailable"} onclick={()=>confirm("Vorberechnung pausieren",world.world,()=>api.generation(world.world,"pause"))}>{t("Pausieren")}</button>
          <button class="btn" disabled={busy||!!world.completedAt||world.state==="unavailable"} onclick={()=>confirm("Vorberechnung fortsetzen",world.world,()=>api.generation(world.world,"resume"))}>{t("Fortsetzen")}</button>
          <button class="btn danger" disabled={busy||!!world.completedAt||world.state==="unavailable"} onclick={()=>confirm("Neue Vorberechnung starten",world.world,()=>api.generation(world.world,"start"))}>{t("Neue Aufgabe")}</button>
          <button class="btn" disabled={busy||world.state==="unavailable"} onclick={()=>confirm("Konfigurierte Weltgrenze anwenden",world.dimension,()=>api.generation(world.world,"border"))}>{t("Weltgrenze anwenden")}</button>
        </div>
        {#if world.raw}<details><summary>{t("Originalantwort")}</summary><pre>{world.raw}</pre></details>{/if}
      </article>
    {/each}
    {#if !(status?.worlds.length)}<p>{t("Keine verwalteten Welten konfiguriert.")}</p>{/if}
  </section>
  <section class="panel">
    <h2>{t("Gastanfragen")}</h2>
    <p class="muted">{t("Genehmigungen werden ohne Aufwecken gespeichert. Erst bestätigte Anwendung ändert den Status.")}</p>
    {#each approvals as approval (approval.name)}
      <article><strong>{approval.name}</strong> · {t(approvalStates[approval.state]||"Unbekannt")}
        {#if approval.errorData}<p role="alert">{formatDiagnostic(language.locale,approval.errorData)}</p>{/if}
        {#if approval.state==="requested"}
          <button class="btn" disabled={busy} onclick={()=>confirm("Gast genehmigen",approval.name,()=>api.approveGuest(approval.name,true))}>{t("Genehmigen")}</button>
          <button class="btn" disabled={busy} onclick={()=>void run(()=>api.approveGuest(approval.name,false))}>{t("Ablehnen")}</button>
        {/if}
      </article>
    {/each}
  </section>
  <section class="panel">
    <h2>{t("Automatisierung und Import")}</h2>
    {#if workerError}<p role="alert">{workerError}</p>{/if}
    <button class="btn" disabled={busy} onclick={()=>void run(async()=>{preview=await api.importPreview();})}>{t("Importvorschau laden")}</button>
    {#if preview}
      <pre>{JSON.stringify(preview.bundle,null,2)}</pre>
      <button class="btn" disabled={busy||preview.imported} onclick={()=>confirm("Steward-Zustand importieren",preview!.digest,()=>api.importSteward(preview!.digest))}>{t("Import bestätigen")}</button>
    {/if}
    {#if rules}
      <button class="btn danger" disabled={busy} onclick={()=>confirm("Rangberechtigungen abgleichen","",()=>api.reconcilePermissions())}>{t("Rangberechtigungen abgleichen")}</button>
      <p class="muted">{t("Der Abgleich ersetzt Berechtigungen und Metadaten der konfigurierten Gruppen.")}</p>
      <details><summary>{t("Importierte Regeln und Nachweise")}</summary><pre>{JSON.stringify({rules,generationClaims},null,2)}</pre></details>
    {/if}
  </section>
  {#if error}<p role="alert" class="error">{error}</p>{/if}
</div>
<ConfirmDialog open={!!confirmation} title={t(confirmation?.label||"Aktion bestätigen")} message={t("Wirklich ausführen?")} detail={confirmation?.detail||""} oncancel={()=>confirmation=null} onconfirm={()=>{const task=confirmation?.run;confirmation=null;if(task)void run(task);}} />
<style>
  .row,form{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0}article{border-top:1px solid var(--border);padding:12px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto}.error{color:var(--error)}input{max-width:100%}
</style>
