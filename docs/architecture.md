# Application architecture

MC-Dashboard is one Fastify/TypeScript backend and a Svelte 5 frontend. SQLite owns dashboard accounts, sessions, settings, snapshots, audit history and optional automation state.

- **RCON:** one authenticated connection serializes commands. A shared poller discovers players and captures snapshots; opening another browser does not create another poller. Parsers support current components and legacy NBT.
- **Authentication:** the API enforces viewer/operator roles and session revocation. Administrative SSE events are filtered. Mutations retain JSON/origin validation and dangerous-action confirmations.
- **Frontend:** route chunks and secondary data load when needed. Shared English/German catalogs format interface text and structured diagnostics; raw Minecraft data remains unchanged.
- **Assets:** icons, resource packs, models and installed profile textures are served locally through authenticated routes. The renderer and Three.js are pinned with license/source attribution. Missing assets retain namespace-safe fallbacks.
- **Storage:** numbered migrations preserve existing data. SQLite online backups are verified before retention pruning; restore tooling creates a separate database. Minecraft world backups remain external.
- **BlueMap:** an embedded external map with independent file serving. Optional map authorization verifies current operator or map-only player sessions; map requests never wake Minecraft.
- **Optional management:** native lifecycle observations, persistent maintenance protection and per-world Chunky controls reuse the backend, account model and database. Optional imported automation handles guest approvals, ranks, notifications and digests. No Docker access or start/stop/restart API exists.

See [operations](operations.md) and the [optional integration contract](on-demand.md) for configuration. Local checks use mock Minecraft data: `npm test`, `npm run check`, `npm run build`, and `npm run test:smoke` after installing icon/model assets and Chromium. Runtime data, credentials, exports, downloaded assets and browser diagnostics do not belong in source control or the container build context.
