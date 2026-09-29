import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const moduleSource = readFileSync(new URL("../src/animation-randomizer.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`;
const {
  ANIMATION_TV_EPISODES_PER_MOVIE,
  appendAnimationRandomHistory,
  getNextAnimationMediaKind,
  moveAnimationRandomHistory,
  selectAnimationRandomCandidate,
} = await import(moduleUrl);

assert.equal(getNextAnimationMediaKind({ moviesEnabled: false, tvEpisodesSinceMovie: 99 }, { tvCount: 4, movieCount: 3 }), "tv");
assert.equal(getNextAnimationMediaKind({ moviesEnabled: true, tvEpisodesSinceMovie: 9 }, { tvCount: 4, movieCount: 3 }), "tv");
assert.equal(getNextAnimationMediaKind({ moviesEnabled: true, tvEpisodesSinceMovie: ANIMATION_TV_EPISODES_PER_MOVIE }, { tvCount: 4, movieCount: 3 }), "movie");
assert.equal(getNextAnimationMediaKind({ moviesEnabled: true, tvEpisodesSinceMovie: 20 }, { tvCount: 0, movieCount: 3 }), null);
assert.equal(selectAnimationRandomCandidate([{ key: "a" }, { key: "b" }], ["a"], () => 0).key, "b");
assert.equal(selectAnimationRandomCandidate([{ key: "a" }], ["a"], () => 0).key, "a");

const historySession = { history: [], historyIndex: -1 };
appendAnimationRandomHistory(historySession, { key: "episode:a" });
appendAnimationRandomHistory(historySession, { key: "episode:b" });
assert.equal(moveAnimationRandomHistory(historySession, -1).key, "episode:a");
assert.equal(moveAnimationRandomHistory(historySession, -1), null);
assert.equal(moveAnimationRandomHistory(historySession, 1).key, "episode:b");
appendAnimationRandomHistory(historySession, { key: "episode:c" });
assert.deepEqual(historySession.history.map((entry) => entry.key), ["episode:a", "episode:b", "episode:c"]);

moveAnimationRandomHistory(historySession, -1);
appendAnimationRandomHistory(historySession, { key: "episode:d" });
assert.deepEqual(historySession.history.map((entry) => entry.key), ["episode:a", "episode:b", "episode:d"]);
assert.equal(historySession.historyIndex, 2);

console.log("animation randomizer checks passed");
