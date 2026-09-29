# Tobytube Android — Launch Roadmap

## Fixed product boundary

The Android app is a streaming client for the Desktop Tobytube control centre. It never scans drives, edits metadata, curates official collections, administers users, or receives physical media paths and provider secrets.

Phase 1 users may:

- browse and search only the catalogue their account is permitted to see;
- watch permitted movies, TV, wrestling, and TV Guide content;
- resume playback and manage subtitles/audio tracks;
- add titles to custom Mixtapes;
- use the default **Watch Later** Mixtape;
- rate titles from 1 to 5 stars in 0.25-star increments;
- view basic recent activity, favourites, progress, and ratings where needed for ordinary app use.

Phase 2 owns the diary experience: rich profile pages, retrospective browsing, Year in Review, written diary features, and integration with the personal website. Phase 1 stores clean activity and rating data so Phase 2 can use it later, but does not build those experiences now.

## Definition of launchable

A launchable private beta can be installed on supported Android phones/tablets, paired with a Tobytube server, signed into safely, and used repeatedly without exposing restricted catalogue data or losing progress. Browsing, search, Watch Later/custom Mixtapes, quarter-star ratings, playback, subtitles/audio, resume, history reporting, logout, token refresh, and device revocation must work. The app must recover clearly from server, network, and playback failures.

## Step-by-step roadmap

### 1. Freeze the Phase 1 contract

- Write versioned `/api/v1` request/response schemas for server discovery, pairing, authentication, session refresh, home, search, collections, item details, playback negotiation, progress, history, Mixtapes, Watch Later, ratings, favourites, and device/logout operations.
- Define stable media, collection, episode, user, device, Mixtape, rating, and activity IDs.
- Define pagination, timestamps, artwork URLs, error envelopes, capability flags, and API-version compatibility.
- Treat physical paths, provider keys, admin fields, and blocked catalogue objects as forbidden response data.

**Gate:** example payloads and contract tests exist before Android screens depend on them.

### 2. Build centralized server authorization

**Status (2026-08-20): policy engine and deny-by-default unit matrix implemented; Home, search, item, and playback endpoint integration is active and verified. Artwork, collection-detail, recommendations, and TV Guide projections remain gated.**

- Implement one policy evaluator for enabled state, role, approved-collections-only mode, blocked ratings, items, franchises, and folder/path rules.
- Apply it before home rows, search results, collection membership, item detail, artwork, recommendations, TV Guide output, and playback authorization.
- Use deny-by-default behavior when identity or policy evaluation fails.
- Add a permission matrix and automated tests proving blocked IDs cannot be recovered through alternate endpoints or guessed URLs.

**Gate:** a restricted test account cannot enumerate or play forbidden media by any supported API route.

### 3. Add secure accounts and device pairing

**Status (2026-08-20): cryptographic core and pairing/session API implemented; trusted-LAN beta activation is explicit, and pairing, rotation, logout, and user/device binding pass a real HTTP vertical slice. Batcave device UI, password enrollment/login, persistent throttling, public/remote TLS, and a physical-device gate remain.**

- Hash passwords using a modern password-hashing function; never store plaintext or reversible credentials.
- Add short-lived access tokens, rotating refresh tokens, per-device sessions, revocation, login throttling, and audit records.
- Let the Batcave generate a short-lived pairing code or QR code so users do not type an administrator secret into Android.
- Store Android credentials in encrypted platform storage.
- Keep the first beta on the trusted LAN; add remote access only after TLS and network hardening.

**Gate:** pair, sign in, refresh, sign out, expire, and revoke-device flows pass automated and manual tests.

### 4. Create the activity, Mixtape, and ratings model

**Status (2026-08-20): persistent authenticated API, concurrency controls, and idempotency matrix implemented.**

