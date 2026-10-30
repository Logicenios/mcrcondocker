<script lang="ts">
  import { Dialog } from "bits-ui";
  import { session } from "../../lib/session.svelte";
  import { t as tr } from "../../lib/i18n.svelte";
  import { router, type View } from "../../lib/router.svelte";
  import Icon from "./Icon.svelte";
  import Button from "./Button.svelte";
  let {
    items,
    onclose,
    onlogout,
    returnFocus,
  }: {
    items: { view: View; label: string }[];
    onclose: () => void;
    onlogout: () => void;
    returnFocus: () => void;
  } = $props();
</script>

<Dialog.Root
  open={true}
  onOpenChange={(open) => {
    if (!open) onclose();
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="menu-overlay" />
    <Dialog.Content
      class="mobile-menu"
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        returnFocus();
      }}
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <Dialog.Title class="menu-title">{tr("Arbeitsbereich")}</Dialog.Title
          ><Dialog.Description class="menu-description"
            >{session.user?.username} · {tr(
              session.operator ? "Operator" : "Betrachter",
            )}</Dialog.Description
          >
        </div>
        <Dialog.Close class="btn" aria-label={tr("Schließen")}
          ><Icon name="close" /></Dialog.Close
        >
      </div>
      <nav aria-label={tr("Weitere Seiten")}>
        {#each items as item (item.view)}<a
            href="#/{item.view}"
            aria-current={router.view === item.view ? "page" : undefined}
            onclick={onclose}><Icon name={item.view} />{tr(item.label)}</a
          >{/each}
      </nav>
      <Button
        variant="outline"
        class="w-full"
        onclick={() => {
          onclose();
          onlogout();
        }}><Icon name="logout" />{tr("Abmelden")}</Button
      >
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.menu-overlay) {
    position: fixed;
    inset: 0;
    background: #060b14bb;
    backdrop-filter: blur(5px);
    z-index: 90;
  }
  :global(.mobile-menu) {
    position: fixed;
    bottom: calc(16px + var(--safe-bottom));
    left: 16px;
    right: 16px;
    padding: 22px;
    border: 1px solid var(--border);
    background: var(--panel);
    border-radius: 20px;
    z-index: 91;
    max-height: calc(100dvh - 48px);
    overflow-y: auto;
  }
  :global(.menu-title) {
    margin: 0;
    font-size: 20px;
  }
  :global(.menu-description) {
    margin: 6px 0 14px;
    font-size: 13px;
    color: var(--text-dim);
  }
  nav {
    display: grid;
    gap: 3px;
    margin-bottom: 16px;
  }
  a {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 9px;
    text-decoration: none;
    color: var(--text-dim);
    font-size: 14px;
    font-weight: 550;
  }
  a:hover,
  a[aria-current="page"] {
    background: var(--panel-2);
    color: var(--accent);
  }
</style>
