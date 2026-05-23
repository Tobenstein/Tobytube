# Tobytube

A personal media-server prototype focused on movies, TV, and wrestling timeline browsing.

## Current Prototype

Launch the app server:

```powershell
node scripts/start-service.mjs
```

Or double-click `Launch-Tobytube.cmd` from the project folder. For a foreground server you can stop with `Ctrl+C`, run `.\scripts\launch-tobytube.ps1`. The server serves the UI and runs the metadata scanner on startup using `config/tobytube.config.json`.

The current build includes:

- Library sections for movies, TV, wrestling, and future collections.
- Movie placeholders for 30 films across American, British, French, and Japanese shelves.
- TV placeholders for The Mighty Boosh, Toast of London, Derry Girls, Little Britain, and a sparse Bob's Burgers sample.
- Movies and TV now have home, library, and collections views.
- Movies, TV, and wrestling cards open a shared title screen with poster art, details, playback settings, and cast/crew navigation.
- Poster rendering supports TMDB poster URLs through `src/tmdb-posters.generated.json`.
- Wrestling promotion browser.
- WWE dummy data for 1997-2005.
- WCW dummy data for 1995-2001, including Nitro, Thunder, WCW Saturday Night, Clash specials, and PPVs.
- Weekly show lanes for Raw, SmackDown, Sunday Night Heat, Jakked, Nitro, Thunder, and WCW Saturday Night.
- Pay-per-view list by calendar year.
- A "By Year" timeline that merges weekly shows and PPVs chronologically.

## Wrestling Data Model

Wrestling media is modeled as:

- `promotion`: WWE, WCW, ECW, AEW, NJPW, etc.
- `series`: weekly shows such as Raw or SmackDown.
- `event`: pay-per-views, specials, tournaments, and supercards.
- `season`: calendar year for weekly wrestling shows.
- `timeline`: merged dated media for one promotion and year.

The static data is intentionally TMDB-ready: each item has a stable ID, title, date, type, season/year, and metadata source field. A later backend can replace the seeded objects with TMDB lookups and local file matches.

The richer wrestling encyclopedia lives in `src/wrestling-reference.generated.json`. It is not the visible library. It can contain historical episodes, PPVs, matches, venues, title reigns, and source IDs without showing them in the player. During a scan, a local media file is parsed first; only then does the scanner check the reference DB and hydrate the matched file.

Initialize or inspect the reference DB:

```powershell
node scripts/wrestling-reference-db.mjs init
node scripts/wrestling-reference-db.mjs summary
```

The source registry is in `config/wrestling-reference-sources.json`.

Import one TheSmackDownHotel event detail page:

```powershell
node scripts/import-sdh-event.mjs https://www.thesmackdownhotel.com/events-results/ppv-special/wwe-wrestlemania-39
```

Import a Wikipedia championship reign table:

```powershell
node scripts/import-wikipedia-title-reigns.mjs https://en.wikipedia.org/wiki/List_of_WCW_World_Heavyweight_Champions --championship-id wcw-world-heavyweight --championship-name "WCW World Heavyweight Championship"
```

Import championship seeds and linked reign-list pages from a Wikipedia championship template:

```powershell
node scripts/import-wikipedia-championship-template.mjs https://en.wikipedia.org/wiki/Template:WWE_Championships
```

Import the broad professional wrestling TV-series catalog:

```powershell
node scripts/import-wikipedia-wrestling-tv-series.mjs https://en.wikipedia.org/wiki/List_of_professional_wrestling_television_series
```

Import a Wrestlingdata browser export:

```powershell
node scripts/import-wrestlingdata-export.mjs cache/wrestlingdata-ecw-2001-sample.json
```

Wrestlingdata is the preferred source for full promotion-year event archives and spoiler-safe cards. The browser export step handles Wrestlingdata's session requirements; the import step is local and fast.

Generate a visible prototype wrestling-library slice from the reference DB:

```powershell
node scripts/generate-wrestling-library.mjs --promotion wwe --start-year 1990 --end-year 1999
```

Hydrate TMDB season/show posters for that visible slice:

```powershell
node scripts/fetch-wrestling-season-posters.mjs --promotion wwe --start-year 1990 --end-year 1999
```

The generated library remains dummy/prototype data. It is deliberately separate from the reference DB so the final player can still obey the rule that reference records only become visible after a matching media file is added.

## Likely Architecture

- Server: media scanner, metadata sync, user access, watch history, stream authorization.
- Transcoding: FFmpeg with direct-play whenever possible.
- Storage: PostgreSQL or SQLite for metadata, plus filesystem paths for media files.
- Clients: responsive web app first, then Android/Fire TV wrappers if needed.
- Remote sharing: reverse proxy plus HTTPS, user accounts, and per-user library grants.

## Next Build Step

The next useful slice is a backend scanner that reads a media root, normalizes paths into movies/TV/wrestling candidates, and stores unmatched wrestling files for manual mapping.

## Metadata Pipeline

The prototype now has a local scanner/parser/matcher pipeline:

```powershell
node scripts/metadata-pipeline.mjs --media-root sample-media
```

It writes `src/metadata.generated.json`, including:

- Seed records for movies, TV, promotions, and generated wrestling events.
- Parsed local media files when a `--media-root` is provided.
- Match confidence and parsed filename details.
- Poster/logo art references from `src/tmdb-posters.generated.json`.
- An `unmatchedFiles` queue for manual review.

With a TMDB key, the same pipeline can refresh provider posters for movies, TV, wrestling events, and wrestling weekly-show records:

```powershell
node scripts/metadata-pipeline.mjs --media-root "D:\Media" --refresh-providers
```

Put your TMDB credentials in a local `.env` file first. Prefer the read access token if you have it:

```ini
TMDB_READ_ACCESS_TOKEN=your-read-access-token
TMDB_API_KEY=your-api-key
```

The `.env` file is ignored by git. Restart the preview server after changing it so startup scans inherit the new credentials.

Wrestling records are intentionally handled as promotion/timeline records first, because event and weekly-show matching needs different rules from ordinary movies and TV.

## Startup Scanning

Configure source folders in `config/tobytube.config.json`:

```json
{
  "port": 8092,
  "scanOnStartup": true,
  "refreshProviders": true,
  "mediaRoots": ["sample-media"]
}
```

When `scripts/tobytube-server.mjs` starts, it runs the metadata pipeline automatically. The UI reads `/api/metadata/status` for scan state and exposes a `Rescan` button that posts to `/api/metadata/rescan`.

This is the Plex/Jellyfin-style shape we want: new files are discovered at launch, metadata is applied automatically, and unmatched files are retained for manual review instead of disappearing.

To scrape a wrestling event page from Wikipedia:

```powershell
node scripts/fetch-wrestling-event-metadata.mjs WrestleMania X-Seven
```

This writes `src/wrestling-metadata.generated.json` with event poster art, venue, city, attendance, buyrate, tagline, summary, and match results where the page exposes a wrestling results table.

## TMDB Posters

Create TMDB credentials, add them to `.env`, then run:

```powershell
node scripts/fetch-tmdb-posters.mjs
```

The script writes poster mappings to `src/tmdb-posters.generated.json`. The app loads that file at runtime and falls back to generated placeholder posters when a poster is missing.

For a no-key prototype pass, run:

```powershell
node scripts/fetch-wikipedia-posters.mjs
```

That script scrapes Wikipedia/Wikimedia page images for the current dummy library and writes the same poster manifest.