- Make **Watch Later** a protected default Mixtape for every user.
- Support custom Mixtape creation, rename, reorder, add/remove title, and deletion with optimistic-concurrency/version checks.
- Store ratings as integer quarter-stars from 4 through 20, representing 1.00–5.00 stars exactly without floating-point ambiguity.
- Store append-safe activity events and current progress separately: start, progress, pause, completion, rating, favourite, and Mixtape changes.
- Make writes idempotent so retries do not duplicate history or list entries.
- Retain enough normalized data for Phase 2 diary/Profile/Year in Review without coupling Phase 1 to the future website.

**Gate:** two devices on the same account converge correctly after simultaneous list, rating, and progress changes.

### 5. Stabilize playback contracts on the server

**Status (2026-08-20): safe decision schema, codec/profile matrix, track projection, expiry, and user/device binding implemented. Live negotiation and authenticated direct byte-range streaming are active and verified without path disclosure. HLS/transcode delivery and the physical-device codec matrix remain.**

- Finish direct-play range seeking and compatibility-transcode seeking.
- Return a playback decision containing URL, protocol, MIME type, duration, audio/subtitle tracks, resume position, expiry, and refresh behavior.
- Ensure playback authorization is short-lived and bound to the authenticated account/device.
- Test MP4/H.264/AAC direct play first, then the real library's common MKV, HEVC, multichannel-audio, subtitle, and wrestling encodes.
- Establish buffering, startup-time, seek-time, and failure-recovery targets.

**Gate:** the server playback test suite and a representative codec test matrix pass before Android playback is called complete.

### 6. Scaffold the native Android application

**Status (2026-08-20): separate native project, reproducible Gradle wrapper, unit tests, lint, debug build, and signed LAN-beta APK verified. Installation/opening awaits an attached phone or configured emulator.**

- Create a separate Android project using Kotlin, Jetpack Compose, Media3/ExoPlayer, coroutines, dependency injection, a typed HTTP client, local persistence, and encrypted credential storage.
- Use a feature-oriented module/package structure with a small shared design system.
- Add debug, LAN-beta, and release build variants; keep server addresses and secrets out of source control.
- Establish unit tests, Compose UI tests, static analysis, reproducible Gradle builds, and signed beta artifacts.

**Gate:** CI or the local release workflow builds, tests, installs, and opens a signed shell app.

### 7. Implement connection, pairing, and session UX

**Status (2026-08-20): implemented and building. The LAN-beta app supports manual address entry, discovery, explicit fingerprint confirmation, eight-digit pairing-code claim, encrypted session storage, one refresh-token retry, logout, and private-cache purge. A real HTTP server-side vertical slice passes; fresh-install verification on a physical phone/emulator remains the gate.**

- Add manual server address entry first; optional LAN discovery can follow.
- Show server identity/fingerprint so users know which Tobytube they are pairing with.
- Implement pairing code/QR, account selection or credentials, token refresh, offline/session-expired states, logout, and device name management.
- Never silently fall back from HTTPS to insecure remote HTTP.

**Gate:** a fresh installation can reach the filtered home response without developer tools or hard-coded credentials.

### 8. Build the browsing application shell

**Status (2026-08-20): native navigation, screen/state architecture, lazy catalogue rows, artwork loading/cache integration, accessibility semantics, and loading/empty/retry states implemented and building. Home and search now use authenticated filtered API responses. Remaining routes and physical-device leakage tests remain.**

- Implement Home, Movies, TV, Wrestling, Collections, TV Guide, Search, Mixtapes, and account/settings navigation as authorized by server capabilities.
- Use paginated/lazy rows, image caching, skeleton/loading states, empty states, retry affordances, and accessible Compose semantics.
- Keep server curation intact; the client renders ordered rows and collection structures rather than recreating business rules.

**Gate:** users can reach every permitted item type and no forbidden object leaks through cached or offline UI state.

### 9. Build item pages and user actions

**Status (2026-08-20): typed item/detail/Mixtape models and the reusable detail surface are implemented; item detail now loads through the authenticated filtered API and Play performs real negotiation. Watch Later, custom-Mixtape, favourite, rating, two-device synchronization, and specialized collection/TV Guide routes remain integration gaps.**

