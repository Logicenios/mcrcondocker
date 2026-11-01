# Optional on-demand integration and Steward consolidation

The dashboard never starts, stops, restarts, creates or inspects containers. It has no Docker client, Docker-compatible listener, socket mount or power credential. Keep mc-router and its existing startup/reconnect messages outside this application. The external lifecycle controller owns waking, player-aware idle shutdown and restart scheduling.

All features are optional. Ordinary RCON-only deployments remain supported. `RCON_HOST`/`RCON_PORT` **must point directly to Minecraft's RCON listener**, never a wake-capable proxy. The application suppresses RCON commands while an enabled lifecycle feed is sleeping, stopping, stale or unknown. It permits core readiness polling during startup. Diagnostics, map visits, HTTP health checks and automation must never request wake.

## Configuration

See `.env.example`. Configuration locations and credentials are deployment-controlled, never accepted from a browser.

- `ON_DEMAND=true`: enable an externally observed lifecycle. Requires `MANAGEMENT_TOKEN_FILE` containing at least 32 characters. There is no default integration credential.
- `LIFECYCLE_OBSERVATION_SECONDS=45`: maximum observation age; stale feeds become unknown and inhibit RCON commands.
- `IDLE_SECONDS=600`, `STARTUP_SECONDS=600`: policy published to the external lifecycle controller. The dashboard reports startup timeout without killing anything. Late observations can establish recovery.
- `MANAGEMENT_WORLDS`: JSON array, for example `[{"world":"world","dimension":"minecraft:overworld","radius":1000,"x":0,"z":0}]`. No world is managed by default. Each dimension's radius and center must be supplied explicitly; for an existing Nether policy, preserve the old scaling when configuring it. Radius limits pre-generation; it is not permission to regenerate completed worlds.
- `WORLD_DATA_DIR`: optional read-only root containing whitelist/ban files, usercache, vanilla statistics and optional prepared skin assets. Symlinks escaping that root are denied. Missing identity/ban evidence fails closed.
- `PLAYER_STATS_DIRS`: optional JSON list of vanilla statistics directories relative to `WORLD_DATA_DIR` (default current/legacy vanilla world paths). Configure custom world names explicitly.
- `SERVER_LOG_FILE`: optional trusted read-only server log. Needed for offline/AuthMe authenticated login events, `/map`, whitelist rejection requests, game events and Chunky completion events. Untrusted chat cannot manufacture these events.
- `AUTOMATION_FILE`: optional read-only exported Steward JSON file. Merely configuring it does not import or enable automation. An operator previews and explicitly imports it.
- `NTFY_PUBLISH_URL`: optional complete ntfy topic publish URL; `NTFY_TOKEN_FILE` holds its optional bearer credential. Notification links use `DASHBOARD_PUBLIC_URL`, never an inferred host header.
- `MAP_SESSION_DAYS=30`: new map session duration. Old cookies, codes and signed approval URLs are unsupported.

The dashboard's SQLite database owns imported rules, manual/job holds, approval decisions and application state, map identities/session hashes, rank awards, log checkpoints, generation evidence, notification retries and digest bookkeeping. Existing accounts and sessions are not replaced. Database backups continue to use SQLite's online backup API; they include automation state and new map secrets and must be protected accordingly.

## External lifecycle contract, version 1

Expose `/integrations/v1/*` only to the lifecycle controller. Every request requires `Authorization: Bearer <MANAGEMENT_TOKEN_FILE content>`. Dashboard cookies grant no integration permission. The token grants no dashboard accounts, console, power or general configuration access.

`GET /integrations/v1/maintenance` returns:

```json
{"version":1,"revision":4,"holds":[{"id":"…","owner":"manual","reason":"Maintenance","createdAt":1793500000000}],"idleSeconds":600,"startupSeconds":600}
```

`POST /integrations/v1/observation` accepts JSON:

```json
{"version":1,"source":"world-controller","sequence":42,"observedAt":1793500000000,"phaseSince":1793500000000,"state":"sleeping","intentionalSleep":true,"reason":null,"policyRevision":4}
```

All timestamps are Unix milliseconds. `source` is a stable identity; `sequence` must increase and persist across controller restarts. Out-of-order timestamps, source changes, replay, future/stale observations and revisions newer than the dashboard policy are rejected. A controller replacement requires an explicitly planned state migration; changing its source does not silently reset ordering. `phaseSince` is the actual start of the transition and must not be refreshed to avoid a deadline.

