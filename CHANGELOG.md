# Changelog

## [1.2.0](https://github.com/Logicenios/mcrcondocker/releases/tag/v1.2.0) - 2026-10-30

First feature release of this fork, including the dashboard improvements developed since the original 1.1.1 codebase.

### Dashboard and administration

- Add a shared Tailwind design system with local shadcn-svelte controls and accessible Bits UI interactions.
- Introduce a desktop sidebar, compact status header, and mobile navigation with a More menu.
- Put inventory first on player pages, with separate player-data and operator-action tabs.
- Redesign World, Users/backups, Diagnostics, Map, Playtime, and sign-in with consistent panels, forms, loading/error states, and mobile layouts.
- Add searchable game rules, accounts, loaded audit entries, diagnostic notices, and console output.
- Keep account edits in separate drafts and show translated create/save results.

### Console

- Add local completion for common commands, arguments, current/legacy game-rule names, online players, installed item IDs, and browser command history.
- Complete entity targets with player UUIDs and preserve item namespaces and text after the caret.
- Support Tab completion, arrow-key selection/history, Enter acceptance/submission, Escape dismissal, and mouse/touch selection. Selecting a suggestion never executes it.
- Render Minecraft legacy/hex formatting and ANSI foreground colors, including 256-color and RGB styles, as escaped text and whitelisted styles.
- Add a colors toggle, output search, and follow-scroll controls. Preserve original responses in diagnostics and exports.
- Retain confirmation for dangerous commands and API enforcement of operator permissions.

### Languages, maps, and inventory

- Include complete English/German dashboard catalogs and localized game names, dates, and numbers.
- Add configurable, separately hosted BlueMap embedding alongside the coordinate map.
- Bundle pinned Minecraft 26.3 inventory renders, HUD/equipment sprites, and local model/texture assets.
- Support component-aware item appearances, resource-pack overrides, and locally installed profile skins, with namespace-safe fallbacks.
- Fix diagnostics showing `de_de` while English is selected: source metadata and export now use the selected catalog, its actual merged translation count, and the English fallback when necessary.
- Keep language changes from restarting live state or clearing deferred resources.

### Accounts, reliability, and delivery

- Include named viewer/operator accounts, scrypt password hashes, session revocation, filtered SSE events, and audit actor names.
- Include verified online SQLite backups, retention/downloads, restore tooling, readiness checks, and versioned parser regression coverage.
- Defer secondary pages, administrative controls, console history, game-name catalogs, and renderer metadata until needed.
- Add private ETag revalidation for icons/HUD sprites and revision-aware private caching for renderer assets.
- Reuse Minecraft downloads through a separate Docker asset stage and exclude frontend-only packages from runtime dependencies.
- Publish container images through version tags and manual runs, with checks before the amd64/arm64 build.

### Upgrade notes

- Keep the existing data volume. The environment-managed `admin` account uses `DASHBOARD_PASSWORD`; migrating from the original anonymous-session schema requires signing in again.
- Existing Minecraft/RCON connection settings remain valid. BlueMap and custom resource packs/profile skins remain optional.
- Database backups cover dashboard data; Minecraft world backups require separate tooling.
- Completion hints are local suggestions, not a live server/plugin command registry.
- Tagged container builds publish `ghcr.io/logicenios/mcrcondocker:1.2.0`, `:1.2`, and `:latest` after their checks and build succeed.
- See [operations](docs/operations.md) for account migration, backups/restoration, and rendering setup.

### Verification

- 187 unit/integration tests passed.
- TypeScript/Svelte checks passed with zero errors/warnings; production build passed.
- Browser smoke covered administration, locales, completion without execution, Minecraft/ANSI colors and escaped output, 320/375px mobile layouts, inventory variants, permissions/SSE revocation, backups, and BlueMap.
- Podman image and isolated mock production-UI checks passed. No real Minecraft world was used for validation.
- Production dependency audit reported zero findings. The existing development-only deepmerge advisory and optional Three.js bundle-size warning remain documented.
