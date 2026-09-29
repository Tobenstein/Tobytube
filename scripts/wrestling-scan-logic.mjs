const WEEKLY_MARKER = /^(?:weekly(?:\s+(?:shows?|ppvs?))?|shows?)$/i;
const YEAR_DIRECTORY = /^(?:19|20)\d{2}$/;
const SEASON_DIRECTORY = /^(?:season|series)\s*\d+(?:\s*\((?:19|20)\d{2}\))?$/i;
const EPISODE_DIRECTORY = /^s\d{1,2}\s*e\d{1,3}\b/i;

export function isGenericWrestlingDirectory(value) {
  return /^(?:wrestling|major promotions|active promotions|defunct promotions|inactive|dump|re c dub(?: pre 96)?|events?|shows?|specials?|weekly(?: shows?| ppvs?)?|tours?|documentaries|wwe|wwf|wwfe|wcw|ecw|aew|njpw|roh|tna|pro wrestling guerrilla|world wrestling entertainment|all elite wrestling|(?:19|20)\d{2}|season \d+(?: \((?:19|20)\d{2}\))?)$/i.test(String(value ?? "").trim());
}

export function inferWrestlingSeriesFromParts(parts, mediaType) {
  if (mediaType !== "wrestling") return null;
  const directories = parts.slice(0, -1).filter(Boolean);
  const marker = directories.findIndex((part) => WEEKLY_MARKER.test(part));
  if (marker < 0) return null;

  const pathText = parts.join(" ");
  if (/weekly\s+ppvs?/i.test(directories[marker]) && /\btna\b|total nonstop action|impact wrestling/i.test(pathText)) {
    return "NWA-TNA Weekly PPV";
  }

  const candidate = directories
    .slice(marker + 1)
    .find((part) => part && !YEAR_DIRECTORY.test(part) && !SEASON_DIRECTORY.test(part) && !EPISODE_DIRECTORY.test(part) && !isGenericWrestlingDirectory(part));
  if (candidate) return candidate;

  const rules = [
    [/\b(?:aew\s+)?dark\s+elevation\b/i, "Dark: Elevation"],
    [/\b(?:aew\s+)?dynamite\b/i, "Dynamite"],
    [/\b(?:aew\s+)?collision\b/i, "Collision"],
    [/\b(?:aew\s+)?rampage\b/i, "Rampage"],
    [/\b(?:aew\s+)?dark\b/i, "Dark"],
    [/\b(?:wwe|wwf)?\s*monday night raw\b|\braw is war\b/i, "Monday Night Raw"],
    [/\bsmackdown\b/i, "SmackDown"],
    [/\bnxt level up\b/i, "NXT Level Up"],
    [/\bnxt uk\b/i, "NXT UK"],
    [/\bnxt\b/i, "NXT"],
    [/\bsunday night heat\b|\bheat\b/i, "Sunday Night Heat"],
    [/\b(?:wwe\s+)?ecw\b/i, "ECW"],
    [/\bmonday nitro\b|\bwcw nitro\b/i, "Monday Nitro"],
    [/\bwcw thunder\b|\bthunder\b/i, "Thunder"],
    [/\bwcw saturday night\b|\bsaturday night\b/i, "Saturday Night"],
    [/\bpower hour\b/i, "Power Hour"],
    [/\bhardcore tv\b/i, "ECW Hardcore TV"],
    [/\becw on tnn\b|\bon tnn\b/i, "ECW on TNN"],
    [/\bbefore the impact\b/i, "Before the Impact"],
    [/\bxplosion\b/i, "Xplosion"],
    [/\bimpact(?: wrestling)?\b/i, "Impact"],
    [/\broh on honorclub\b|\bhonorclub\b/i, "ROH on HonorClub"],
    [/\bring of honor wrestling\b|\broh\b/i, "Ring of Honor Wrestling"],
  ];
  return rules.find(([pattern]) => pattern.test(pathText))?.[1] ?? null;
}