Allowed states are `sleeping`, `starting`, `running`, `stopping`, `failed`, `unknown`. Sleeping requires explicit intentional-sleep evidence. A clean exit alone is insufficient. The controller reports running only after verified Minecraft readiness, rather than process existence alone. RCON connectivity remains separately visible. Unknown is appropriate when process observations cannot be trusted.

`policyRevision` acknowledges that the controller has installed that exact maintenance policy. **It is not enough merely to have fetched it.** Before publishing acknowledgement, the controller must inhibit idle shutdown for all listed holds. The protection lasts until a subsequently acknowledged policy releases them. On dashboard/controller communication failure or uncertain state it must inhibit idle shutdown. This acknowledgement permits a dashboard job to issue Chunky commands after acquiring its hold. No lease expiry may silently remove a persistent manual hold.

The controller must serialize wake/admission with idle shutdown; require a fresh, valid actual `minecraft:list` count of zero immediately before graceful stop; reset idle timing on players, wake requests or uncertain observations; and never override player checks for automatic idle shutdown. Do not force-kill on startup timeout or a slow save. Skip that night's scheduled restart if the world was already stopped; never queue it for next wake. These are infrastructure requirements, not operations implemented by this web app.

There is deliberately no wake/start/stop/restart API here. mc-router continues talking to its independently configured lifecycle integration. No additional container or actuator implementation is supplied or required by these repository changes.

## Management API and UI

Operators use **World → Operations and maintenance**. Existing dashboard authentication, server-side roles and JSON/origin protections apply.

- `GET /api/management/status`: lifecycle and generation status. Viewers receive a redacted read-only view.
- `POST /api/management/holds` with `{ "reason": "…" }`; `DELETE /api/management/holds/:id` with JSON `{}`: persistent manual protection, never wake. Job-owned protection cannot be removed through the manual endpoint.
- `POST /api/management/generation` with `{ "world":"world", "action":"pause|resume|start|border|release", "confirmed":true }`: configured-world controls only. Resume/start require actual zero players and acknowledged maintenance protection. The first request may acquire protection and ask the operator to retry after acknowledgement; it has not started generation at that point.
- `pause` saves Chunky progress and verifies the target no longer appears as running before releasing that job's hold. Failed/uncertain pauses retain protection and report failure. `release` is an explicit recovery action which independently verifies inactivity; it does not establish completion.
- Observed active tasks also acquire protective holds, without being automatically adopted or resumed. Managed work automatically pauses for players and resumes while its explicitly enabled maintenance job still owns protection. An explicit operator pause disables automatic resume. No unknown/no-task state is automatically resumed. Polling never wakes Minecraft.
- `start` is a separate confirmed action and requires a bounded border. It cannot restart a world with recorded completion evidence. Chunky's own replacement/disk warnings are not auto-confirmed. Border application is explicit; deployment-specific dimensions/scaling are configuration.
- `GET /api/management/automation`: rules, approval requests, worker failure and imported generation claims.
- `GET /api/management/import`: preview configured import file; `POST` with its exact digest and `confirmed:true`: transactional, repeat-safe first import. A different second bundle is rejected rather than overwriting state silently.
- `POST /api/management/approvals` with `{ "name":"ExactCase", "approved":true }`: saves an operator-attributed decision. While sleeping it remains **approved, pending application**. A later worker applies it and verifies the exact name/UUID in the whitelist file. A success-shaped RCON string is insufficient.
- `POST /api/management/permissions` with `{ "confirmed":true }`: explicit LuckPerms group/track reconciliation. Like Steward's managed-group operation, it replaces configured groups' permissions and metadata. Review the imported rules first.

Generation status is per world: active, paused, completed, unavailable or unknown. Completion requires a recognized finish response or trusted server-thread Chunky completion event, and records source/time. Progress rounded to 100%, no running task, missing task files and imported Steward `done` flags do not prove completion. Stored completion evidence remains visible when live observation is unavailable. Imported pre-generation claims require independent verification before being treated as completion evidence.

Raw RCON commands and responses remain unchanged in debug records; owned errors use shared diagnostic IDs. New UI text has English/German catalog entries. Power commands are denied through the dashboard console too; this is not a general-purpose command sandbox for every possible server-plugin alias. Keep operator accounts trusted.

## One-time Steward migration

