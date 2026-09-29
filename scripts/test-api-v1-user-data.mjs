import assert from "node:assert/strict";
import { clearRating, createMixtape, createUserDataState, deleteMixtape, listMixtapes, recentActivity, setMixtapeItem, setProgress, setRating, updateMixtape } from "./api-v1-user-data.mjs";

const now = Date.parse("2026-08-20T15:00:00Z");
const state = createUserDataState();
const watchLater = listMixtapes(state, "viewer", now)[0];
assert.equal(watchLater.kind, "watch-later");
assert.equal(watchLater.name, "Watch Later");

const added = setMixtapeItem(state, "viewer", watchLater.id, "movie-1", true, 1, now + 1);
assert.deepEqual(added.itemIds, ["movie-1"]);
assert.equal(added.version, 2);
assert.equal(setMixtapeItem(state, "viewer", watchLater.id, "movie-1", true, 2, now + 2).version, 2, "idempotent add does not bump version");
assert.throws(() => updateMixtape(state, "viewer", watchLater.id, { name: "Nope" }, 2), (error) => error.code === "PROTECTED_MIXTAPE");
assert.throws(() => deleteMixtape(state, "viewer", watchLater.id, 2), (error) => error.code === "PROTECTED_MIXTAPE");

const custom = createMixtape(state, "viewer", "Friday Night", now + 3);
const renamed = updateMixtape(state, "viewer", custom.id, { name: "Friday Night Films" }, 1, now + 4);
assert.equal(renamed.version, 2);
assert.throws(() => updateMixtape(state, "viewer", custom.id, { name: "Stale" }, 1), (error) => error.code === "VERSION_CONFLICT" && error.details.current.version === 2);
assert.equal(deleteMixtape(state, "viewer", custom.id, 2), true);

for (const invalid of [3, 4.25, 21]) assert.throws(() => setRating(state, "viewer", "movie-1", invalid), (error) => error.code === "INVALID_RATING");
assert.equal(setRating(state, "viewer", "movie-1", 17, now + 5).quarterStars, 17);
assert.equal(clearRating(state, "viewer", "movie-1"), true);

const progress = setProgress(state, "viewer", { eventId: "device:event-1", itemId: "movie-1", seconds: 120, durationSeconds: 600 }, now + 6);
assert.equal(progress.duplicate, false);
assert.equal(setProgress(state, "viewer", { eventId: "device:event-1", itemId: "movie-1", seconds: 180, durationSeconds: 600 }, now + 7).duplicate, true);
assert.equal(recentActivity(state, "viewer")[0].seconds, 120, "retry does not duplicate or rewrite activity");
assert.equal(setProgress(state, "viewer", { eventId: "device:event-complete", itemId: "movie-1", seconds: 600, durationSeconds: 600, completed: true }, now + 8).completed, true);
assert.equal(setProgress(state, "viewer", { eventId: "device:event-stop", itemId: "movie-1", seconds: 600, durationSeconds: 0, type: "stop" }, now + 9).completed, true, "a final stop checkpoint cannot undo completion");

console.log("api v1 user data ok (Watch Later, Mixtapes, ratings, progress, completion, idempotency)");
