import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const posterPath = path.join(root, "src", "tmdb-posters.generated.json");
const outputPath = path.join(root, "src", "wrestling-library.generated.json");
const matchOutputPath = path.join(root, "src", "wrestling-matches.generated.json");
const homeOutputPath = path.join(root, "src", "wrestling-library-home.generated.json");
const WWE_WEEKLY_SERIES_END_DATES = new Map([
  ["afterburn", "2024-12-31"],
  ["bottom-line", "2024-12-31"],
  ["the-wwe-experience", "2020-01-31"],
  ["vintage-collection", "2023-12-31"],
]);
const args = parseArgs(process.argv.slice(2));

const reference = await readJson(referencePath, {});
const posters = await readJson(posterPath, {});
const matchDetails = {};
const records = buildLibraryRecords(reference, posters, args, matchDetails);

await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: "wrestling-reference.generated.json",
      filter: args,
      records,
    },
    null,
    2,
  )}\n`,
);

const recordsByPromotion = groupBy(records, "promotionId");
for (const [promotionId, promotionRecords] of Object.entries(recordsByPromotion)) {
  await writeFile(
    path.join(root, "src", `wrestling-library-${promotionId}.generated.json`),
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: "wrestling-library.generated.json",
      promotionId,
      records: promotionRecords.map(compactPromotionRecord),
    })}\n`,
  );

  const pageDirectory = path.join(root, "src", "wrestling-library-pages");
  await mkdir(pageDirectory, { recursive: true });
  const recordsByYear = groupBy(promotionRecords, "year");
  const years = Object.keys(recordsByYear).map(Number).filter(Boolean).sort((a, b) => a - b);
  await writeFile(
    path.join(root, "src", `wrestling-library-${promotionId}-index.generated.json`),
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: "wrestling-library.generated.json",
      promotionId,
      years,
      counts: Object.fromEntries(years.map((year) => [year, recordsByYear[year].length])),
    })}\n`,
  );
  for (const year of years) {
    const yearMatches = Object.fromEntries(
      recordsByYear[year]
        .map((record) => [record.referenceId, matchDetails[record.referenceId]])
        .filter(([, matches]) => matches?.length),
    );
    await writeFile(
      path.join(pageDirectory, `${promotionId}-${year}.generated.json`),
      `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        source: "wrestling-library.generated.json",
        promotionId,
        year,
        records: recordsByYear[year].map(compactPromotionRecord),
      })}\n`,
    );
    await writeFile(
      path.join(pageDirectory, `${promotionId}-${year}-matches.generated.json`),
      `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        source: "wrestling-matches.generated.json",
        promotionId,
        year,
        matchesByReferenceId: yearMatches,
      })}\n`,
    );
  }
}

const homeRecords = records
  .filter((item) => [1997, 1998].includes(item.year))
  .filter((item) => item.watchProgress > 0 || item.inWatchlist)
  .slice(0, 8);
await writeFile(
  homeOutputPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: "wrestling-library.generated.json",
      records: homeRecords,
    },
    null,
    2,
  )}\n`,
);

