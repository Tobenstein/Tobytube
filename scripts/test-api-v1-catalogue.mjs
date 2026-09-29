import assert from "node:assert/strict";
import { authorizedCollection, authorizedHome, authorizedItem, authorizedSearch, authorizedSection, buildCatalogueIndex, decodeCursor } from "./api-v1-catalogue.mjs";
const admin = { id: "owner", enabled: true, role: "admin", accessMode: "all-except-blocked", allowedCollections: [], blockedRatings: [], blockedItemIds: [], blockedFranchiseIds: [], blockedPathRules: [] };
const viewer = { ...admin, id: "child", role: "viewer", blockedRatings: ["R"], blockedPathRules: ["Private"] };
const metadata = { records: [{ id: "safe", title: "Safe Film", mediaType: "movie", year: 2001, rating: "PG", files: [{ path: "M:\\Comedy\\Safe Film (2001).mp4", mediaSourceId: "movies", modifiedAt: "2026-01-01T00:00:00Z", streams: { durationSeconds: 90, video: [{ codec: "h264" }], audio: [{ codec: "aac" }] } }] }, { id: "private", title: "Private Film", mediaType: "movie", rating: "R", files: [{ path: "M:\\Private\\Private Film.mp4", mediaSourceId: "movies" }] }, { id: "ghost", title: "Unavailable", mediaType: "movie", files: [] }] };
const items = buildCatalogueIndex(metadata);
assert.equal(items.length, 2);
const viewerHomeCards = authorizedHome(viewer, items).rows.flatMap((row) => row.items);
assert.deepEqual([...new Set(viewerHomeCards.filter((item) => item.type !== "collection").map((item) => item.id))], ["safe"]);
assert.equal(viewerHomeCards.some((item) => item.id.includes("private")), false);
assert.deepEqual(authorizedSearch(viewer, items, "film").items.map((item) => item.id), ["safe"]);
assert.equal(authorizedItem(viewer, items, "safe").title, "Safe Film");
assert.throws(() => authorizedItem(viewer, items, "private"), (error) => error.code === "MEDIA_NOT_AVAILABLE" && error.statusCode === 404);
assert.equal(JSON.stringify(authorizedItem(admin, items, "safe")).includes("M:\\"), false);
assert.equal(decodeCursor(Buffer.from("30").toString("base64url")), 30);

const enriched = buildCatalogueIndex({ records: [
  metadata.records[0],
  { id: "show", title: "Old Scanned Show", mediaType: "tv", files: [{ path: "T:\\TV\\Old Scanned Show\\Season 1\\S01E01.mp4", mediaSourceId: "tv", parsed: { season: 1, episode: 1 }, streams: {} }] },
] }, {
  overrides: { items: {
    safe: { metadata: { title: "Correct Matched Film", year: 2002, summary: "Authoritative synopsis.", runtime: 101, posterUrl: "/matched-poster.jpg" } },
    "franchise-example": { metadata: { recordType: "franchise", title: "Example Franchise", memberIds: ["safe", "show"] } },
  } },
  tvDetails: { show: { title: "Correct Matched Show", year: 2020, summary: "Show synopsis.", averageRuntime: 24, posterUrl: "/show.jpg", seasons: [{ seasonNumber: 1, title: "Season One", overview: "Season synopsis.", posterUrl: "/season.jpg", episodes: [{ episodeNumber: 1, title: "Pilot", overview: "Episode synopsis.", airDate: "2020-01-02", runtime: 25, stillUrl: "/pilot.jpg" }] }] } },
});
const enrichedMovie = authorizedItem(admin, enriched, "safe");
assert.equal(enrichedMovie.title, "Correct Matched Film");
assert.equal(enrichedMovie.synopsis, "Authoritative synopsis.");
assert.equal(enrichedMovie.year, 2002);
assert.equal(enrichedMovie.artworkUrl, "/matched-poster.jpg");
const creditSearchItems = buildCatalogueIndex({ records: [
  { id: "credits", title: "An Oblique Title", mediaType: "movie", director: "Agnès Varda", cast: [{ name: "Sandrine Bonnaire", character: "Mona" }], files: [{ path: "M:\\An Oblique Title.mkv" }] },
] });
assert.deepEqual(authorizedSearch(admin, creditSearchItems, "agnes varda").items.map((item) => item.id), ["credits"]);
assert.deepEqual(authorizedSearch(admin, creditSearchItems, "Sandrine Bonnaire").items.map((item) => item.id), ["credits"]);
const enrichedShow = authorizedItem(admin, enriched, "show");
assert.equal(enrichedShow.title, "Correct Matched Show");
assert.equal(enrichedShow.synopsis, "Show synopsis.");
assert.deepEqual(enrichedShow.relatedRows.find((row) => row.id === "franchise-movies")?.items.map((item) => item.id), ["safe"]);
assert.deepEqual(enrichedMovie.relatedRows.find((row) => row.id === "franchise-tv")?.items.map((item) => item.id), ["show"]);
const season = authorizedItem(admin, enriched, "show:season:1");
assert.equal(season.title, "Season One");
assert.equal(season.artworkUrl, "/season.jpg");
const episode = authorizedItem(admin, enriched, "show:s01e01");
assert.equal(episode.title, "Pilot");
assert.equal(episode.synopsis, "Episode synopsis.");
assert.equal(episode.artworkUrl, "/pilot.jpg");
assert.equal(episode.durationSeconds, 1500);

