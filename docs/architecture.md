# Architecture roadmap

Keep a single Svelte 5 / Fastify application with SQLite and the existing RCON transport. Changes should preserve named-account permissions, session/SSE revocation, CSRF, local game assets, English/German translations, and the parser version matrix. Use mock mode for integration checks.

## Milestone 1: shared UI and delivery

Implemented:

- Tailwind 4 through Vite, dashboard color/spacing/control tokens, and a locally owned shadcn-svelte button. Tailwind Preflight is intentionally omitted during the gradual migration to preserve existing native controls and Minecraft slot geometry. Shared primitives live in `src/web/components/ui`; the source and MIT attribution for the adapted button are documented there and shipped under `/licenses/shadcn-svelte.txt`.
- Desktop sidebar and compact connection/status header. Mobile navigation exposes Players, Map, and Playtime, plus an on-demand Bits UI dialog for other permitted pages and logout. Keyboard focus returns to the menu trigger when dismissed. A skip link reaches main content.
- Search with an explicit no-match state. Player pages open on Inventory, show a compact health/hunger/level summary, and separate detailed stats and operator actions into keyboard-accessible tabs. Equipment, inventory/hotbar, and ender chest remain local Minecraft assets with the existing appearance renderer and fallbacks.
- Route chunks, player details, player action controls, and the mobile dialog load when opened. Startup no longer fetches console history, the game-language catalog, or the complete renderer index. Game names load when a player detail screen first opens and follow subsequent locale changes. Visible item visuals share one renderer-index request per session; console history merges with any SSE entries that arrive while it loads. Ended sessions clear local state and ignore pending data/SSE callbacks.
- Private ETags for icons and GUI sprites. Versioned renderer-file URLs and profile texture hashes permit private browser caching. Authentication runs before conditional responses; failed/missing requests and changing API state remain `no-store`. Icons revalidate so local overrides appear after restart.
- An isolated Docker asset stage reuses downloaded game content across UI/server edits. The installer scripts and ZIP reader still invalidate that stage when changed; dependency manifest updates may also invalidate it. Three.js and all UI tooling are build dependencies, with Three.js still pinned exactly; the runtime installs only backend dependencies.
- Browser smoke regression coverage for lazy requests, inventory/stats/actions tabs, dangerous action confirmation, mobile navigation/focus, roles, item component variants, locales, and BlueMap. `SMOKE_ARTIFACT_DIR` optionally retains desktop/mobile screenshots. API regressions cover conditional asset responses and unauthenticated cache requests.

This is an incremental migration. The initial milestone retained secondary page layouts; the administration follow-up below migrates those screens to shared headers, panels, and form patterns. The renderer remains optional at runtime through its static-icon fallback and loads its WebGL dependencies on demand. It is still included in the image so existing component-aware rendering works without a new deployment requirement.

## Subsequent milestones

1. **Backend feature modules and contracts:** move route registration, validation, and service responsibilities into authentication, players/inventory, world, console, integration, and backup modules. Keep API role checks authoritative. Add shared validated request/response contracts without changing parser behavior or introducing unnecessary processes.
2. **Selective live state:** introduce a bounded request cache keyed by player UUID and snapshot version, coalesce in-flight requests, and define versioned SSE updates/reconnect snapshots. Separate expensive inventory polling from cheap status checks, add configurable intervals/backoff, and measure RCON command count and latency before tuning.
3. **Capabilities and integration adapters:** define supported operations explicitly and explain unavailable features in the UI. RCON remains the default. BlueMap remains separately hosted. A server plugin could supply richer events and reliable offline player/inventory operations; an independently authorized host agent could handle lifecycle, files, and world backups. Neither extension is implemented in milestone 1.
4. **Product features:** server overview/history, richer offline-player inspection with snapshot age, searchable audit history, and scheduled actions with visible outcomes. Build these on the capability and live-state contracts. Dashboard database backups and Minecraft world backups must remain distinct.

## Verification

Run `npm test`, `npm run check`, and `npm run build`, then `npm run test:smoke` with icons/models installed and Chromium available. The smoke run creates its own temporary server/database and a stub map. Use Podman only with an isolated mock container for local image checks. Live Minecraft, BlueMap, world data, and production containers are outside local validation scope.