await writeFile(
  matchOutputPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: "wrestling-reference.generated.json",
      filter: args,
      matchesByReferenceId: matchDetails,
    },
    null,
    2,
  )}\n`,
);

console.log(`Generated ${records.length} visible wrestling library records.`);

function compactPromotionRecord(record) {
  const compact = { ...record };
  delete compact.art;
  delete compact.status;
  delete compact.source;
  delete compact.addedAt;
  delete compact.inWatchlist;
  delete compact.watchProgress;
  return Object.fromEntries(
    Object.entries(compact).filter(([, value]) => value !== null && value !== undefined && value !== "" && (!Array.isArray(value) || value.length)),
  );
}

function buildLibraryRecords(referenceDb, posterCache, options, matchDetails) {
  const startYear = Number(options.startYear);
  const endYear = Number(options.endYear);
  const promotionIds =
    options.promotionId === "all"
      ? null
      : new Set(
          String(options.promotionId)
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),
        );
  const matchesByEvent = groupBy(referenceDb.matches ?? [], "eventId");
  const posterFamilyIndex = buildPosterFamilyIndex(posterCache);
  const typedRecords = [
    ...(referenceDb.episodes ?? []).map((record) => ({ ...record, recordType: record.recordType ?? "episode" })),
    ...(referenceDb.events ?? []).map((record) => ({ ...record, recordType: "event" })),
  ]
    .map(normalizeRecordOwnership)
    .map(normalizeRecordIdentity)
    .map((record) => ({ ...record, recordType: normalizedRecordType(record) }));
  const typedRecordsById = groupBy(typedRecords, "id");
  const authoritativeSuperstarsDates = new Set(
    typedRecords
      .filter((record) => (record.sourceIds ?? []).includes("prowrestling-fandom-superstars"))
      .map((record) => record.date),
  );
  const authoritativeRecordIds = new Set(
    typedRecords
      .filter((record) => !(record.sourceIds ?? []).includes("generated-library-recovery"))
      .map((record) => record.id),
  );

  const candidates = typedRecords
    .filter((record) => !promotionIds || promotionIds.has(record.promotionId))
    .filter((record) => !(
      (record.sourceIds ?? []).includes("generated-library-recovery") &&
      authoritativeRecordIds.has(record.id)
    ))
    .filter((record) => !isTapingScaffold(record))
    .filter((record) => !isUnscreenedHouseShow(record))
    .filter((record) => record.libraryVisible !== false)
    .filter(weeklyRecordWithinLifecycle)
    .filter((record) => {
      const year = Number(String(record.date ?? "").slice(0, 4));
      if (record.promotionId !== "wwe" || year < 1986 || year > 1997 || canonicalWeeklySeries(record) !== "Superstars") return true;
      return authoritativeSuperstarsDates.has(record.date);
    })
    .filter((record) => {
      const year = Number(record.date?.slice(0, 4));
      return year >= startYear && year <= endYear;
    })
    .filter((record) => {
      const year = Number(record.date?.slice(0, 4));
      return record.promotionId !== "ecw" || year <= 2001;
    })
    .sort((a, b) => sourcePriority(b) - sourcePriority(a) || a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  const mergedRecords = dedupeVisibleRecords(
    mergeNearDateTnaEvents(mergeSaturdayNightMainEvents(mergeEquivalentRecords(candidates)), matchesByEvent),
  )
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  const referenceIdCounts = mergedRecords.reduce((counts, record) => {
    counts.set(record.id, (counts.get(record.id) ?? 0) + 1);
    return counts;
  }, new Map());

  return mergedRecords
    .map((record, index) => {
      const year = Number(record.date.slice(0, 4));
      const referenceId = referenceIdCounts.get(record.id) > 1 ? `${record.id}-${record.date}` : record.id;
      const recordId = `library-${referenceId}`;
      const recordType = normalizedRecordType(record);
      const cachedPoster = findPosterForRecord(record, recordId, posterCache, posterFamilyIndex);
      const poster = cachedPoster ?? {
        posterUrl: record.posterUrl ?? record.art?.posterUrl ?? null,
        source: record.art?.source ?? record.posterSource ?? "reference-db",
        tmdbId: record.art?.tmdbId ?? record.tmdbId ?? null,
        seasonNumber: record.art?.seasonNumber ?? null,
        seasonName: record.art?.seasonName ?? null,
      };
      const nightPosters = record.nightCount
        ? {
            1: posterCache[`${record.id}-night-1`] ?? null,
            2: posterCache[`${record.id}-night-2`] ?? null,
          }
        : null;
      const sourceRecordIds = record._sourceRecordIds ?? [record.id];
      const matchSourceRecordIds = selectMatchSourceRecordIds(record, sourceRecordIds, matchesByEvent, typedRecordsById);
      const matches = matchSourceRecordIds
        .flatMap((sourceId) => matchesByEvent[sourceId] ?? [])
        .sort((a, b) => a.order - b.order)
        .map((match) => ({
          order: match.order,
          // Recovery records already use the library-facing `match` field.
          // Keep it when the source has no raw/display text instead of
          // emitting a card-shaped placeholder with no participants.
          match: match.displayText ?? match.raw ?? match.match,
          stipulation: match.stipulation ?? match.titleMatch ?? "Match",
          titleMatch: match.titleMatch ?? null,
          winner: match.winner ?? null,
          result: match.result ?? null,
          time: match.duration ?? match.time ?? null,
          rating: match.rating ?? null,
          votes: match.votes ?? null,
          night: match.night ?? null,
          spoilerSafe: match.spoilerSafe !== false,
        }))
        .filter((match, matchIndex, allMatches) => {
          const key = slug(match.match);
          return allMatches.findIndex((candidate) => slug(candidate.match) === key) === matchIndex;
        });
      if (matches.length) matchDetails[referenceId] = matches;

      const weeklySeries = recordType === "event"
        ? null
        : canonicalWeeklySeries(record) ?? record.seriesName ?? deriveSeriesName(record.title);
      return {
        id: recordId,
        referenceId,
        recordType,
        mediaType: "wrestling",
        promotionId: record.promotionId,
        promotionName: displayPromotion(record.promotion),
        title: record.title,
        displayTitle: recordType === "event" ? record.title : weeklySeries ?? record.title,
        series: weeklySeries,
        seriesId: recordType === "event" ? null : `${record.promotionId}-${slug(weeklySeries)}`,
        season: year,
        year,
        episodeNumber: recordType === "event" ? null : record.episodeNumber ?? null,
        date: record.date,
        eventType: record.eventType ?? (recordType === "event" ? "Special Event" : "TV Show"),
        catalogSection: record.catalogSection ?? null,
        tourName: record.tourName ?? null,
        sourceTitle: record.sourceTitle ?? null,
        coPromotions: record.coPromotions ?? [],
        cagematchRating: record.cagematchRating ?? null,
        cagematchVotes: record.cagematchVotes ?? null,
        summary: record.summary ?? null,
        matchCardStatus: record.matchCardStatus ?? null,
        status: "dummy",
        source: "reference-db-dummy-library",
        venue: record.venue ?? null,
        location: record.location ?? null,
        city: record.city ?? null,
        region: record.region ?? null,
        country: record.country ?? null,
        mainEvent: record.mainEvent ?? null,
        attendance: record.attendance ?? null,
        broadcastType: record.broadcastType ?? null,
        broadcastDate: record.broadcastDate ?? null,
        network: record.network ?? null,
        commentary: record.commentary ?? [],
        inductions: record.inductions ?? null,
        inductionCount: record.inductions?.length ?? 0,
        matchCount: matches.length,
        matches:
          (["njpw", "ajpw"].includes(record.promotionId) && year >= 2010) ||
          (record.promotionId === "aew" && year >= 2019) ||
          (["wwe", "aew", "tna", "roh"].includes(record.promotionId) && year >= 2026)
            ? matches
            : null,
        posterCode: posterCode(record.seriesName ?? record.title),
        posterUrl: poster?.posterUrl ?? null,
        stillUrl: record.stillUrl ?? record.art?.stillUrl ?? null,
        posterA: colorForSeries(record.seriesName ?? record.title).posterA,
        posterB: colorForSeries(record.seriesName ?? record.title).posterB,
        art: {
          posterUrl: poster?.posterUrl ?? null,
          stillUrl: record.stillUrl ?? record.art?.stillUrl ?? null,
          source: poster?.source ?? "fallback",
          tmdbId: poster?.tmdbId ?? null,
          seasonNumber: poster?.seasonNumber ?? null,
          seasonName: poster?.seasonName ?? null,
          nightPosters,
        },
        nightPosters,
        inWatchlist: index % 17 === 0,
        watchProgress: index % 29 === 0 ? 42 : 0,
        addedAt: `2026-05-${String((index % 24) + 1).padStart(2, "0")}`,
      };
    });
}

function normalizedRecordType(record) {
  if (isWcwSpecial(record)) return "event";
  // Impact regularly branded major cards as special episodes. They still
  // belong in Events & Specials and must merge with the independently dated
  // event record so the landing page inherits its authoritative match card.
  if (
    record.promotionId === "tna" &&
    /special|event|pay.?per.?view/i.test(record.eventType ?? "")
  ) return "event";
  if (canonicalWeeklySeries(record)) return "episode";
  if (record.recordType === "event") return "event";
  if (/special|pay.?per.?view|premium live|major event/i.test(record.eventType ?? "")) return "event";
  return "episode";
}

function isWcwSpecial(record) {
  return record.promotionId === "wcw" && /\b(?:Clash of the Champions|Take Over(?: Tour)?)\b/i.test(record.title ?? "");
}

function mergeEquivalentRecords(records) {
  const groups = new Map();
  const weeklySeriesById = new Map();
  const weeklyEpisodeByDate = new Map();
  records.forEach((record) => {
    const series = canonicalWeeklySeries(record);
    if (series) weeklySeriesById.set(record.id, series);
    if (series && record.episodeNumber) {
      weeklyEpisodeByDate.set(`${record.promotionId}|${slug(series)}|${record.date}`, record.episodeNumber);
    }
  });

  records.forEach((record) => {
    const weeklySeries = canonicalWeeklySeries(record) ?? weeklySeriesById.get(record.id);
    const weeklyDate = weeklySeries ? canonicalWeeklyBroadcastDate(record, weeklySeries) : record.date;
    const effectiveEpisodeNumber = record.episodeNumber ?? weeklyEpisodeByDate.get(`${record.promotionId}|${slug(weeklySeries)}|${weeklyDate}`);
    const numberedBroadcast = (
      weeklySeries === "NXT UK" ||
      (record.promotionId === "tna" && ["Impact", "Xplosion", "NWA-TNA Weekly PPV"].includes(weeklySeries))
    ) && effectiveEpisodeNumber
      ? `|episode-${effectiveEpisodeNumber}`
      : "";
    const key = weeklySeries
      ? `${record.promotionId}|weekly|${numberedBroadcast ? "" : weeklyDate + "|"}${slug(weeklySeries)}${numberedBroadcast}`
      : `${record.promotionId}|event|${record.date}|${canonicalEventTitle(record)}`;
    const normalized = weeklySeries
      ? { ...record, date: weeklyDate, recordType: "episode", seriesName: weeklySeries, seriesId: `${record.promotionId}-${slug(weeklySeries)}`, episodeNumber: effectiveEpisodeNumber }
      : { ...record, recordType: "event" };
    groups.set(key, [...(groups.get(key) ?? []), normalized]);
  });

  return [...groups.values()].map(mergeRecordGroup);
}

function canonicalWeeklyBroadcastDate(record, weeklySeries) {
  const sources = record.sourceIds ?? [];
  if (
    record.promotionId === "ecw" &&
    weeklySeries === "ECW Hardcore TV" &&
    sources.includes("wwfoldschool-archive") &&
    /^\d{4}-\d{2}-\d{2}$/.test(record.date ?? "")
  ) {
    const date = new Date(`${record.date}T00:00:00Z`);
    if (date.getUTCDay() === 0) {
      date.setUTCDate(date.getUTCDate() - 1);
      return date.toISOString().slice(0, 10);
    }
  }
  return record.date;
}

function mergeRecordGroup(group) {
  const sorted = [...group].sort((a, b) => {
    const episodeDelta = Number(b.recordType === "episode") - Number(a.recordType === "episode");
    return episodeDelta || sourcePriority(b) - sourcePriority(a) || recordCompleteness(b) - recordCompleteness(a);
  });
  const base = { ...sorted[0] };
  const fields = [
    "summary", "venue", "location", "city", "region", "country", "attendance", "mainEvent",
    "broadcastType", "broadcastDate", "network", "catalogSection", "tourName", "sourceTitle",
    "episodeNumber", "matchCardStatus", "cagematchRating", "cagematchVotes", "posterUrl", "stillUrl", "tmdbId",
  ];
  fields.forEach((field) => {
    if (hasValue(base[field])) return;
    const source = sorted.find((record) => hasValue(record[field]));
    if (source) base[field] = source[field];
  });
  const specialTitle = sorted
    .map((record) => record.title)
    .filter(Boolean)
    .sort((a, b) => titleSpecificity(b) - titleSpecificity(a))[0];
  const numberedSaturdayNight = sorted.map((record) => record.title).find((title) => /Saturday Night['’]s Main Event\s*#\d+/i.test(title ?? ""));
  if (numberedSaturdayNight) base.title = numberedSaturdayNight;
  else if (specialTitle && titleSpecificity(specialTitle) > titleSpecificity(base.title)) base.title = specialTitle;
  const artSource = sorted.find((record) => record.art?.posterUrl);
  if (!base.art?.posterUrl && artSource) base.art = { ...artSource.art };
  base.sourceIds = [...new Set(sorted.flatMap((record) => record.sourceIds ?? []))];
  base.coPromotions = [...new Set(sorted.flatMap((record) => record.coPromotions ?? []))];
  base.commentary = [...new Set(sorted.flatMap((record) => record.commentary ?? record.announcers ?? []))];
  base._sourceRecordIds = [...new Set(sorted.flatMap((record) => record._sourceRecordIds ?? [record.id]))];
  return base;
}

function canonicalWeeklySeries(record) {
  const type = String(record.eventType ?? "");
  const text = slug(`${record.seriesName ?? ""} ${record.title ?? ""}`);
  const promotionId = record.promotionId;
  if (isWcwSpecial(record)) return null;
  if (promotionId === "wwe" && record.recordType === "event" && /\bNXT UK\b.*\b(?:TakeOver|Prelude)\b/i.test(record.title ?? "")) return null;
  if (promotionId === "wwe" && /Saturday Night['’]s Main Event|The Main Event/i.test(`${record.seriesName ?? ""} ${record.title ?? ""}`)) return null;
  const rules = promotionId === "aew"
    ? [
        ["battle-of-the-belts", "Battle of the Belts"],
        ["dark-elevation", "Dark: Elevation"],
        ["dynamite", "Dynamite"],
        ["collision", "Collision"],
        ["rampage", "Rampage"],
        ["aew-dark", "Dark"],
      ]
    : promotionId === "wwe"
      ? [
          ["monday-night-raw", "Monday Night Raw"],
          ["raw-is-war", "Monday Night Raw"],
          ["wwe-raw", "Monday Night Raw"],
          ["smackdown", "SmackDown"],
          ["nxt-level-up", "NXT Level Up"],
          ["nxt-uk", "NXT UK"],
          ["nxt", "NXT"],
          ["205-live", "205 Live"],
          ["main-event", "Main Event"],
          ["wwe-ecw", "ECW"],
          ["ecw-on-sci-fi", "ECW"],
          ["velocity", "Velocity"],
          ["sunday-night-heat", "Sunday Night Heat"],
          ["heat", "Sunday Night Heat"],
          ["jakked-metal", "Jakked/Metal"],
          ["jakked", "Jakked"],
          ["metal", "Metal"],
          ["shotgun", "Shotgun Saturday Night"],
          ["superstars", "Superstars"],
          ["prime-time-wrestling", "Prime Time Wrestling"],
          ["wrestling-challenge", "Wrestling Challenge"],
          ["championship-wrestling", "Championship Wrestling"],
          ["all-american-wrestling", "All American Wrestling"],
          ["action-zone", "Action Zone"],
          ["super-astros", "Super Astros"],
          ["confidential", "Confidential"],
          ["bottom-line", "Bottom Line"],
          ["after-burn", "Afterburn"],
          ["wwe-experience", "The WWE Experience"],
          ["vintage-collection", "Vintage Collection"],
        ]
      : promotionId === "ecw"
        ? [
            ["hardcore-tv", "ECW Hardcore TV"],
            ["ecw-on-tnn", "ECW on TNN"],
            ["on-tnn", "ECW on TNN"],
          ]
        : promotionId === "wcw"
          ? [
              ["monday-nitro", "Nitro"],
              ["wcw-nitro", "Nitro"],
              ["nitro", "Nitro"],
              ["thunder", "Thunder"],
              ["saturday-night", "Saturday Night"],
              ["main-event", "Main Event"],
              ["worldwide", "Worldwide"],
              ["world-wide", "Worldwide"],
              ["power-hour", "Power Hour"],
              ["wcw-pro", "Pro"],
              ["pro-wrestling", "Pro"],
            ]
          : promotionId === "roh"
            ? [
                ["roh-on-honorclub", "ROH on HonorClub"],
                ["on-honorclub", "ROH on HonorClub"],
                ["ring-of-honor-wrestling", "Ring of Honor Wrestling"],
              ]
          : promotionId === "tna"
            ? [
                ["before-the-impact", "Before the Impact"],
                ["weekly-ppv", "NWA-TNA Weekly PPV"],
                ["nwa-tna-weekly", "NWA-TNA Weekly PPV"],
                ["xplosion", "Xplosion"],
                ["impact-wrestling", "Impact"],
                ["tna-impact", "Impact"],
                ["impact", "Impact"],
              ]
        : [];
  const recognized = rules.find(([needle]) => text.includes(needle))?.[1];
  if (recognized) return recognized;
  if (record.recordType !== "episode" && !/tv[ -]?show|television/i.test(type)) return null;
  if (/tv[ -]?show|tv special|television/i.test(type)) return record.seriesName ?? deriveSeriesName(record.title);
  return null;
}

function weeklyRecordWithinLifecycle(record) {
  const series = canonicalWeeklySeries(record);
  if (
    record.promotionId === "tna" &&
    series === "NWA-TNA Weekly PPV" &&
    ["2003-09-10", "2003-12-24", "2003-12-31"].includes(record.date)
  ) return false;
  if (record.promotionId !== "wwe") return true;
  const endDate = series ? WWE_WEEKLY_SERIES_END_DATES.get(slug(series)) : null;
  return !endDate || !record.date || record.date <= endDate;
}

function normalizeRecordIdentity(record) {
  let title = String(record.title ?? "")
    .replace(/^\s*Event\s*:\s*/i, "")
    .replace(/[�´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  const broadcastDate = /^\d{4}-\d{2}-\d{2}$/.test(String(record.broadcastDate ?? ""))
    ? record.broadcastDate
    : null;
  const mainEventNumbers = new Map([
    ["1988-02-05", 1], ["1989-02-03", 2], ["1990-02-23", 3], ["1990-11-23", 4], ["1991-02-01", 5],
  ]);
  if (/Saturday Night['’]s Main Event & The Main Event/i.test(title) && mainEventNumbers.has(broadcastDate ?? record.date)) {
    title = `The Main Event #${mainEventNumbers.get(broadcastDate ?? record.date)}`;
  }
  const romanMainEvent = title.match(/^The Main Event\s+(I|II|III|IV|V)$/i);
  if (romanMainEvent) title = `The Main Event #${({ I: 1, II: 2, III: 3, IV: 4, V: 5 })[romanMainEvent[1].toUpperCase()]}`;
  return {
    ...record,
    title: title || record.title,
    date: broadcastDate ?? record.date,
  };
}

