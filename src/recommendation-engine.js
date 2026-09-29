const GENERIC_GENRES = new Set(["drama", "action", "adventure"]);
const STORAGE_ONLY_GENRES = new Set(["unsorted", "library"]);

const SIGNALS = {
  goofy: ["slapstick", "goofy", "wacky", "zany", "dimwitted", "bumbling", "buddy comedy", "road trip", "farce", "parody", "spoof"],
  lighthearted: ["lighthearted", "feel-good", "feel good", "family", "friendship", "romantic comedy", "comedy"],
  warm: ["heartwarming", "warm", "tender", "uplifting", "found family", "friendship"],
  campy: ["camp", "campy", "cult", "b-movie", "b movie", "over-the-top", "over the top"],
  dark: ["bleak", "dark", "grim", "nightmarish", "murder", "serial killer", "revenge"],
  disturbing: ["disturbing", "brutal", "graphic", "sadistic", "torture", "rape", "sexual assault", "exploitation", "cannibal", "gore", "revenge"],
  tense: ["tense", "suspense", "thriller", "cat-and-mouse", "cat and mouse", "hostage", "survival"],
  cerebral: ["cerebral", "philosophical", "psychological", "identity", "memory", "existential", "mystery"],
  surreal: ["surreal", "dreamlike", "absurdist", "hallucinatory", "bizarre"],
  romantic: ["romance", "romantic", "love story", "relationship"],
  adventurous: ["quest", "adventure", "journey", "expedition", "treasure", "space opera"],
};

const THEMES = {
  friendship: ["friendship", "best friend", "buddy", "companions"],
  revenge: ["revenge", "vengeance", "retaliation"],
  family: ["family", "father", "mother", "sibling", "parent", "daughter", "son"],
  crime: ["crime", "criminal", "heist", "detective", "police", "murder", "gangster"],
  survival: ["survival", "survive", "stranded", "escape"],
  comingOfAge: ["coming of age", "growing up", "teenager", "adolescence"],
  roadTrip: ["road trip", "cross-country", "journey across", "on the road"],
  supernatural: ["ghost", "demon", "supernatural", "haunted", "possession", "curse"],
  monsters: ["monster", "creature", "vampire", "werewolf", "zombie", "alien"],
  technology: ["technology", "computer", "artificial intelligence", "robot", "cyberspace"],
  war: ["war", "soldier", "military", "battle", "combat"],
  showBusiness: ["actor", "filmmaker", "musician", "television", "show business", "stage"],
};

const FAMILY_RATINGS = new Set(["g", "pg", "u", "tv-y", "tv-y7", "tv-g", "tv-pg"]);
const EXTREME_RATINGS = new Set(["nc-17", "18", "x"]);

export function rankRelatedMovies(source, candidates, options = {}) {
  const sourceProfile = buildRecommendationProfile(source, options.detailsFor?.(source));
  return candidates
    .filter((candidate) => candidate?.id !== source?.id)
    .map((candidate) => scoreCandidate(sourceProfile, buildRecommendationProfile(candidate, options.detailsFor?.(candidate)), options))
    .filter((result) => result.compatible && result.score >= (options.minimumScore ?? 14))
    .sort((a, b) => b.score - a.score || Number(b.movie.year ?? 0) - Number(a.movie.year ?? 0) || String(a.movie.title).localeCompare(String(b.movie.title)));
}

export function buildRecommendationProfile(movie, details = {}) {
  const genres = normalizeSet([...(details?.genres ?? []), ...(movie?.genres ?? []), details?.genre, movie?.genre]);
  STORAGE_ONLY_GENRES.forEach((genre) => genres.delete(genre));
  const text = normalizeText([
    movie?.title,
    details?.tagline,
    details?.summary,
    movie?.summary,
    ...genres,
  ].filter(Boolean).join(" "));
  const tones = detectSignals(text, SIGNALS);
  const themes = detectSignals(text, THEMES);
  if (genres.has("comedy")) tones.add("lighthearted");
  if (genres.has("horror") || genres.has("thriller")) tones.add("dark");
  if (genres.has("family")) tones.add("warm");
  const rating = normalizeText(details?.rating ?? movie?.rating);
  const familyAudience = genres.has("family") || FAMILY_RATINGS.has(rating);
  const extremeAudience = EXTREME_RATINGS.has(rating) || tones.has("disturbing");
  return {
    movie,
    genres,
    tones,
    themes,
    familyAudience,
    extremeAudience,
    director: normalizeText(details?.director ?? movie?.director),
    cast: normalizeSet((details?.cast ?? movie?.cast ?? []).slice(0, 10).map((person) => person?.name ?? person)),
    country: normalizeText(details?.country ?? movie?.country),
    language: normalizeText(details?.language ?? movie?.language),
    runtime: numericValue(details?.runtime ?? movie?.runtime),
    year: numericValue(movie?.year ?? details?.year ?? String(details?.releaseDate ?? "").slice(0, 4)),
  };
}

