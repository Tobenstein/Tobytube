import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "src", "nwa-history.generated.json");
const rulesPath = path.join(root, "config", "nwa-history-normalization-rules.json");
const identityPath = path.join(root, "config", "wrestling-identity-rules.json");
const curated24Path = path.join(root, "src", "nwa-history-volume-024.curated.json");
const outputPath = path.join(root, "src", "nwa-history.normalized.json");

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const rules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
const identities = JSON.parse(fs.readFileSync(identityPath, "utf8"));
const curated24 = JSON.parse(fs.readFileSync(curated24Path, "utf8"));

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const datePattern = /(?<!\d)(\d{1,2})[\/lI](\d{1,2})[\/lI]?(19\d{2}|20\d{2})(?!\d)/g;
const simpleYearPattern = /(?<!\d)(19\d{2}|20\d{2})(?!\d)/g;

function normalizeDateText(text) {
  return clean(text)
    .replace(/(\d{1,2})[\/lI](\d{2})(19\d{2}|20\d{2})\b/g, "$1/$2/$3")
    .replace(/\b(\d{1,2})(\d{2})[\/lI](19\d{2}|20\d{2})\b/g, "$1/$2/$3")
    .replace(/\b(\d{1,2})[\/lI](\d{1,2})[lI](19\d{2}|20\d{2})\b/g, "$1/$2/$3");
}

function extractDate(text) {
  const normalized = normalizeDateText(text);
  const matches = [...normalized.matchAll(datePattern)];
  if (!matches.length) return { normalized, date: null, rawDate: null };
  const match = matches.at(-1);
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const valid = month >= 1 && month <= 12 && day >= 1 && day <= 31;
  return {
    normalized,
    date: valid ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null,
    rawDate: match[0],
  };
}

function candidateLines(volume) {
  return (volume.ocrLines ?? [])
    .filter((line) => line.relativeX < 0.49 && line.relativeY < 0.72)
    .map((line) => clean(line.text))
    .filter((text) => text && !/^(history|of the|nwa$|volume\b|dvd\b|dolby\b|sports television|\d+\s*min\.?|1[.:]33|sl\/ss)/i.test(text));
}

function groupCoverEntries(volume) {
  const groups = [];
  let pending = [];
  for (const line of candidateLines(volume)) {
    const startsMatch = /^.{2,80}\s+(?:vs\.?|versus)\s+/i.test(line);
    const startsSegment = /\b(?:interview|confrontation|tribute|attack(?:s|ed)?|brawl|workout|challenge|announcement|contract signing|press conference)\b/i.test(line);
    const pendingText = clean(pending.join(" "));
    const pendingHasContent = /\b(?:vs\.?|versus|interview|confrontation|tribute|attack(?:s|ed)?|brawl|workout|challenge|announcement|contract signing|press conference)\b/i.test(pendingText);
    if (pending.length && pendingHasContent && (startsMatch || startsSegment)) {
      groups.push(pendingText);
      pending = [];
    }
    pending.push(line);
    const dated = extractDate(pending.join(" "));
    if (!dated.date) continue;
    groups.push(clean(pending.join(" ")));
    pending = [];
  }
  if (pending.length) {
    const tail = clean(pending.join(" "));
    if (groups.length && /^\([^)]*(wins?|title|champ|match|clips?|jip|jp)/i.test(tail)) groups[groups.length - 1] = `${groups.at(-1)} ${tail}`;
    else if (tail) groups.push(tail);
  }
  return groups.flatMap((group) => {
    const pieces = group.split(/(?<=\b(?:19\d{2}|20\d{2})\)?)(?=\s+[A-Z][^\n]{1,75}\s+(?:vs\.?|Interview|Confrontation|attacks?|Tribute)\b)/i).map(clean).filter(Boolean);
    return pieces.length ? pieces : [group];
  });
}

function findSourceProgram(raw) {
  const entries = Object.entries(rules.sourcePrograms).sort((a, b) => b[0].length - a[0].length);
  const hit = entries.find(([token]) => new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(raw));
  return hit ? { canonical: hit[1], raw: hit[0] } : null;
}

