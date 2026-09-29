import assert from "node:assert/strict";
import {
  canonicalizeWrestlingSeries,
  inferWrestlingDate,
  inferWrestlingSeriesFromParts,
  isGenericWrestlingDirectory,
  narrowNumberedWrestlingEventCandidates,
} from "./wrestling-scan-logic.mjs";

assert.equal(
  inferWrestlingSeriesFromParts(["Wrestling", "Major Promotions", "TNA", "Weekly", "2014", "S11E37 impact wrestling 2014 09 10"], "wrestling"),
  "Impact",
);
assert.equal(
  inferWrestlingSeriesFromParts(["Wrestling", "Major Promotions", "AEW", "Weekly", "AEW Dynamite", "Season 8 (2026)", "AEW Dynamite 2026 09 02"], "wrestling"),
  "AEW Dynamite",
);
assert.equal(
  inferWrestlingSeriesFromParts(["Wrestling", "Major Promotions", "WWFE", "Weekly", "ECW", "2007", "2007 01 09 WWE ECW"], "wrestling"),
  "ECW",
);
assert.equal(
  inferWrestlingSeriesFromParts(["Wrestling", "Major Promotions", "TNA", "Weekly PPVs", "2003", "NWA TNA 2003 01 08"], "wrestling"),
  "NWA-TNA Weekly PPV",
);
assert.equal(isGenericWrestlingDirectory("Weekly"), true);
assert.equal(isGenericWrestlingDirectory("Season 8 (2026)"), true);
assert.equal(canonicalizeWrestlingSeries("AEW Dynamite", "aew"), "Dynamite");
assert.equal(canonicalizeWrestlingSeries("RAW is WAR", "wwe"), "Monday Night Raw");
assert.equal(canonicalizeWrestlingSeries("WCW Power Hour", "wcw"), "Power Hour");
assert.equal(inferWrestlingDate("S11E10 TNA Impact Wrestling 2014.3.6 HDTV", 2014), "2014-03-06");
assert.equal(inferWrestlingDate("Wcw Monday Nitro 12.29.97 Redub", 1997), "1997-12-29");
assert.equal(inferWrestlingDate("TNA Impact Wrestling 01.10.2014 HDTV", 2014), "2014-01-10");

const clashCandidates = [
  { title: "CLASH OF THE CHAMPIONS XXII", date: "1993-01-13" },
  { title: "CLASH OF THE CHAMPIONS XXIV", date: "1993-08-18" },
  { title: "CLASH OF THE CHAMPIONS XXVIII", date: "1994-08-28" },
];
assert.deepEqual(
  narrowNumberedWrestlingEventCandidates("WCW Clash of the Champions 28", clashCandidates),
  [clashCandidates[2]],
);

console.log("wrestling scan classification checks passed");
