import assert from "node:assert/strict";
import { authorizePlaybackStream, choosePlaybackProfile, createPlaybackState, negotiatePlayback } from "./api-v1-playback.mjs";

const user = { id: "viewer", role: "viewer", enabled: true, accessMode: "all-except-blocked", allowedCollections: [], blockedRatings: [], blockedItemIds: [], blockedFranchiseIds: [], blockedPathRules: [] };
const deviceSession = { userId: "viewer", deviceId: "pixel" };
const item = { id: "movie-1", type: "movie", rating: "PG", collectionIds: ["comedy"] };
const mp4 = { sourcePath: "M:\\Movies\\Movie.mp4", container: "mp4", durationSeconds: 600, streams: { video: [{ index: 0, codec: "h264" }], audio: [{ index: 1, codec: "aac", language: "en", channels: 2 }], subtitles: [{ index: 2, codec: "webvtt", language: "en" }] } };

assert.equal(choosePlaybackProfile(mp4).delivery, "direct");
assert.equal(choosePlaybackProfile({ ...mp4, container: "mkv", sourcePath: "M:\\Movies\\Movie.mkv" }).delivery, "direct");
assert.deepEqual(choosePlaybackProfile({ ...mp4, streams: { video: [{ codec: "hevc" }], audio: [{ codec: "ac3" }] } }, { videoCodecs: ["h264"], audioCodecs: ["aac"], hls: true }), { protocol: "progressive", delivery: "transcode", mimeType: "video/mp4", seekable: true });
assert.equal(choosePlaybackProfile(mp4, { videoCodecs: ["h264"], audioCodecs: ["aac"], forceTranscode: true }).delivery, "transcode");

const state = createPlaybackState();
const decision = negotiatePlayback(state, { user, deviceSession, item, media: mp4, resumeSeconds: 42 });
assert.equal(decision.resumeSeconds, 42);
assert.equal(decision.url.includes("M:"), false);
assert.equal(JSON.stringify(decision).includes("sourcePath"), false);
assert.equal(decision.tracks.length, 3);
assert.equal(authorizePlaybackStream(state, { sessionId: decision.sessionId, deviceSession }).sourcePath, mp4.sourcePath);
assert.throws(() => authorizePlaybackStream(state, { sessionId: decision.sessionId, deviceSession: { ...deviceSession, deviceId: "other" } }), (error) => error.code === "PLAYBACK_SESSION_NOT_AVAILABLE");
assert.throws(() => negotiatePlayback(state, { user: { ...user, blockedItemIds: [item.id] }, deviceSession, item, media: mp4 }), (error) => error.code === "MEDIA_NOT_AVAILABLE");

console.log("api v1 playback contract ok (profiles, safe decision, authorization binding)");