1. Back up the dashboard database and existing Steward state. Review this export against the old configuration; no real world is modified by the exporter.
2. With Python >=3.11, create a **new** JSON file using the one-time TOML reader (this is not a Python service):

   ```sh
   python3 scripts/export-steward.py --state /input/steward.json --ranks /input/ranks.toml --maintenance /input/maintenance.json --settings /input/server.env --settings /input/steward.env --identity-mode offline-authme --output /output/automation.json
   ```

   Omit `--maintenance` only if no old maintenance marker exists. Its reason is imported as persistent manual protection; an old pre-generation hold does not silently adopt or resume a task. Settings are selected by name; ntfy/RCON passwords, map secrets and old codes are not exported. Supply the actual configured admin names with their exact case. Use `online` only for an online identity server. Do not change identity mode to repair existing UUIDs implicitly.
3. Configure read-only inputs and `AUTOMATION_FILE`. Configure worlds and border scaling to match the prior setup. Configure the actual server name, timezone and notification destination; examples contain no deployment-specific defaults.
4. Stop the old Steward worker **before** importing/enabling its replacement. The application does not stop it for you. Keep lifecycle/mc-router outside; update their integration only as separate infrastructure work.
5. Review the dashboard import preview. It preserves original state for inspection and imports rank awards/initialization, guest requests, digest bookkeeping, whitelist seed status and unverified generation claims. Existing Minecraft whitelist, AuthMe identities, LuckPerms state and player statistics remain authoritative and are not replaced.
6. Confirm import. Verify queued application, authenticated game admin reconciliation and map access on the deployment before retiring the old integration. Do not run two workers for the same automation.

No named game admins, domains, world filesystem paths or private URLs are compiled into the dashboard. Existing in-game identities and rank configuration are imported rather than normalized to lowercase. The reserved dashboard `admin` is unrelated to configured game admins.

## Map authorization

BlueMap remains a separately rendered/served external map. The dashboard iframe does not serve tiles and has no dependency on a live RCON connection for authorization.

- Caddy may authorize dashboard-operator map requests through `GET /api/map/authorize`, forwarding the actual dashboard cookie. Dashboard viewers are denied.
- The player map origin may serve `/map-access`, `/map-access/login.js` and `/map-access/session` from this application. `/map-access` provides a localized code-entry page. An authenticated player's `/map` command issues a stable personal code; `/map reset` rotates it and revokes their map sessions.
- Protect the rendered map files through `GET /map-access/authorize`, forwarding actual cookies. It accepts either a valid enabled operator session or a map-only player session. It never trusts client role headers. Banned players are denied; unreadable ban data fails closed.
- New player cookies are host-only, HttpOnly, SameSite=Lax and Secure on HTTPS. Operator sessions must be available on the origin used for the operator map; do not broaden cookie domains. Configure separate operator/player map routes if origins differ. Preserve same-origin frame authorization.
- An unauthorized map request should lead to the code-entry page; auth denial alone is not an HTML login response. The login page and its script must be outside the protected tile route. Configure Caddy separately; no Caddy changes are made here.

No legacy map cookies, code compatibility or signed approval endpoints exist. ntfy approval links go to the existing operator UI and cannot approve via an unauthenticated GET or POST.

## Consolidation boundaries

The Node worker reuses dashboard session/polling history for monitoring and daily digests, queues optional ntfy delivery, observes trusted logs, processes guest approval workflows, manages map codes, reads vanilla playtime for ranks, reconciles authenticated configured admins, and supports prepared skin/chat-stat automation. Permission-group replacement remains explicit to avoid silent permission changes during cutover. No plugin assets are downloaded by this worker.

Minecraft retains AuthMe, LuckPerms, gameplay plugins, skins, TAB/PlaceholderAPI and Chunky execution. Host/tunnel checks, world backups, filesystem capacity monitoring, power scheduling and mc-router remain infrastructure responsibilities. World-backup tooling can coordinate through maintenance policy; SQLite backup alone is not a world backup.

## Validation

Tests use mock RCON and temporary data. Fixtures under `tests/fixtures/chunky` are realistic synthetic upstream-format responses, not verification of a deployed world. Unit/API coverage includes observation ordering/freshness, intentional sleep, timeout without killing, role/CSRF boundaries, persistent hold ownership, unknown versus completed generation, asynchronous pause failures, player checks, pending approvals, exact identity checks, import upgrades, map reset/revocation and path boundaries. Run `npm test`, `npm run check`, `npm run build`; full browser smoke requires installed icon/model packs and the build. No live-world changes are needed.