function mergeSaturdayNightMainEvents(records) {
  const output = [];
  const consumed = new Set();
  const candidates = records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.promotionId === "wwe" && /Saturday Night['’]s Main Event/i.test(record.title ?? ""));

  for (const { record, index } of candidates) {
    if (consumed.has(index)) continue;
    const numbered = String(record.title ?? "").match(/Saturday Night['’]s Main Event\s*#(\d+)/i);
    const partner = candidates.find(({ record: other, index: otherIndex }) => {
      if (otherIndex === index || consumed.has(otherIndex)) return false;
      const otherNumbered = /Saturday Night['’]s Main Event\s*#\d+/i.test(other.title ?? "");
      if (Boolean(numbered) === otherNumbered) return false;
      return Math.abs(Date.parse(other.date) - Date.parse(record.date)) <= 45 * 86400000;
    });
    if (!partner) continue;
    consumed.add(index);
    consumed.add(partner.index);
    const numberedRecord = numbered ? record : partner.record;
    const airDateRecord = record.date >= partner.record.date ? record : partner.record;
    output.push({
      ...mergeRecordGroup([record, partner.record]),
      title: numberedRecord.title,
      date: airDateRecord.date,
      broadcastDate: airDateRecord.broadcastDate ?? airDateRecord.date,
      recordType: "event",
      seriesName: null,
      seriesId: null,
    });
  }

  records.forEach((record, index) => {
    if (!consumed.has(index)) output.push(record);
  });
  return output;
}

function mergeNearDateTnaEvents(records, matchesByEvent) {
  const output = [];
  const consumed = new Set();
  records.forEach((record, index) => {
    if (consumed.has(index)) return;
    if (record.promotionId !== "tna" || normalizedRecordType(record) !== "event") {
      output.push(record);
      return;
    }
    const titleKey = canonicalEventTitle(record);
    const group = records
      .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
      .filter(({ candidate, candidateIndex }) => {
        if (consumed.has(candidateIndex) || candidate.promotionId !== "tna" || normalizedRecordType(candidate) !== "event") return false;
        if (canonicalEventTitle(candidate) !== titleKey) return false;
        return Math.abs(Date.parse(candidate.date) - Date.parse(record.date)) <= 86400000;
      });
    group.forEach(({ candidateIndex }) => consumed.add(candidateIndex));
    if (group.length === 1) {
      output.push(record);
      return;
    }
    const merged = mergeRecordGroup(group.map(({ candidate }) => candidate));
    const datedCardSource = group
      .map(({ candidate }) => candidate)
      .find((candidate) => (candidate._sourceRecordIds ?? [candidate.id]).some((id) => (matchesByEvent[id] ?? []).length));
    output.push(datedCardSource
      ? { ...merged, date: datedCardSource.date, broadcastDate: datedCardSource.broadcastDate ?? datedCardSource.date, recordType: "event", seriesName: null, seriesId: null }
      : { ...merged, recordType: "event", seriesName: null, seriesId: null });
  });
  return output;
}

function normalizeRecordOwnership(record) {
  const title = String(record.title ?? "").trim();
  if (/^(?:WWE\s+)?EVOLVE\b/i.test(title)) {
    const episodeNumber = Number(title.match(/#(\d+)/)?.[1] ?? record.episodeNumber ?? 0) || null;
    return {
      ...record,
      promotionId: "evolve",
      promotion: "Evolve",
      recordType: episodeNumber ? "episode" : "event",
      eventType: episodeNumber ? "TV Show" : record.eventType ?? "Special Event",
      seriesName: episodeNumber ? "Evolve" : record.seriesName ?? null,
      seriesId: episodeNumber ? "evolve-weekly" : record.seriesId ?? null,
      episodeNumber,
    };
  }
  if (record.promotionId !== "wwe") return record;
  const ownershipRules = [
    [/^AEW\b/i, ["aew", "All Elite Wrestling"]],
    [/^NJPW\b/i, ["njpw", "New Japan Pro Wrestling"]],
    [/^AJPW\b/i, ["ajpw", "All Japan Pro Wrestling"]],
    [/^(?:TNA|IMPACT WRESTLING)\b/i, ["tna", "Total Nonstop Action Wrestling"]],
    [/^ROH\b/i, ["roh", "Ring of Honor"]],
    [/^AAA\b/i, ["aaa", "Lucha Libre AAA Worldwide"]],
    [/^NWA\b/i, ["nwa", "National Wrestling Alliance"]],
  ];
  const owner = ownershipRules.find(([pattern]) => pattern.test(title))?.[1];
  return owner ? { ...record, promotionId: owner[0], promotion: owner[1] } : record;
}

function deriveSeriesName(title = "") {
  const derived = String(title)
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\s*\((?:19|20)\d{2}\)\s*/g, " ")
    .replace(/\s+#\d+.*$/g, "")
    .replace(/^W(?:WE|WF)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return derived || "Wrestling Television";
}

function canonicalEventTitle(record) {
  const year = String(record.date ?? "").slice(0, 4);
  let normalized = slug(record.title ?? "event")
    .replace(/^(?:all-elite-wrestling|aew|world-wrestling-entertainment|world-wrestling-federation|wwe|wwf|world-championship-wrestling|wcw|total-nonstop-action-wrestling|tna)-/, "");
  if (record.promotionId === "tna") {
    normalized = normalized
      .replace(/^(?:impact-wrestling|tna-impact|impact)-/, "")
      .replace(/^wrestling-/, "")
      .replace(/non-stop/g, "nonstop")
      .replace(/and-rsquo/g, "");
  }
  normalized = normalizeEventOrdinal(normalized);
  normalized = normalized.replace(/^nxt-uk-\d+-(?:nxt-uk-)?/, "nxt-uk-");
  if (year) normalized = normalized.replace(new RegExp(`(?:^|-)${year}(?=-|$)`, "g"), "-");
  if (record.promotionId === "wcw" && normalized.includes("clash-of-the-champions")) return "clash-of-the-champions";
  if (record.promotionId === "wcw" && /^take-over(?:-tour)?(?:-|$)/.test(normalized)) return "take-over";
  return normalized.replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function normalizeEventOrdinal(value = "") {
  return String(value).replace(/^(wrestlemania)-([ivxlcdm]+)(?=-|$)/i, (match, eventName, numeral) => {
    const number = romanNumeralToNumber(numeral);
    return number ? `${eventName}-${number}` : match;
  });
}

function romanNumeralToNumber(value = "") {
  const digits = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const characters = String(value).toUpperCase().split("");
  if (!characters.length || characters.some((character) => !digits[character])) return null;
  return characters.reduce((total, character, index) => {
    const current = digits[character];
    const next = digits[characters[index + 1]] ?? 0;
    return total + (current < next ? -current : current);
  }, 0);
}

function recordCompleteness(record) {
  return [record.summary, record.venue, record.location, record.attendance, record.mainEvent, record.posterUrl, record.art?.posterUrl]
    .filter(hasValue).length;
}

function titleSpecificity(title = "") {
  const text = String(title);
  return (/:/.test(text) ? 20 : 0) + (/[A-Za-z].*\b(?:Night|Week|Special|Homecoming|Anniversary|Bash|Slam|Fest)\b/i.test(text) ? 10 : 0) - (/#[0-9]+$/.test(text) ? 5 : 0) + text.length / 100;
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0);
}

function findPosterForRecord(record, libraryId, posterCache, familyIndex) {
  const sourceIds = record._sourceRecordIds ?? [record.id];
  const directKeys = [libraryId, ...sourceIds.flatMap((id) => [`library-${id}`, id]), seasonPosterKey(record)];
  for (const key of directKeys) if (posterCache[key]?.posterUrl) return posterCache[key];

  const year = String(record.date ?? "").slice(0, 4);
  if (record.promotionId === "tna" && normalizedRecordType(record) === "event") {
    const title = String(record.title ?? "").toLowerCase();
    const countdownEvent = title.match(/\bcountdown\s+to\s+(.+?)(?:\s+20\d{2})?$/i)?.[1];
    if (countdownEvent) {
      const parentPoster = posterCache[`sdh-tna-ppv-history-tna-${slug(countdownEvent)}-${year}`]
        ?? posterCache[`library-sdh-tna-ppv-history-tna-${slug(countdownEvent)}-${year}`];
      if (parentPoster?.posterUrl) return { ...parentPoster, source: "parent-event-poster" };
    }
    const specialAliases = title.includes("before the impact")
      ? ["before-the-impact", "tna-before-the-impact"]
      : title.includes("xplosion")
        ? ["xplosion", "tna-xplosion"]
        : title.includes("impact")
          ? ["impact", "tna-impact", "impact-wrestling"]
          : [];
    for (const alias of specialAliases) {
      const season = posterCache[`season-tna-${alias}-${year}`];
      if (season?.posterUrl) return season;
    }
  }
  for (const alias of posterSeriesAliases(record)) {
    const dated = posterCache[`wrestling-${record.promotionId}-${alias}-${record.date}`];
    if (dated?.posterUrl) return dated;
    const season = posterCache[`season-${record.promotionId}-${alias}-${year}`];
    if (season?.posterUrl) return season;
    // A poster from another year is not season artwork. The generic fallback
    // made the newest Raw art appear throughout the historical archive.
    const family = familyIndex.get(`${record.promotionId}|${alias}|${year}`);
    if (family?.posterUrl) return family;
  }
  return null;
}

function posterSeriesAliases(record) {
  const series = slug(record.seriesName ?? record.title);
  const aliases = [series];
  const withoutPromotion = series.replace(/^(?:wwe|wwf|wcw|ecw|aew|tna|roh|njpw|ajpw)-/, "");
  if (withoutPromotion && withoutPromotion !== series) aliases.push(withoutPromotion);
  if (series.includes("raw")) aliases.push("raw", "monday-night-raw");
  if (series.includes("smackdown")) aliases.push("smackdown");
  if (series.includes("dynamite")) aliases.push("dynamite");
  if (series.includes("collision")) aliases.push("collision");
  if (series.includes("rampage")) aliases.push("rampage");
  if (series.includes("xplosion")) aliases.push("xplosion", "tna-xplosion");
  if (series.includes("impact") && !series.includes("before")) aliases.push("impact", "tna-impact", "impact-wrestling");
  if (series.includes("before-the-impact")) aliases.push("before-the-impact", "tna-before-the-impact");
  if (series.includes("weekly-ppv")) aliases.push("weekly-ppv", "nwa-tna-weekly-ppv");
  if (series.includes("main-event")) aliases.push("main-event");
  if (series.includes("nxt")) aliases.push("nxt");
  return [...new Set(aliases)];
}

function buildPosterFamilyIndex(posterCache) {
  const index = new Map();
  Object.entries(posterCache).forEach(([key, poster]) => {
    const match = key.match(/^(?:wrestling|season)-([a-z0-9-]+?)-(.+?)-(\d{4})(?:-\d{2}-\d{2})?$/);
    if (!match || !poster?.posterUrl) return;
    const [, promotionId, alias, year] = match;
    if (!index.has(`${promotionId}|${alias}|${year}`)) index.set(`${promotionId}|${alias}|${year}`, poster);
  });
  return index;
}

function dedupeVisibleRecords(records) {
  const seen = new Set();
  return records.filter((record) => {
    const key =
      record.recordType === "event"
        ? `${record.promotionId}|event|${record.date}|${slug(record.title)}`
        : `${record.promotionId}|episode|${record.date}|${slug(record.seriesName ?? record.title)}|${record.episodeNumber ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourcePriority(record) {
  const sources = record.sourceIds ?? [];
  if (sources.includes("sdh-tna-events")) return 45;
  if (sources.includes("sdh-wwe-results")) return 40;
  if (sources.includes("sdh-tna-results")) return 40;
  if (sources.includes("sdh-aew-results")) return 35;
  if (sources.includes("sdh-ecw-results")) return 35;
  if (sources.includes("wwfoldschool")) return 20;
  return 10;
}

function selectMatchSourceRecordIds(record, sourceRecordIds, matchesByEvent, recordsById) {
  const candidates = [...new Set(sourceRecordIds)]
    .filter((sourceId) => (matchesByEvent[sourceId] ?? []).length)
    .map((sourceId) => {
      const records = recordsById[sourceId] ?? [];
      return {
        sourceId,
        priority: records.reduce((best, sourceRecord) => Math.max(best, sourcePriority(sourceRecord)), 0),
        completeness: records.reduce((best, sourceRecord) => Math.max(best, recordCompleteness(sourceRecord)), 0),
      };
    });
  if (candidates.length <= 1) return candidates.map((candidate) => candidate.sourceId);

  // A weekly episode is a broadcast object, not the entire venue taping. Use
  // one authoritative result list and let the remaining sources enrich only
  // non-card fields such as venue, attendance, artwork, or commentary.
  if (canonicalWeeklySeries(record)) {
    candidates.sort((a, b) => b.priority - a.priority || b.completeness - a.completeness || a.sourceId.localeCompare(b.sourceId));
    return [candidates[0].sourceId];
  }

  return candidates.map((candidate) => candidate.sourceId);
}

function groupBy(records, key) {
  return records.reduce((groups, record) => {
    const value = record[key];
    groups[value] = groups[value] ?? [];
    groups[value].push(record);
    return groups;
  }, {});
}

function seasonPosterKey(episode) {
  return `season-${episode.promotionId}-${slug(episode.seriesName ?? episode.title)}-${episode.date?.slice(0, 4)}`;
}

function colorForSeries(series = "") {
  const normalized = series.toLowerCase();
  if (normalized.includes("nitro")) return { posterA: "#263a75", posterB: "#d8b35d" };
  if (normalized.includes("thunder")) return { posterA: "#3c72a8", posterB: "#a6d8ef" };
  if (normalized.includes("saturday night")) return { posterA: "#1f2630", posterB: "#d6d06b" };
  if (normalized.includes("worldwide")) return { posterA: "#27384f", posterB: "#80b7cf" };
  if (normalized.includes("main event")) return { posterA: "#2f3342", posterB: "#c7b36b" };
  if (normalized.includes("pro")) return { posterA: "#2f3945", posterB: "#b8c1d1" };
  if (normalized.includes("raw")) return { posterA: "#8f2e34", posterB: "#d8b35d" };
  if (normalized.includes("smackdown")) return { posterA: "#2761b7", posterB: "#8fd0ff" };
  if (normalized.includes("heat")) return { posterA: "#c5532e", posterB: "#f3d15f" };
  if (normalized.includes("jakked") || normalized.includes("metal")) return { posterA: "#32405f", posterB: "#c45243" };
  if (normalized.includes("shotgun")) return { posterA: "#283143", posterB: "#c07a52" };
  if (normalized.includes("superstars")) return { posterA: "#303f71", posterB: "#d7dce8" };
  if (normalized.includes("super astros") || normalized.includes("súper astros")) return { posterA: "#304f74", posterB: "#c05f4f" };
  return { posterA: "#2b2e35", posterB: "#d8b35d" };
}

function displayPromotion(promotion = "") {
  if (/world championship wrestling/i.test(promotion)) return "WCW";
  if (/federation/i.test(promotion)) return "WWF";
  if (/entertainment/i.test(promotion)) return "WWE";
  return promotion || "Wrestling";
}

function posterCode(title = "") {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function parseArgs(rawArgs) {
  const parsed = {
    promotionId: "all",
    startYear: "1900",
    endYear: "2100",
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--promotion") parsed.promotionId = rawArgs[++index];
    if (arg === "--start-year") parsed.startYear = rawArgs[++index];
    if (arg === "--end-year") parsed.endYear = rawArgs[++index];
  }

  return parsed;
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function slug(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isTapingScaffold(record) {
  const title = String(record.title ?? "");
  const eventType = String(record.eventType ?? "");
  return (
    /internet broadcast/i.test(eventType) ||
    /\b(?:TV-?Taping|TV Taping)\s*@\s+/i.test(title) ||
    /^\s*(?:WCW|WWF|WWE|ECW|TNA|AEW|ROH|NJPW|AJPW|NOAH|AWA|WCCW|NWA|JCP)\b.*\s@\s+/i.test(title) ||
    /^\s*(?:WCW|WWF|WWE|ECW|TNA|AEW|ROH|NJPW|AJPW|NOAH|AWA|WCCW)\s*@\s+/i.test(title)
  );
}

function isUnscreenedHouseShow(record) {
  return record.promotionId === "wwe" && /house show|live event/i.test(String(record.eventType ?? ""));
}