function findChampionship(raw) {
  const entries = Object.entries(rules.championships).sort((a, b) => b[0].length - a[0].length);
  const hit = entries.find(([token]) => new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(raw));
  return hit ? { ...hit[1], raw: hit[0] } : null;
}

function findStipulations(raw) {
  const values = [];
  if (/\b(?:steel\s+)?cage(?:\s+match)?\b/i.test(raw)) values.push("Steel Cage Match");
  if (/\blights?\s+out(?:\s+match)?\b/i.test(raw)) values.push("Lights Out Match");
  if (/\bempty\s+arena(?:\s+match)?\b/i.test(raw)) values.push("Empty Arena Match");
  const pole = raw.match(/\b([^(),]{1,45}\bon\s+a\s+pole)\s+match\b/i);
  if (pole) values.push(`${clean(pole[1])} Match`);
  if (/\b2\s*\/\s*3\s+falls?\b|\btwo\s+out\s+of\s+three\s+falls?\b/i.test(raw)) values.push("Two-out-of-Three Falls Match");
  if (/\bflag\s+vs\.?\s+flag\b/i.test(raw)) values.push("Flag vs. Flag Match");
  return [...new Set(values)];
}

function presentationFlags(raw) {
  const flags = [];
  if (/\((?:JIP|JP)\)|\b(?:JIP|JP)\b/i.test(raw)) flags.push("Joined in progress");
  if (/\bclips?\b|\bclipped\b/i.test(raw)) flags.push("Clips");
  return flags;
}

function normalizeAliases(text) {
  let value = text;
  for (const [alias, canonical] of Object.entries(rules.participantAliases)) {
    value = value.replace(new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), canonical);
  }
  return clean(value);
}

