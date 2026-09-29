import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduleSource = await readFile(new URL("../src/player-time.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`;
const { buildPlaybackRecoveryState, getAbsolutePlaybackTime } = await import(moduleUrl);
const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

assert.equal(getAbsolutePlaybackTime({}, 90), 90, "fresh playback should use the video clock");
assert.equal(
  getAbsolutePlaybackTime({ startSeconds: 600 }, 600),
  1200,
  "resumed playback must add elapsed playback to the original resume point",
);
assert.equal(
  getAbsolutePlaybackTime({ segmentOffsetSeconds: 3600, startSeconds: 300 }, 120),
  4020,
  "multipart playback must include both segment and resume offsets",
);

const recovered = buildPlaybackRecoveryState({ transport: "jellyfin-hls", startSeconds: 600 }, 600);
assert.equal(recovered.transport, "local-transcode");
assert.equal(recovered.startSeconds, 1200, "recovery must restart at the live position, not the stale resume point");

const recoveredAgain = buildPlaybackRecoveryState(recovered, 120);
assert.equal(recoveredAgain.startSeconds, 1320, "a second recovery must remain monotonic");

assert.match(
  appSource,
  /function launchTitlePlayback[\s\S]*?stopTeebeeShuffle\(\);[\s\S]*?state\.player = payload;/,
  "movie playback must stop the ambient TeeBee shuffle timer",
);
assert.match(
  appSource,
  /function launchTvEpisodeLocation[\s\S]*?stopTeebeeShuffle\(\);[\s\S]*?state\.player = buildTvPlaybackPayload/,
  "episode playback must stop the ambient TeeBee shuffle timer",
);
assert.match(
  appSource,
  /function playRandomTeebeeEpisode\(\) \{\s*[^}]*if \(state\.player\) \{\s*stopTeebeeShuffle\(\);\s*return;/,
  "an already-open player must block and cancel an ambient TeeBee redraw",
);
assert.match(
  appSource,
  /function render\(\) \{[\s\S]*?if \(state\.player\) stopTeebeeShuffle\(\);/,
  "every player render must enforce the ambient-timer invariant",
);

console.log("player time and recovery checks passed");