### Milestone 1 validation (2026-10-30)

- 174 unit/integration tests passed, including private asset ETags, conditional authentication, pack-revision caching, and uncached error/state responses.
- Server TypeScript and Svelte checks passed with zero errors/warnings; the production build passed. The optional Three.js chunk retains the existing bundle-size warning.
- Expanded browser smoke passed, including English/German switching without restarting live state, deferred catalog/renderer/console requests, tabs and destructive confirmation, resource-pack/component variants, mobile menu focus, roles/SSE revocation, backups, and BlueMap. German player layouts fit widths of 320, 375, 768, and 1024 CSS pixels.
- Podman image build passed. A subsequent source build reused the asset-download stage. The isolated mock container passed login, players, bundled models/icons, private ETags, versioned assets, liveness, and readiness. Frontend-only packages are absent from runtime node_modules, and the adapted UI source license ships in the image.
- Production dependency audit and Git whitespace checks passed. The existing development-only deepmerge advisory remains documented in review.md.

No live Minecraft world, real BlueMap instance, or production container was used for these checks.

## Administration and console UI follow-up (2026-10-30)

Implemented:

- Shared page headers, panels, form fields, status notices, metrics, and responsive grid constraints. World, Users/backups, Diagnostics, Map, Playtime, and sign-in now use consistent page patterns.
- Keyboard-accessible World tabs load their panels on demand. Time/weather/difficulty controls, world-spawn coordinates, searchable game rules, messaging, bans, and the searchable loaded audit log preserve their existing API actions and confirmations.
- User creation and account editing are separate. Per-account drafts preserve other unsaved edits; save/create results are visible and translated. Bootstrap account restrictions, API permissions, and session revocation remain authoritative. Backup downloads and restore guidance are grouped in their own panel.
- Diagnostics separates connectivity, source metadata, warnings, and expandable raw-response groups. Raw response bodies and structured diagnostic originals remain intact for copy/export. The selected catalog and actual merged translation count follow the dashboard locale, with honest English fallback when a requested catalog is missing; backend parsing retains its configured default language. Export links carry the selected locale.
- Console completion is local and context-aware, including common command names, known argument values, current/legacy gamerule names, online player UUIDs for entity targets, locally installed item IDs, and browser history. Profile commands use player names. Choosing a completion never executes it; unknown/plugin commands remain usable. These are hints rather than a server-provided command registry. Item catalogs load only when needed and are reused per locale within the view.
- The console has a keyboard-accessible combobox, mouse/touch suggestions, caret-aware token replacement, explicit history, output search, optional follow-scroll, and a colors toggle. Minecraft legacy/hex styles and ANSI foreground/256-color/RGB styles render through escaped text segments; terminal actions/hyperlink controls are discarded. Raw server replies remain unchanged. Filtering reuses parsed output rather than reparsing colors per keystroke.

Verification:

- 187 unit/integration tests passed, including selected catalog metadata/fallback/export, malformed JAR catalogs, command grammar and caret boundaries, UUID/namespace handling, safe Minecraft/ANSI colors, terminal-control filtering, and bounded styled segments.
- TypeScript/Svelte checks passed with zero errors/warnings; production build and expanded browser smoke passed. Browser coverage exercises account creation/role/status edits, World searches and numeric input, locale switching and diagnostic exports, keyboard/mouse completion without execution, actual Minecraft colors, ANSI colors and literal HTML, history/filtering, mobile sign-in, and German administration pages at 320/375px. Existing inventory/resource-pack, permission/SSE revocation, backup, and BlueMap checks remain covered.
- Podman image build passed with cached Minecraft assets. The existing isolated mock review container was refreshed while preserving its named data volume. Its actual production UI passed World/Users/Debug navigation, English/German source metadata/export, keyboard completion, colored RCON replies, and health/readiness checks.
- Production dependency audit and Git whitespace checks passed. The pre-existing development-only deepmerge advisory and optional Three.js bundle warning remain.

No real Minecraft world, real BlueMap instance, or production container was modified for validation.
