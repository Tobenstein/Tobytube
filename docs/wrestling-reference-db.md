# Wrestling Reference Database

The wrestling reference database is a local encyclopedia, not the visible media library.

Records can exist here for shows, events, matches, venues, championships, and reigns without appearing anywhere in Tobytube. A record becomes visible only after a matching media file exists in the library scan.

## Lookup Order

1. Scan a media file.
2. Parse promotion, series/event name, date, season year, and episode hints from path/filename.
3. Match against the local wrestling reference DB.
4. If found, hydrate the library item from reference data.
5. Resolve art separately: local art cache, saved TMDB ID, then TMDB search fallback.
6. If not found in the reference DB, use TMDB as a good-enough fallback and mark the item as needing reference metadata.

## Core Tables

- `promotions`: WWE, WCW, ECW, TNA/Impact, AWA, WCCW, AEW, ROH, NJPW, AJPW, NOAH.
- `series`: weekly or recurring TV, such as Raw, SmackDown, Nitro, Thunder, Jakked.
- `events`: PPVs, specials, tournaments, supercards.
- `episodes`: dated weekly TV episodes.
- `venues`: normalized venue/city/region/country.
- `people`: wrestlers, managers, referees, announcers.
- `matches`: spoiler-safe card structure and source result text.
- `championships`: title definitions.
- `titleReigns`: champion, win date/event, loss date/event, reign number, days, recognized days.
- `externalIds`: TMDB, Wikidata, Wikipedia, Cagematch, TheSmackDownHotel, and source-page IDs.
- `sourceRecords`: provenance, source URL, scrape timestamp, confidence, and raw-source fingerprints.

## Visibility Rule

Reference records never auto-populate the media player. The library only displays:

- matched local files,
- manually added virtual entries,
- or explicit admin/debug reference views.

The ordinary viewer never sees 15,000 missing episodes just because the reference DB knows they exist.

## Source Strategy

TheSmackDownHotel is first choice for major/active events because its event database exposes promotion, date/year, series, location filters, and detail pages.

Cagematch fills defunct-promotion and historical gaps, but requires a browser/session-aware adapter.

Wrestlingdata is a strong browser/session-aware source for programming and event cards. Promotion-year pages expose dated archive rows with event type, attendance, and card availability. Card pages expose general event facts and spoiler-safe match listings, including title matches, stipulations, champion markers, participants, teams, announcers, venues, cities, regions, and countries.

Wikipedia champion-list pages are the first title-reign source because the relevant reign tables are structured and reusable.

## Wrestlingdata Import Shape

Wrestlingdata pages are exported from a browser session into JSON, then imported locally:

```powershell
node scripts/import-wrestlingdata-export.mjs cache/wrestlingdata-ecw-2001-sample.json
```

The importer writes event rows for PPVs/specials/house shows, episode rows when an archive entry identifies television programming, spoiler-safe `matches`, linked `people`, and championship seed records for title matches.
