import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduleSource = await readFile(new URL("../src/shorts-playback.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`;
const { getNextSequentialShortId, selectRandomShortId } = await import(moduleUrl);

assert.equal(getNextSequentialShortId(["a", "b", "c"], "a"), "b");
assert.equal(getNextSequentialShortId(["a", "b", "c"], "c"), null);
assert.equal(selectRandomShortId(["a", "b", "c"], "b", () => 0), "a");
assert.equal(selectRandomShortId(["a", "b", "c"], "b", () => 0.999), "c");
assert.equal(selectRandomShortId(["only"], "only", () => 0.5), "only");
assert.equal(selectRandomShortId([], null, () => 0), null);

console.log("shorts playback mode checks passed");
