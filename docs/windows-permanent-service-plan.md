# TobyTube Permanent Windows Service Plan

## Goal

Run the TobyTube catalogue and playback server continuously without a visible terminal, recover automatically after reboots or crashes, and keep the last valid catalogue available while media drives are starting or temporarily disconnected.

## Non-negotiable safeguards

- Never treat an unavailable `M:`, `T:`, or `W:` drive as an empty library.
- Continue serving the last known-good catalogue during scans and provider outages.
- Run under the Windows account that can access the media locations, or migrate the configured roots to stable UNC paths.
- Keep startup, scan, crash, and recovery logs with bounded retention.
- Service installation, removal, start, stop, and restart must be reversible.
- No PowerShell or console window may appear during normal operation.

## Phase 1 — Stabilize the current server

- Add a fast health endpoint that distinguishes server, catalogue, scan, and media-root health.
- Ensure the server begins serving the last valid catalogue before starting a library scan.
- Detect stalled or overlapping scans and prevent watcher-triggered scan loops.
- Add bounded retry/backoff for disconnected drives and metadata providers.
- Make the loading screen distinguish `server offline`, `catalogue loading`, and `library scan in progress`.
- Record the reason and exit code whenever the server or scanner stops.
- Split the monolithic startup data into smaller, section-specific payloads. Load only the core home catalogue initially, then fetch Movies, TV, Wrestling, Criterion, artwork indexes, and metadata overrides on demand.
- Replace the single large metadata-overrides response with an indexed or per-item store so Fix Match and metadata saves do not download, parse, or rewrite the entire overrides database.
- Preserve cache invalidation and collection-tag updates across the split so newly matched items appear immediately without a full-page or full-catalogue reload.

**Acceptance gate:** TobyTube remains browsable from its last valid catalogue during a full scan, a provider failure, and a simulated missing media drive. Startup transfers only the core catalogue required for the first screen; opening or saving Fix Match does not process the complete catalogue or overrides database.

## Phase 2 — Make media paths service-safe

- Identify the UNC/network path behind each mapped drive.
- Confirm whether the service account can access the media without an interactive sign-in.
- Prefer UNC paths if reliable; otherwise run the service under the owner's Windows account.
- Add a preflight check that waits for media roots without blocking catalogue availability.

**Acceptance gate:** reboot with delayed or disconnected media drives; no items are deleted and the catalogue remains available.

## Phase 3 — Install the Windows service

- Package the server runtime so it does not depend on a temporary Codex or shell environment.
- Install an automatic, delayed-start Windows service.
- Configure restart-on-failure with sensible backoff and a restart limit.
- Write logs and mutable data to stable application-data directories.
- Add signed install, upgrade, repair, and uninstall actions to the TTCC installer.

**Acceptance gate:** after reboot, TT is available without opening a terminal or manually launching the server; terminating the process causes an automatic clean restart.

## Phase 4 — Add TTCC controls

- Show `Running`, `Starting`, `Scanning`, `Degraded`, or `Stopped` status in TTCC.
- Provide Start, Stop, Restart, Rescan, and Open Logs controls.
- Explain disconnected drives and provider failures in plain language.
- Prevent repeated button presses from spawning duplicate servers or scans.

**Acceptance gate:** routine recovery and diagnosis can be completed from TTCC without PowerShell.

## Phase 5 — Verification and rollout

- Test clean boot, reboot, logout, sleep/resume, crash recovery, upgrades, drive loss/reconnection, and network loss.
- Verify playback, subtitles, metadata editing, collection tagging, and library refresh after service restarts.
- Back up the last valid catalogue and configuration before rollout.
- Keep the present launcher as a temporary rollback path until the service passes the full test matrix.

## Recommended execution order

Complete Phases 1 and 2 before installing the service. A permanent service should make a stable server resilient; it must not make a scan loop or unsafe drive handling permanent.
