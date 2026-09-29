# Tobytube Streaming Clients — Beta Plan

## Product boundary

The Desktop Tobytube installation remains the control centre and source of truth. Streaming clients browse, search, play, resume, favourite, and report viewing activity; they do not scan drives, edit metadata, curate collections, or administer users.

## Shared work required before public beta

1. Versioned client API for catalogue, artwork, search, collections, playback negotiation, progress, favourites, and history.
2. Authentication with password hashing, short-lived access tokens, refresh-token rotation, device revocation, rate limiting, and an administrator-only pairing flow.
3. Server-side authorization on every catalogue, artwork, search, and playback response. Filtering only in a client is not security.
4. A single access-policy evaluator supporting account disablement, collection allow-lists, rating blocks, individual item blocks, franchise blocks, and normalized folder/path rules.
5. Persistent activity events for play, pause, progress, completion, favourites, device, and session duration, with retention controls.
6. HTTPS for any traffic outside the trusted LAN, preferably through a private VPN or a carefully configured reverse proxy. Media-drive paths and provider keys must never reach clients.
7. Stable playback profiles, range requests, subtitle/audio selection, resume synchronization, and fallback transcoding.

## Client approach

- Android: Kotlin + Jetpack Compose + Media3/ExoPlayer. This is the largest platform-specific playback effort, but gives proper TV/phone navigation, casting possibilities, background lifecycle handling, and codec support.
- Linux: a packaged desktop shell around the shared web client is the quickest beta. Tauri is preferred over Electron for a smaller install; native GStreamer can be added only if browser playback proves insufficient.
- Windows: use the same shared Tauri/web client as Linux. Windows-specific work is packaging, signing, firewall discovery, and playback/device testing rather than a separate product.

## Rough effort after the server API is stable

- Server identity, policy, activity, and client API foundation: 4–7 focused development weeks.
- Shared responsive streaming UI and Linux/Windows beta packaging: 3–5 weeks.
- Android phone/tablet beta: 4–7 weeks; add 2–4 weeks if Android TV/remote navigation is part of the first beta.
- Security hardening, recovery, device management, migration, and multi-network testing: 3–6 weeks across all clients.

These ranges overlap; a credible private beta is roughly 10–16 focused weeks of work, while a dependable friends-and-family release is closer to 16–24 weeks. Current playback instability should be reduced before locking client playback contracts.

## Recommended sequence

1. Finish the Batcave Users data model and policy evaluator.
2. Introduce authentication and device pairing locally, with automated authorization tests.
3. Extract a versioned read-only catalogue/playback API from the current UI-specific endpoints.
4. Build the shared Linux/Windows client first to validate the API cheaply.
5. Build Android with Media3 against the proven API.
6. Add remote access only after TLS, revocation, rate limiting, audit logs, and backup/restore are working.