function scoreCandidate(source, candidate, options) {
  const sharedGenres = intersection(source.genres, candidate.genres);
  const sharedTones = intersection(source.tones, candidate.tones);
  const sharedThemes = intersection(source.themes, candidate.themes);
  const meaningfulGenres = sharedGenres.filter((genre) => !GENERIC_GENRES.has(genre));
  const sharedCollections = intersection(
    normalizeSet(options.collectionIdsFor?.(source.movie) ?? []),
    normalizeSet(options.collectionIdsFor?.(candidate.movie) ?? []),
  );
  const sameDirector = Boolean(source.director && source.director === candidate.director);
  const sharedCast = intersection(source.cast, candidate.cast);

  if (hasToneConflict(source, candidate)) return rejected(candidate.movie, "incompatible tone or audience");
  const hasRealEvidence = meaningfulGenres.length || sharedThemes.length || sharedTones.length || sharedCollections.length || sameDirector || sharedCast.length;
  if (!hasRealEvidence) return rejected(candidate.movie, "no meaningful similarity");
  if (sharedGenres.length === 1 && GENERIC_GENRES.has(sharedGenres[0]) && !sharedThemes.length && !sharedTones.length && !sameDirector && !sharedCast.length) {
    return rejected(candidate.movie, "generic genre only");
  }

  let score = 0;
  const reasons = [];
  if (sharedGenres.length) {
    score += weightedOverlap(source.genres, candidate.genres, GENERIC_GENRES) * 34;
    reasons.push(`shared ${formatList(meaningfulGenres.length ? meaningfulGenres : sharedGenres)}`);
  }
  if (sharedThemes.length) {
    score += overlap(source.themes, candidate.themes) * 24;
    reasons.push(formatList(sharedThemes));
  }
  if (sharedTones.length) {
    score += overlap(source.tones, candidate.tones) * 24;
    reasons.push(`${formatList(sharedTones)} tone`);
  }
  if (sharedCollections.length) {
    score += Math.min(10, sharedCollections.length * 4);
    reasons.push("shared aisle or collection");
  }
  if (sameDirector) {
    score += 8;
    reasons.push("same director");
  }
  if (sharedCast.length) {
    score += Math.min(6, sharedCast.length * 2);
    reasons.push("shared cast");
  }
  if (source.year && candidate.year) score += Math.max(0, 2 - Math.abs(source.year - candidate.year) / 10);
  if (source.runtime && candidate.runtime) score += Math.max(0, 2 - Math.abs(source.runtime - candidate.runtime) / 30);
  if (source.country && source.country === candidate.country) score += 1;
  if (source.language && source.language === candidate.language) score += 1;

  return { movie: candidate.movie, compatible: true, score: Math.round(score * 100) / 100, reasons: [...new Set(reasons)].slice(0, 3) };
}

function hasToneConflict(a, b) {
  if ((a.familyAudience && b.extremeAudience) || (b.familyAudience && a.extremeAudience)) return true;
  if ((isLight(a) && b.tones.has("disturbing")) || (isLight(b) && a.tones.has("disturbing"))) return true;
  return false;
}

function isLight(profile) {
  return profile.tones.has("goofy") || profile.tones.has("lighthearted") || profile.tones.has("warm");
}

function rejected(movie, reason) {
  return { movie, compatible: false, score: 0, reasons: [], rejectedBecause: reason };
}

function detectSignals(text, dictionary) {
  return new Set(Object.entries(dictionary).filter(([, needles]) => needles.some((needle) => text.includes(needle))).map(([name]) => name));
}

function normalizeSet(values) {
  return new Set((values ?? []).flat().map(normalizeText).filter(Boolean));
}

function normalizeText(value) {
  return String(value ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function intersection(a, b) {
  return [...a].filter((value) => b.has(value));
}

function overlap(a, b) {
  const union = new Set([...a, ...b]).size;
  return union ? intersection(a, b).length / union : 0;
}

function weightedOverlap(a, b, lowWeight) {
  const values = new Set([...a, ...b]);
  let shared = 0;
  let total = 0;
  for (const value of values) {
    const weight = lowWeight.has(value) ? 0.45 : 1;
    total += weight;
    if (a.has(value) && b.has(value)) shared += weight;
  }
  return total ? shared / total : 0;
}

function numericValue(value) {
  const number = Number(String(value ?? "").match(/\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(number) ? number : null;
}

function formatList(values) {
  return values.map((value) => value.replace(/([A-Z])/g, " $1").trim()).join(" + ");
}