- Render movie, show, episode, wrestling, and collection detail models supplied by the API.
- Add Watch Later and custom-Mixtape controls.
- Add a 1–5 star control with 0.25 increments and an explicit clear-rating action.
- Synchronize favourites if retained as a distinct Phase 1 concept.
- Surface only modest recent activity needed for everyday use; reserve diary/profile retrospectives for Phase 2.

**Gate:** actions survive app restart and appear consistently on a second device and in Batcave analytics.

### 10. Integrate Media3 playback

**Status (2026-08-20): Media3 player surface, controls, bounded 15-second seek logic, lifecycle handling, track projection, checkpoint throttling, expiry renewal hooks, and actionable error taxonomy implemented and building. Negotiated authenticated streams now reach Media3 with a bearer header; progress/renewal callbacks and real codec/device playback still require live-device verification and completion.**

- Implement direct and adaptive playback, play/pause, 15-second seek, progress scrub, subtitles, audio tracks, fullscreen/orientation, media-session controls, and resume.
- Send throttled progress events and immediate pause/stop/completion checkpoints.
- Recover from token/URL expiry without losing position.
- Distinguish network, authorization, unsupported-codec, server-conversion, and missing-media failures in user-facing errors.

**Gate:** repeated play, seek, device audio-route changes, background/foreground, screen rotation, interruption, and resume tests pass on representative devices.

### 11. Add resilience, privacy, and observability

**Status (2026-08-20): Android identity/policy-bound cache purging, credential revocation cleanup, no-download policy, idempotency-aware retry rules, diagnostic redaction, retention validation, and fail-closed client schema checks implemented and building. Server backup/restore UI, operational retention jobs, authenticated revocation delivery, and device leakage tests remain.**

- Cache only permitted catalogue data and invalidate it on logout, account change, policy revision, or device revocation.
- Avoid offline media downloads in Phase 1 unless separately approved.
- Add privacy-conscious crash/error diagnostics and server-side session/activity audit views without collecting unnecessary device data.
- Add database backup/migration and retention controls before real friends-and-family use.

**Gate:** revocation removes usable credentials and cached private catalogue data; interrupted writes safely retry.

### 12. Test and ship the private beta

**Status (2026-08-20): versioned beta candidate, reproducible verification/packaging script, checksum, onboarding, privacy, troubleshooting, rollback, staged-tester matrix, and result log produced; Android and Control Centre automated suites pass. Stage 7 and the pair/browse/item/play server vertical slice now pass locally. Physical-device, user-action synchronization, restricted-account, codec, and backup/restore gates remain.**

- Test multiple Android versions, screen sizes, Wi-Fi conditions, Bluetooth/headphone changes, long playback sessions, server restart, token expiry, and restricted accounts.
- Run explicit child/restricted-account leakage tests.
- Produce onboarding, server pairing, troubleshooting, privacy, backup, and rollback instructions.
- Distribute a signed APK privately first; Play Store publication is a later decision.
- Use staged testers: owner, unrestricted adult, restricted adult, collection-only child profile.

**Gate:** no critical security/data-loss defects, agreed playback success rate and startup/seek targets are met, and rollback is documented.

## Phase 2 parking lot

- rich profile and diary pages;
- reviews or written entries;
- December Year in Review generation and presentation;
- personal website identity/content integration;
- social/profile sharing;
- offline downloads;
- casting;
- Android TV/remote-first interface, unless promoted into the initial beta scope later.

## Immediate next step

Install the LAN-beta APK on a physical Android device, restart the Control Centre through the explicit LAN-beta launcher, and repeat the verified pair -> filtered Home -> item -> play -> refresh -> logout flow through the Compose UI. Then wire and verify progress, Watch Later, Mixtapes, ratings, and favourites across two devices before treating the private beta as launchable.