function stripMetadata(raw, date, sourceProgram, championship) {
  let value = normalizeDateText(raw);
  if (date?.rawDate) value = value.replace(date.rawDate, " ");
  value = value
    .replace(/\((?:JIP|JP|Clips?)\)/gi, " ")
    .replace(/\((?:[^)]*\b(?:wins?|won)\b[^)]*)\)/gi, " ")
    .replace(/\s+-\s+(?:Cage Match|NWA FL TV|FL TV|CWF|AJPW TV|NWA Georgia TV|GA TV|MA TV|NWA Sat|Main Event|WWW|Clash|Bash 90)\b/gi, " ");
  if (sourceProgram) value = value.replace(new RegExp(sourceProgram.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  if (championship) value = value.replace(new RegExp(championship.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  value = value.replace(/\b(?:Steel\s+)?Cage\s+Match\b/gi, " ").replace(/\s+-\s*$/g, " ");
  return normalizeAliases(clean(value).replace(/^[-–—:]+|[-–—:]+$/g, ""));
}

function splitSides(title) {
  const parts = title.split(/\s+vs\.?\s+/i);
  if (parts.length < 2) return [];
  return parts.slice(0, 2).map((displayName) => ({ displayName: clean(displayName), participantIds: [] }));
}

function inferTitleFromResult(raw) {
  const result = raw.match(/\b([A-Za-z][A-Za-z .'-]+?)\s+wins?\s+(?:the\s+)?([^)]*?\b(?:title|championship))\b/i);
  if (!result) return null;
  const winner = normalizeAliases(clean(result[1]));
  const resultTitle = clean(result[2]);
  const championship = findChampionship(resultTitle) ?? { id: null, name: resultTitle, raw: resultTitle };
  return { winner, championship, raw: result[0] };
}

function segmentType(raw) {
  if (/\bvs\.?\b|\bversus\b/i.test(raw)) return "match";
  if (/\binterview\b/i.test(raw)) return "interview";
  if (/\bconfrontation\b/i.test(raw)) return "confrontation";
  if (/\battack(?:s|ed)?\b|\bbrawl\b/i.test(raw)) return "angle";
  if (/\btribute\b/i.test(raw)) return "tribute";
  return "segment";
}

function normalizeEntry(raw, order) {
  const dateInfo = extractDate(raw);
  const sourceProgram = findSourceProgram(raw);
  const resultInference = inferTitleFromResult(raw);
  const championship = resultInference?.championship ?? findChampionship(raw);
  const stipulations = findStipulations(raw);
  const presentation = presentationFlags(raw);
  const type = segmentType(raw);
  let displayTitle = stripMetadata(raw, dateInfo, sourceProgram, championship);
  displayTitle = displayTitle.replace(/\s*\([^)]*\b(?:wins?|won)\b[^)]*\)\s*/gi, " ");
  let sides = type === "match" ? splitSides(displayTitle) : [];
  let titleChange = false;
  let winner = null;
  if (type === "match" && resultInference && sides.length === 2) {
    winner = resultInference.winner;
    const winnerIndex = sides.findIndex((side) => side.displayName.toLowerCase().includes(winner.toLowerCase()) || winner.toLowerCase().includes(side.displayName.toLowerCase()));
    if (winnerIndex >= 0) {
      const championIndex = winnerIndex === 0 ? 1 : 0;
      sides[championIndex].champion = true;
      sides[winnerIndex].champion = false;
      titleChange = true;
      sides = [sides[championIndex], sides[winnerIndex]];
      displayTitle = `${sides[0].displayName} (c) vs ${sides[1].displayName}`;
    }
  }
  const context = [];
  if (championship?.name) context.push(championship.name);
  context.push(...stipulations);
  if (sourceProgram?.canonical) context.push(sourceProgram.canonical);
  context.push(...presentation);
  if (dateInfo.date) {
    const [year, month, day] = dateInfo.date.split("-");
    context.push(`${month}/${day}/${year}`);
  }
  const suspicious = !dateInfo.date || /\b(?:jobbers?|unknown|\?{2,})\b/i.test(raw) || /[01]\d{3}\d/.test(raw);
  return {
    order, type, date: dateInfo.date, displayTitle: clean(displayTitle), contextLine: [...new Set(context)].join(" — "),
    sides, sourceProgram, championship: championship ? { id: championship.id ?? null, name: championship.name } : null,
    stipulations, presentation, titleChange, winner: winner || null, displayResult: false,
    rawSource: raw, evidence: resultInference ? { resultText: resultInference.raw, usedForContext: true } : null,
    reviewStatus: suspicious ? "automated-needs-review" : "automated-unreviewed",
  };
}

const volumes = source.volumes.map((volume) => {
  if (volume.volume === 24) return { volume: 24, label: volume.label, dateRange: volume.dateRange, items: curated24.items, normalizationStatus: "manually-curated-worked-example" };
  const rawEntries = groupCoverEntries(volume);
  return {
    volume: volume.volume, label: volume.label, dateRange: volume.dateRange,
    items: rawEntries.map((raw, index) => normalizeEntry(raw, index + 1)),
    normalizationStatus: rawEntries.length ? "automated-unreviewed" : "source-missing-or-unreadable",
  };
});

const allItems = volumes.flatMap((volume) => volume.items);
const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  title: source.title,
  source: source.source,
  policy: {
    staged: true,
    spoilerSafeDisplay: true,
    rawSourceRetained: true,
    automatedRecordsRequireReview: true,
    notes: "Automated normalization applies configured programme, championship, presentation, alias, and stipulation rules. It never activates results in display text and must not manufacture identities from jobber/unknown labels."
  },
  identityRules: { source: "config/wrestling-identity-rules.json", teamsProtectedFromMerge: identities.teams.map(({ id, canonicalName, neverMergeWith }) => ({ id, canonicalName, neverMergeWith })) },
  volumes,
  stats: {
    volumes: volumes.length,
    items: allItems.length,
    matches: allItems.filter((item) => item.type === "match").length,
    segments: allItems.filter((item) => item.type !== "match").length,
    championshipMatches: allItems.filter((item) => item.championship).length,
    stipulationMatches: allItems.filter((item) => item.stipulations?.length).length,
    needsReview: allItems.filter((item) => /review/.test(item.reviewStatus)).length,
  }
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Normalized ${output.stats.items} items across ${output.stats.volumes} volumes (${output.stats.matches} matches, ${output.stats.segments} segments).`);
