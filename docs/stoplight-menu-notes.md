# Tobytube Stoplight Menu Notes

Last recovered plan from the Migrate Tobytube to D drive thread:

1. Speed audit and quick wins: cache repeated library/file lookups and add light timing diagnostics.
2. Playback preflight: precompute file/title/episode maps and technical playback data so playback starts without rediscovery.
3. Stoplight menu foundation: expose the options menu everywhere, make safe local actions work, and give every heavier action a real panel instead of a dead placeholder.
4. Fix Match overlay: search provider results, show candidates, and let the user choose one.
5. Metadata override layer: persist manual matches, unmatched state, custom metadata, watched state, access settings, mixtape membership, analyze/optimize status, and other decisions so rescans do not undo them.
6. Analyze / Optimize: use ffprobe for technical analysis, then add background optimized-copy/transcode jobs.

Back-pocket ideas from July 2026:

- Subtitles can follow the Fix Match pattern later. Use OpenSubtitles as the primary provider, search by title/year/TMDB or IMDb ID/season/episode/language/runtime/file hash, show subtitle candidates, download the selected subtitle, convert to VTT if needed, and persist the choice in the metadata override layer.
- The user's private movie-tracking website can receive watched events later. Best initial shape: after Mark as Watched, show an Add to Website action that POSTs title/year/provider IDs/watched date/runtime/poster/rating to the site. Later this can become automatic webhook sync with retry queue.
- Merged-item editing needs separate shared-page and per-version metadata. The current merge is a browser-local display alias, and the metadata resolver deliberately shares overrides across merged IDs. Do not add an "edit individual item" control until version-specific overrides can be stored without leaking onto the shared page.
- **Launch Feature — automatic TWDB updates:** Do not activate the daily timer during local development. When TobyTube is being launched as a real live server, add one guarded daily orchestrator rather than scheduling importers independently: incremental source cursors, allowed event-type filtering, house-show exclusion, anomaly quarantine, validation, atomic publish, library regeneration, and a durable last-success report. Expose the same job through the Batcave with an overdue startup catch-up.

Current phase marker:
- Phase 4 is complete at the local workflow level: Fix Match searches TMDB candidates, shows results, lets the user choose one, remembers the selected candidate in `localStorage` as `tobytube.selectedMatch.<itemId>`, and lets the user clear it.
- Phase 5 is complete: manual matches/unmatched state, metadata edits, watched state, access settings, mixtape membership, and analyze/optimize request status persist in `config/metadata-overrides.json` through `/api/metadata/overrides`, with local fallback for browser continuity.
- Phase 6 is complete at the functional workflow level: Analyze runs ffprobe and persists normalized container, codec, resolution, bitrate, audio, and subtitle results. Optimize starts a background FFmpeg H.264/AAC job, writes into a non-destructive `.tobytube-optimized` folder, persists job state, and exposes status in the stoplight panel.
- The app now loads metadata overrides at startup, merges successful saves into the in-memory override index, and applies saved title/year/genre/rating/summary edits to title details, card titles, and meta lines. Clear Match also persists a durable null match.
- TV refresh work is in place with `/api/metadata/refresh-tv`, `scripts/fetch-tv-details.mjs --refresh-existing`, generated season/episode hydration, and scanned-season merging so shows can be refreshed after new episodes or metadata arrive.