export function canonicalizeWrestlingSeries(value, promotionId = "") {
  const text = String(value ?? "").trim();
  const promotion = String(promotionId ?? "").toLowerCase();
  if (!text) return null;
  if (promotion === "wwe") {
    if (/\b(?:monday night )?raw\b|raw is war/i.test(text)) return "Monday Night Raw";
    if (/\bsmackdown\b/i.test(text)) return "SmackDown";
    if (/\b(?:sunday night )?heat\b/i.test(text)) return "Sunday Night Heat";
    if (/\bnxt level up\b/i.test(text)) return "NXT Level Up";
    if (/\bnxt uk\b/i.test(text)) return "NXT UK";
    if (/\bnxt\b/i.test(text)) return "NXT";
    if (/\b(?:wwe )?ecw\b/i.test(text)) return "ECW";
  }
  if (promotion === "wcw") {
    if (/\b(?:wcw )?(?:monday )?nitro\b/i.test(text)) return "Nitro";
    if (/\b(?:wcw )?thunder\b/i.test(text)) return "Thunder";
    if (/\b(?:wcw )?saturday night\b/i.test(text)) return "Saturday Night";
    if (/\b(?:wcw )?power hour\b/i.test(text)) return "Power Hour";
  }
  if (promotion === "aew") {
    if (/\bdark\s*:?\s*elevation\b/i.test(text)) return "Dark: Elevation";
    if (/\bdynamite\b/i.test(text)) return "Dynamite";
    if (/\bcollision\b/i.test(text)) return "Collision";
    if (/\brampage\b/i.test(text)) return "Rampage";
    if (/\bdark\b/i.test(text)) return "Dark";
  }
  if (promotion === "tna") {
    if (/\bnwa[- ]tna weekly ppv\b|\bweekly ppv\b/i.test(text)) return "NWA-TNA Weekly PPV";
    if (/\bbefore the impact\b/i.test(text)) return "Before the Impact";
    if (/\bxplosion\b/i.test(text)) return "Xplosion";
    if (/\bimpact\b/i.test(text)) return "Impact";
  }
  if (promotion === "ecw") {
    if (/\bhardcore tv\b/i.test(text)) return "ECW Hardcore TV";
    if (/\bon tnn\b/i.test(text)) return "ECW on TNN";
  }
  if (promotion === "roh") {
    if (/\bhonorclub\b/i.test(text)) return "ROH on HonorClub";
    if (/\bring of honor wrestling\b|\broh\b/i.test(text)) return "Ring of Honor Wrestling";
  }
  return text.replace(/^(?:WWE|WWF|WCW|AEW|TNA|ROH)\s+/i, "").trim();
}

export function inferWrestlingDate(pathText, fallbackYear = null) {
  const value = String(pathText ?? "");
  const yearFirst = value.match(/\b((?:19|20)\d{2})[ ._-](\d{1,2})[ ._-](\d{1,2})\b/);
  if (yearFirst) return validIsoDate(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));

  const monthFirstLong = value.match(/\b(\d{1,2})[ ._-](\d{1,2})[ ._-]((?:19|20)\d{2})\b/);
  if (monthFirstLong) return validIsoDate(Number(monthFirstLong[3]), Number(monthFirstLong[1]), Number(monthFirstLong[2]));

  const monthFirstShort = value.match(/\b(\d{1,2})[ ._-](\d{1,2})[ ._-](\d{2})\b/);
  if (!monthFirstShort) return null;
  const shortYear = Number(monthFirstShort[3]);
  const inferredYear = Number(fallbackYear) || (shortYear >= 70 ? 1900 + shortYear : 2000 + shortYear);
  if (inferredYear % 100 !== shortYear) return null;
  return validIsoDate(inferredYear, Number(monthFirstShort[1]), Number(monthFirstShort[2]));
}

function validIsoDate(year, month, day) {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function narrowNumberedWrestlingEventCandidates(title, candidates) {
  const clash = String(title ?? "").match(/\bclash of the champions\s*#?\s*(\d{1,3})\b/i);
  if (!clash) return candidates;
  const ordinal = Number(clash[1]);
  const narrowed = candidates.filter((candidate) => extractClashOrdinal(candidate.title ?? candidate.name ?? candidate.id) === ordinal);
  return narrowed.length ? narrowed : candidates;
}

function extractClashOrdinal(value) {
  const text = String(value ?? "");
  const arabic = text.match(/\bclash of the champions\s*#?\s*(\d{1,3})\b/i);
  if (arabic) return Number(arabic[1]);
  const roman = text.match(/\bclash of the champions\s+([ivxlcdm]+)\b/i);
  return roman ? romanToNumber(roman[1]) : null;
}

function romanToNumber(value) {
  const digits = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const letters = String(value ?? "").toUpperCase().split("");
  return letters.reduce((total, letter, index) => {
    const current = digits[letter] ?? 0;
    const next = digits[letters[index + 1]] ?? 0;
    return total + (current < next ? -current : current);
  }, 0);
}