const upnItems = buildCatalogueIndex({ records: [{ id: "upn-film", title: "UPN Film", mediaType: "movie", files: [{ path: "M:\\Collections\\Boxed Sets\\UPN\\Drama\\UPN Film (2001).mp4", mediaSourceId: "movies" }] }] });
const upnCurated = { collections: { "black-excellence": { sections: [{ id: "drama", title: "Drama", items: [{ id: "upn-film", title: "UPN Film", year: 2001 }] }] } } };
const boxedSets = authorizedSection(admin, upnItems, "collections", 20, upnCurated).rows.find((row) => row.title === "Boxed Sets");
assert.equal(boxedSets?.items.find((item) => item.collectionId === "upn")?.title, "UPN");
assert.equal(boxedSets?.items.find((item) => item.collectionId === "upn")?.artworkUrl, "/assets/collections/black-excellence/upn-button.png");
const upnPage = authorizedCollection(admin, upnItems, "upn", 30, upnCurated);
assert.equal(upnPage.page.title, "UPN");
assert.deepEqual(upnPage.rows.map((row) => row.title), ["Drama"]);
assert.deepEqual(upnPage.rows[0].items.map((item) => item.id), ["upn-film"]);

const hierarchyItems = buildCatalogueIndex({ records: [
  { id: "boxed-animation", title: "Boxed Animation", mediaType: "movie", files: [{ path: "M:\\Collections\\Boxed Sets\\Animation\\Cinema\\Boxed Animation (2001).mp4", mediaSourceId: "movies" }] },
  { id: "mcu-animation", title: "MCU Animation", mediaType: "movie", files: [{ path: "M:\\Collections\\Sagas\\MCU\\Animation\\MCU Animation (2002).mp4", mediaSourceId: "movies" }] },
] });
assert.deepEqual(authorizedCollection(admin, hierarchyItems, "animation").rows.flatMap((row) => row.items).map((item) => item.id), ["boxed-animation"]);
assert.deepEqual(authorizedCollection(admin, hierarchyItems, "mcu").rows.flatMap((row) => row.items).map((item) => item.id), ["mcu-animation"]);

const rentalData = { progress: {
  safe: { itemId: "safe", seconds: 65, durationSeconds: 90, completed: false, updatedAt: "2026-08-21T10:00:00Z" },
  private: { itemId: "private", seconds: 65, durationSeconds: 90, completed: false, updatedAt: "2026-08-21T11:00:00Z" },
} };
const rentalRow = authorizedHome(viewer, items, 20, null, rentalData).rows.find((row) => row.id === "current-rentals");
assert.deepEqual(rentalRow.items.map((item) => item.id), ["safe"]);
assert.equal(rentalRow.items[0].progress, 65 / 90);

const recentItems = buildCatalogueIndex({ records: [
  { id: "older-film", title: "Older Film", mediaType: "movie", files: [{ path: "M:\\Older Film.mp4", modifiedAt: "2026-08-01T00:00:00Z", addedAt: "2026-08-01T00:00:00Z", libraryUpdatedAt: "2026-08-01T00:00:00Z" }] },
  { id: "updated-show", title: "Updated Show", mediaType: "tv", files: [
    { path: "T:\\Updated Show\\S01E01.mp4", parsed: { season: 1, episode: 1 }, modifiedAt: "2025-01-01T00:00:00Z", addedAt: "2026-07-01T00:00:00Z", libraryUpdatedAt: "2026-07-01T00:00:00Z" },
    { path: "T:\\Updated Show\\S02E01.mp4", parsed: { season: 2, episode: 1 }, modifiedAt: "2024-01-01T00:00:00Z", addedAt: "2026-08-20T00:00:00Z", libraryUpdatedAt: "2026-08-20T00:00:00Z" },
  ] },
] });
assert.deepEqual(authorizedHome(admin, recentItems).rows.find((row) => row.id === "new").items.map((item) => item.id), ["updated-show", "older-film"]);

const mergedVersions = buildCatalogueIndex({ records: [
  { id: "colour", title: "Example Film", mediaType: "movie", files: [{ path: "M:\\Example Film [Colour].mkv" }] },
  { id: "mono", title: "Example Film Minus Colour", mediaType: "movie", files: [{ path: "M:\\Example Film [B&W].mkv" }] },
] }, { overrides: { items: {
  colour: { metadata: { mergedIntoId: "colour", mergeType: "single-film" } },
  mono: { metadata: { mergedIntoId: "colour", mergeType: "single-film" } },
} } });
assert.deepEqual(mergedVersions.filter((item) => item.type === "movie").map((item) => item.id), ["colour"]);
assert.deepEqual(mergedVersions.find((item) => item.id === "colour")?.sourcePaths, ["M:\\Example Film [Colour].mkv", "M:\\Example Film [B&W].mkv"]);

assert.equal(boxedSets?.items.find((item) => item.collectionId === "upn")?.artworkUrl, "/assets/collections/black-excellence/upn-button.png");
console.log("api v1 catalogue ok (projection, enrichment, hierarchy, rentals, filtering, non-disclosure, pagination)");
