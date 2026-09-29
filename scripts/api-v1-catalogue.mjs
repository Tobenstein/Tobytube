import { filterAuthorizedMedia, authorizeMediaOrThrow } from "./api-v1-access-policy.mjs";

const HEROES = { home: null, movies: "/assets/banners/movies-landing-hero.png", tv: "/assets/banners/tv-landing-hero.png", wrestling: null, collections: "/assets/banners/home-landing-hero.png" };
export function buildCatalogueIndex(metadata, enrichment = {}) {
  const context = buildEnrichmentContext(enrichment);
  const enriched = (metadata?.records ?? [])
    .filter((record) => record?.id && record?.title && record.files?.length)
    .map((record) => enrichRecord(record, context));
  return consolidateMergedRecords(enriched).flatMap((record) => expandRecord(record));
}

function consolidateMergedRecords(records) {
  const byId = new Map(records.map((record) => [record.id, record]));
  const hidden = new Set();
  const groups = new Map();
  for (const record of records) {
    if (!record.mergedIntoId || !["single-film", "single-series"].includes(record.mergeType)) continue;
    if (!groups.has(record.mergedIntoId)) groups.set(record.mergedIntoId, []);
    groups.get(record.mergedIntoId).push(record);
  }
  for (const [primaryId, members] of groups) {
    const primary = byId.get(primaryId);
    const liveMembers = [...new Map([primary, ...members].filter(Boolean).map((member) => [member.id, member])).values()];
    if (!primary || liveMembers.length < 2) continue;
    const files = liveMembers.flatMap((member) => member.files ?? []);
    byId.set(primaryId, { ...primary, files, mergedItemIds: liveMembers.map((member) => member.id) });
    liveMembers.forEach((member) => { if (member.id !== primaryId) hidden.add(member.id); });
  }
  return [...byId.values()].filter((record) => !hidden.has(record.id));
}
export function authorizedHome(user, items, limit = 20, curated = null, userData = null) { return authorizedSection(user, items, "home", limit, curated, userData); }

export function authorizedSection(user, items, requestedSection, limit = 20, curated = null, userData = null) {
  const section = ["home", "movies", "tv", "wrestling", "collections"].includes(requestedSection) ? requestedSection : "home";
  const allowed = filterAuthorizedMedia(user, items);
  const visible = allowed.filter((item) => !item.hiddenFromCatalogue);
  const movie = (item) => item.type === "movie";
  const tv = (item) => item.type === "show";
  const wrestling = (item) => item.type === "wrestling";
  const recent = (predicate = () => true) => mediaRow("new", "New Releases", visible.filter(predicate), limit);
  const currentRentals = currentRentalsRow(allowed, userData, limit);
  let rows;
  if (section === "movies") rows = [recent(movie), filterRentalRow(currentRentals, movie), curatedGroupRow("movie-aisles", "Aisles", allowed.filter(movie), "Aisles", curated, limit), { id: "mixtape", title: "Mixtape", items: [] }, mediaRow("movies", "Library", allowed.filter(movie), limit)];
  else if (section === "tv") rows = [filterRentalRow(currentRentals, (item) => ["show", "episode"].includes(item.type)), recent(tv), curatedGroupRow("tv-collections", "Collections", allowed.filter(tv), "all", curated, limit), { id: "mixtape", title: "Mixtape", items: [] }, mediaRow("tv", "Library", allowed.filter(tv), limit)];
  else if (section === "wrestling") rows = [recent(wrestling), wrestlingPromotionRow("promotions", "Promotions", allowed.filter(wrestling), () => true, limit), wrestlingProgrammeRow("weekly-tv", "Weekly Television", allowed.filter(wrestling), limit), wrestlingPromotionRow("events", "Events, PPVs, PLEs & Specials", allowed.filter(wrestling), (item) => item.collectionIds.includes("events"), limit), mediaRow("wrestling", "Wrestling Library", allowed.filter(wrestling), limit)];
  else if (section === "collections") rows = ["Vaults", "Sagas", "Aisles", "Boxed Sets", "Worlds", "Profiles"].map((group) => curatedGroupRow(`collection-${slug(group)}`, group, visible, group, curated, limit));
  else rows = [currentRentals, recent(), curatedGroupRow("home-aisles", "Aisles", visible, "Aisles", curated, limit), curatedGroupRow("home-collections", "Collections", visible, "non-aisles", curated, limit), { id: "mixtape", title: "Mixtape", items: [] }, mediaRow("movies", "All Movies", visible.filter(movie), limit)];
  const actions = section === "movies" ? movieHeroActions() : section === "tv" ? tvHeroActions() : [];
  return { page: { id: section, title: titleCase(section), heroUrl: HEROES[section], kind: "section", fullScreenHero: ["movies", "tv"].includes(section), actions }, rows: rows.filter((row) => row.items.length) };
}

export function authorizedCollection(user, items, requestedId, limit = 30, curated = null) {
  const id = slug(requestedId);
  const authorized = filterAuthorizedMedia(user, items);
  const special = projectSpecialCollection(id, authorized, curated, limit);
  if (special) return special;
  const allowed = authorized.filter((item) => !item.hiddenFromCatalogue && item.collectionIds.includes(id));
  const displayName = allowed.flatMap((item) => item.collectionParts).find((part) => part.id === id)?.name ?? titleCase(id);
  const childGroups = new Map();
  for (const item of allowed) { const index = item.collectionParts.findIndex((part) => part.id === id); const child = index >= 0 ? item.collectionParts[index + 1] : null; if (!child || child.id === id) continue; if (!childGroups.has(child.id)) childGroups.set(child.id, { name: child.name, items: [] }); childGroups.get(child.id).items.push(item); }
  const childCards = [...childGroups].map(([childId, group]) => projectCollection(childId, group.name, group.items)).sort(byTitle);
  const override = curated?.collectionOverrides?.collections?.[id === "upn" ? "black-excellence" : id] ?? curated?.collectionOverrides?.collections?.[id];
  const curatedRows = override?.carousels?.length ? projectOverrideCollection(override, allowed, limit) : projectCuratedCollection(getCuratedCollectionManifest(curated, id), allowed, limit, id);
  const folderRows = projectFolderCollectionRows(id, allowed, limit);
  const fallbackRows = folderRows.length ? folderRows : [{ id: "subcollections", title: "Browse This Collection", items: childCards.slice(0, limit) }, mediaRow("collection-movies", "Movies", allowed.filter((item) => item.type === "movie"), limit), mediaRow("collection-tv", "TV Series & More", allowed.filter((item) => item.type === "show"), limit), mediaRow("collection-wrestling", "Wrestling", allowed.filter((item) => item.type === "wrestling"), limit)].filter((row) => row.items.length);
  return { page: { id, title: id === "upn" ? "UPN" : displayName, heroUrl: id === "upn" ? "/assets/collections/black-excellence/upn-banner.png" : `/assets/collections/${id}/hero.png`, kind: "collection", itemCount: allowed.length }, rows: curatedRows.length ? curatedRows : fallbackRows };
}

function projectSpecialCollection(id, authorized, curated, limit) {
  if (id === "mcu" && curated?.specialCollections?.mcu) return projectMcuCollection(curated.specialCollections.mcu, authorized.filter((item) => item.collectionIds.includes("mcu")), limit);
  if (id === "criterion" && curated?.specialCollections?.criterion) return projectCriterionCollection(curated.specialCollections.criterion, curated?.criterionManifest ?? curated?.criterion, authorized.filter((item) => !item.hiddenFromCatalogue && item.collectionIds.includes("criterion")), limit);
  const criterionSpec = criterionSpecs(curated?.criterionManifest ?? curated?.criterion).find((entry) => slug(entry.id) === id);
  if (criterionSpec) {
    const matches = matchSpecs(criterionSpec.items ?? [], authorized.filter((item) => item.collectionIds.includes("criterion")));
    return { page: { id, title: criterionSpec.title, heroUrl: criterionHeroFor(criterionSpec), kind: "collection" }, rows: matches.length ? [{ id: `${id}-titles`, title: criterionSpec.title, items: matches.slice(0, limit).map(projectCard) }] : [] };
  }
  return null;
}

function projectMcuCollection(collection, allowed, limit) {
  const infinity = collection.phases.filter((phase) => phase.saga === "infinity").flatMap((phase) => phase.items ?? []);
  const multiverse = collection.phases.filter((phase) => phase.saga === "multiverse");
  const sections = collection.sections ?? [];
  const specs = [
    { id: "infinity", title: "Infinity Saga (Phases 1-3)", items: infinity },
    ...multiverse.map((phase) => ({ id: phase.id, title: `Multiverse Saga — ${phase.title}`, items: phase.items ?? [] })),
    ...sections.map((section) => ({ id: section.id, title: section.title, items: section.items?.length ? section.items : (section.groups ?? []).flatMap((group) => group.items ?? []) })),
  ];
  return { page: { id: "mcu", title: "Marvel Cinematic Universe", heroUrl: cleanAssetPath(collection.heroImage), kind: "collection" }, rows: specs.map((section) => ({ id: section.id, title: section.title, items: matchSpecs(section.items, allowed).slice(0, limit).map(projectCard) })).filter((row) => row.items.length) };
}

function projectCriterionCollection(data, criterionManifest, allowed, limit) {
  const groups = [
    ["boxedSets", "Boxed Sets"], ["directorShowcase", "Director Showcase"], ["officialChannelCollections", "Criterion Channel Collections"], ["noir", "Noir Collections"],
  ];
  const rows = groups.map(([key, title]) => ({
    id: `criterion-${slug(key)}`,
    title,
    items: (criterionManifest?.[key] ?? []).map((spec) => {
      const matches = matchSpecs(spec.items ?? [], allowed);
      if (!matches.length) return null;
      return { ...projectCollection(slug(spec.id), spec.title, matches), artworkUrl: criterionButtonFor(spec, key, matches) };
    }).filter(Boolean).slice(0, limit),
  })).filter((row) => row.items.length);
  const eclipse = (data.eclipseSets ?? []).map((set) => {
    const specs = set.films ?? set.items ?? [];
    const matches = matchSpecs(specs, allowed);
    return matches.length ? { ...projectCollection(slug(set.id), set.title, matches), artworkUrl: cleanAssetPath(set.buttonImage ?? set.coverImage ?? set.posterUrl) } : null;
  }).filter(Boolean).slice(0, limit);
  if (eclipse.length) rows.push({ id: "criterion-eclipse", title: "Eclipse", items: eclipse });
  return { page: { id: "criterion", title: "The Criterion Collection", heroUrl: cleanAssetPath(data.collection?.heroImage ?? "./assets/collections/criterion/landing-hero.png"), kind: "collection" }, rows };
}

function criterionSpecs(criterionManifest) { return ["boxedSets", "directorShowcase", "officialChannelCollections", "noir"].flatMap((key) => criterionManifest?.[key] ?? []); }
function matchSpecs(specs, allowed) {
  const found = [];
  const seen = new Set();
  for (const spec of specs ?? []) {
    const item = allowed.find((candidate) => candidate.id === spec.id) ?? allowed.find((candidate) => normalize(candidate.title) === normalize(spec.title) && (!spec.year || Number(candidate.year) === Number(spec.year)));
    if (item && !seen.has(item.id)) { seen.add(item.id); found.push(item); }
  }
  return found;
}
function criterionButtonFor(spec, bucket, matches) {
  const file = { "the-apu-trilogy": "apu-trilogy-button.png", "apu-trilogy": "apu-trilogy-button.png", "lone-wolf-and-cub": "lone-wolf-and-cub-button.png", "zatoichi": "zatoichi-button.png", "bergman-cinema": "bergman-cinema-button.png", "ingmar-bergman-s-cinema": "bergman-cinema-button.png", "cc40": "cc40-button.png", "ak-100-the-works-of-akira-kurosawa": "ak-100-button.png" }[slug(spec.title)];
  if (file && bucket === "boxedSets") return `/assets/collections/criterion/boxed-sets/${file}`;
  return matches.find((item) => item.artworkUrl)?.artworkUrl ?? null;
}
function criterionHeroFor(spec) { return spec.heroImage ? cleanAssetPath(spec.heroImage) : "/assets/collections/criterion/collections-hero.png"; }
function cleanAssetPath(value) { if (!value) return null; return String(value).replace(/^\.\//, "/"); }

export function authorizedSearch(user, items, query, limit = 30, offset = 0) { const needle = searchText(query); const matches = filterAuthorizedMedia(user, items).filter((item) => !item.hiddenFromCatalogue && (!needle || searchText([item.title, item.year, item.genre, item.director, item.directors, item.creator, item.createdBy, ...personNames(item.cast), ...personNames(item.performers), ...personNames(item.actors)].flat().filter(Boolean).join(" ")).includes(needle))); return { items: matches.slice(offset, offset + limit).map(projectCard), nextCursor: offset + limit < matches.length ? encodeCursor(offset + limit) : null }; }
export function authorizedItem(user, items, id) {
  const item = items.find((entry) => entry.id === id); authorizeMediaOrThrow(user, item);
  const allowed = filterAuthorizedMedia(user, items);
  let relatedRows = [];
  const franchiseSiblings = allowed.filter((entry) => !entry.hiddenFromCatalogue && entry.id !== item.id && ["movie", "show"].includes(entry.type) && entry.franchiseIds?.some((franchiseId) => item.franchiseIds?.includes(franchiseId)));
  const franchiseRows = [
    { id: "franchise-tv", title: "TV Series", items: franchiseSiblings.filter((entry) => entry.type === "show").map(projectCard) },
    { id: "franchise-movies", title: "Movies in This Series", items: franchiseSiblings.filter((entry) => entry.type === "movie").map(projectCard) },
  ];
  if (item.type === "show") relatedRows = [{ id: "seasons", title: "Seasons", items: allowed.filter((entry) => entry.type === "season" && entry.showId === item.id).sort((a, b) => a.seasonNumber - b.seasonNumber).map(projectCard) }, ...franchiseRows];
  else if (["season", "episode"].includes(item.type)) relatedRows = [{ id: "season-episodes", title: `Season ${item.seasonNumber} Episodes`, items: allowed.filter((entry) => entry.type === "episode" && entry.showId === item.showId && entry.seasonNumber === item.seasonNumber).sort((a, b) => a.episodeNumber - b.episodeNumber).map(projectCard) }];
  else relatedRows = [...franchiseRows, { id: "more-like-this", title: "More Like This", items: allowed.filter((entry) => entry.type === "movie" && entry.id !== item.id && !franchiseSiblings.some((sibling) => sibling.id === entry.id) && entry.collectionIds.some((collectionId) => item.collectionIds.includes(collectionId))).slice(0, 20).map(projectCard) }];
  return { ...projectCard(item), synopsis: item.synopsis ?? "", metadata: [item.year ?? item.years, item.genre, item.rating].filter(Boolean).map(String), backdropUrl: item.backdropUrl, parentTitle: item.parentTitle, showId: item.showId, seasonNumber: item.seasonNumber, episodeNumber: item.episodeNumber, itemCount: item.itemCount, durationSeconds: item.durationSeconds, tracks: projectTracks(item.file?.streams), playbackAvailable: item.type !== "season", relatedRows: relatedRows.filter((row) => row.items.length) };
}
export function resolveAuthorizedMedia(user, items, id) { const item = items.find((entry) => entry.id === id); authorizeMediaOrThrow(user, item); return item; }
export function decodeCursor(value) { try { const offset = Number(Buffer.from(String(value ?? ""), "base64url").toString("utf8")); return Number.isInteger(offset) && offset >= 0 ? offset : 0; } catch { return 0; } }
function encodeCursor(offset) { return Buffer.from(String(offset)).toString("base64url"); }
function expandRecord(record) {
  const parent = toInternalItem(record);
  if (parent.type !== "show") return [parent];
  const episodeTitles = record.episodes ?? {};
  const hydratedSeasons = new Map((record.seasons ?? []).map((season) => [Number(season.seasonNumber), season]));
  const episodes = record.files.map((file) => {
    const seasonNumber = Number(file.parsed?.season); const episodeNumber = Number(file.parsed?.episode);
    if (!seasonNumber && seasonNumber !== 0 || !episodeNumber) return null;
    const code = `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;
    const hydratedEpisode = hydratedSeasons.get(seasonNumber)?.episodes?.find((episode) => Number(episode.episodeNumber) === episodeNumber) ?? {};
    const title = (hydratedEpisode.title ?? episodeTitles[code] ?? String(file.streams?.versionLabel ?? "").replace(/^.*?S\d{2}E\d{2}\s*/i, "").replace(/\s*\/.*$/, "").trim()) || `Episode ${episodeNumber}`;
    return { ...parent, ...hydratedEpisode, id: `${parent.id}:s${String(seasonNumber).padStart(2, "0")}e${String(episodeNumber).padStart(2, "0")}`, type: "episode", title, synopsis: hydratedEpisode.summary ?? hydratedEpisode.overview ?? "", parentTitle: parent.title, showId: parent.id, seasonNumber, episodeNumber, artworkUrl: hydratedEpisode.stillUrl ?? parent.backdropUrl ?? parent.artworkUrl, hiddenFromCatalogue: true, file, sourcePath: file.path, sourcePaths: [file.path], modifiedAt: file.modifiedAt, durationSeconds: Number(file.streams?.durationSeconds) || (Number(hydratedEpisode.runtime) ? Number(hydratedEpisode.runtime) * 60 : null) };
  }).filter(Boolean);
  const seasons = [...new Set(episodes.map((episode) => episode.seasonNumber))].sort((a, b) => a - b).map((seasonNumber) => { const hydrated = hydratedSeasons.get(seasonNumber) ?? {}; return { ...parent, ...hydrated, id: `${parent.id}:season:${seasonNumber}`, type: "season", title: hydrated.title ?? `Season ${seasonNumber}`, synopsis: hydrated.summary ?? hydrated.overview ?? "", artworkUrl: hydrated.posterUrl ?? parent.artworkUrl, parentTitle: parent.title, showId: parent.id, seasonNumber, itemCount: episodes.filter((episode) => episode.seasonNumber === seasonNumber).length, hiddenFromCatalogue: true, file: episodes.find((episode) => episode.seasonNumber === seasonNumber)?.file }; });
  return [{ ...parent, itemCount: episodes.length }, ...seasons, ...episodes];
}
function toInternalItem(record) { const file = record.files[0]; const mediaType = String(record.mediaType ?? file.parsed?.mediaType ?? "movie").toLowerCase(); const type = mediaType === "tv" || mediaType === "series" ? "show" : mediaType === "episode" ? "episode" : mediaType === "wrestling" || file.mediaSourceId === "wrestling" ? "wrestling" : "movie"; const collectionParts = inferCollectionParts(file.path); const libraryUpdatedAt = latestLibraryActivity(record.files); return { id: String(record.id), type, title: String(record.title), year: record.year ?? record.releaseDate?.slice?.(0, 4) ?? record.firstAirDate?.slice?.(0, 4) ?? null, years: record.years ?? null, genre: libraryGenre(record.genre ?? record.genres?.[0]), rating: record.rating ?? record.certification ?? null, director: record.director ?? record.directors ?? null, directors: record.directors ?? null, creator: record.creator ?? null, createdBy: record.createdBy ?? null, cast: record.cast ?? [], performers: record.performers ?? [], actors: record.actors ?? [], synopsis: record.summary ?? record.overview ?? record.provider?.overview ?? "", artworkUrl: record.art?.posterUrl ?? record.posterUrl ?? null, backdropUrl: record.art?.backdropUrl ?? record.backdropUrl ?? null, sourcePath: file.path, sourcePaths: record.files.map((entry) => entry.path), collectionParts, collectionIds: canonicalCollectionIds(collectionParts), franchiseIds: record.franchiseIds ?? [], ancestorIds: record.ancestorIds ?? [], showId: record.showId ?? null, modifiedAt: libraryUpdatedAt, libraryUpdatedAt, durationSeconds: Number(file.streams?.durationSeconds) || (Number(record.runtime ?? record.averageRuntime) ? Number(record.runtime ?? record.averageRuntime) * 60 : null), file }; }

function latestLibraryActivity(files = []) { return files.map((file) => file.libraryUpdatedAt ?? file.addedAt ?? file.modifiedAt).filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)))[0] ?? null; }

function buildEnrichmentContext(enrichment) {
  const overrides = enrichment.overrides?.items ?? enrichment.overrides ?? {};
  const byPath = new Map();
  const byIdentity = new Map();
  const franchiseIdsByMember = new Map();
  for (const [id, stored] of Object.entries(overrides)) {
    if (!stored || typeof stored !== "object") continue;
    for (const filePath of stored.matchedFilePaths ?? []) byPath.set(normalizePath(filePath), stored);
    const identity = stored.identity;
    if (identity?.title) byIdentity.set(identityKey(identity.title, identity.year, identity.mediaType), stored);
    const metadata = stored.metadata ?? stored;
    if (metadata.recordType === "franchise") for (const memberId of metadata.memberIds ?? []) { if (!franchiseIdsByMember.has(memberId)) franchiseIdsByMember.set(memberId, new Set()); franchiseIdsByMember.get(memberId).add(id); }
  }
  const movieDetails = enrichment.movieDetails ?? {};
  const tvDetails = enrichment.tvDetails ?? {};
  return { overrides, byPath, byIdentity, franchiseIdsByMember, movieDetails, tvDetails, movieDetailsByTitle: indexDetailsByTitle(movieDetails), tvDetailsByTitle: indexDetailsByTitle(tvDetails) };
}

function enrichRecord(record, context) {
  const mediaType = String(record.mediaType ?? record.files?.[0]?.parsed?.mediaType ?? "movie").toLowerCase();
  const detailsIndex = ["tv", "series"].includes(mediaType) ? context.tvDetails : context.movieDetails;
  const detailsByTitle = ["tv", "series"].includes(mediaType) ? context.tvDetailsByTitle : context.movieDetailsByTitle;
  const details = detailsIndex[record.id] ?? detailsByTitle.get(normalize(record.title))?.find((entry) => !entry?.year || !record.year || Number(entry.year) === Number(record.year)) ?? {};
  const direct = context.overrides[record.id];
  const pathMatch = record.files?.map((file) => context.byPath.get(normalizePath(file.path))).find(Boolean);
  const identityMatch = context.byIdentity.get(identityKey(record.title, record.year, mediaType)) ?? context.byIdentity.get(identityKey(record.title, "", mediaType));
  const stored = direct ?? pathMatch ?? identityMatch ?? {};
  const override = stored.metadata ?? {};
  const franchiseIds = [...new Set([...(record.franchiseIds ?? []), ...(details.franchiseIds ?? []), ...(override.franchiseIds ?? []), ...(context.franchiseIdsByMember.get(record.id) ?? [])])];
  return {
    ...record,
    ...details,
    ...override,
    id: record.id,
    mediaType: record.mediaType ?? details.mediaType ?? override.mediaType,
    files: record.files,
    franchiseIds,
    art: {
      ...(record.art ?? {}),
      posterUrl: override.posterUrl ?? details.posterUrl ?? record.art?.posterUrl ?? record.posterUrl ?? null,
      backdropUrl: override.backdropUrl ?? details.backdropUrl ?? record.art?.backdropUrl ?? record.backdropUrl ?? null,
    },
  };
}

function indexDetailsByTitle(details) { const index = new Map(); for (const entry of Object.values(details)) { const key = normalize(entry?.title); if (!key) continue; if (!index.has(key)) index.set(key, []); index.get(key).push(entry); } return index; }
function identityKey(title, year, mediaType) { return `${normalize(title)}|${String(year ?? "")}|${String(mediaType ?? "").toLowerCase()}`; }
function normalizePath(value) { return String(value ?? "").replace(/\\/g, "/").toLowerCase(); }
function inferCollectionParts(filePath) { const parts = String(filePath ?? "").replace(/\\/g, "/").split("/").filter(Boolean); return parts.slice(1, -1).map((name) => ({ id: slug(name), name })).filter((part) => part.id); }
const COLLECTION_GROUP_NAMES = new Set(["vaults", "sagas", "aisles", "boxed-sets", "worlds", "profiles"]);
function canonicalCollectionIds(parts) {
  const groupIndex = parts.findIndex((part) => COLLECTION_GROUP_NAMES.has(part.id));
  if (groupIndex >= 0 && parts[groupIndex + 1]) return [parts[groupIndex + 1].id === "black-excellence" ? "upn" : parts[groupIndex + 1].id];
  const firstKnown = parts.find((part) => CANONICAL_COLLECTION_IDS.has(part.id));
  return firstKnown ? [firstKnown.id] : [];
}
function mediaRow(id, title, items, limit) { return { id, title, items: [...items].sort((a, b) => Date.parse(b.libraryUpdatedAt ?? b.modifiedAt ?? 0) - Date.parse(a.libraryUpdatedAt ?? a.modifiedAt ?? 0) || String(a.title).localeCompare(String(b.title)) || String(a.id).localeCompare(String(b.id))).slice(0, limit).map(projectCard) }; }
function collectionRow(id, title, items, parentId, limit) { const groups = new Map(); for (const item of items) { const index = item.collectionParts.findIndex((part) => part.id === parentId); const child = index >= 0 ? item.collectionParts[index + 1] : null; if (!child) continue; if (!groups.has(child.id)) groups.set(child.id, { name: child.name, items: [] }); groups.get(child.id).items.push(item); } return { id, title, items: [...groups].map(([childId, group]) => projectCollection(childId, group.name, group.items)).sort(byTitle).slice(0, limit) }; }
function topCollectionRow(id, title, items, parentId, limit) { const nested = collectionRow(id, title, items, parentId, limit); return nested.items.length ? nested : { id, title, items: items.some((item) => item.collectionIds.includes(parentId)) ? [projectCollection(parentId, title, items.filter((item) => item.collectionIds.includes(parentId)))] : [] }; }
const COLLECTION_GROUPS = { Vaults: ["a24", "criterion", "defa", "disney", "hammer", "hbo"], Sagas: ["james-bond", "dc", "mcu", "kaiju", "star-trek", "star-wars", "universal-monsters"], Aisles: ["action", "comedy", "documentary", "drama", "fantasy", "horror", "romance", "sci-fi", "sports", "western"], "Boxed Sets": ["animation", "upn", "cult-films", "endless-anime-odyssey", "exploitation", "plan-9-from-the-b-movie-aisle"], Worlds: ["cinema-of-india", "cinema-of-japan"], Profiles: ["david-cronenberg", "george-formby", "martin-scorseses-world-cinema-project", "tom-hanks", "wes-anderson"] };
const CANONICAL_COLLECTION_IDS = new Set(Object.values(COLLECTION_GROUPS).flat());
function curatedGroupRow(id, title, items, group, curated, limit) { let ids = group === "all" ? Object.values(COLLECTION_GROUPS).flat() : group === "non-aisles" ? Object.entries(COLLECTION_GROUPS).filter(([name]) => name !== "Aisles").flatMap(([, values]) => values) : COLLECTION_GROUPS[group] ?? []; const cards = ids.map((collectionId) => { const matches = items.filter((item) => item.collectionIds.includes(collectionId)); const manifest = getCuratedCollectionManifest(curated, collectionId); if (!matches.length) return null; const label = { upn: "UPN", criterion: "The Criterion Collection", mcu: "Marvel Cinematic Library" }[collectionId] ?? manifest?.title ?? matches.flatMap((item) => item.collectionParts).find((part) => part.id === collectionId)?.name ?? titleCase(collectionId); const artworkUrl = collectionButtonUrl(collectionId); return { ...projectCollection(collectionId, label, matches), artworkUrl }; }).filter(Boolean); return { id, title, items: cards.slice(0, limit) }; }
function collectionButtonUrl(id) { return { upn: "/assets/collections/black-excellence/upn-button.png", criterion: "/assets/collections/criterion/criterion-button.png", mcu: "/assets/collections/mcu/mcu-button.png", "endless-anime-odyssey": "/assets/collections/anime/button.png", "cinema-of-japan": "/assets/collections/cinema-of-japan/button-v1.png" }[id] ?? `/assets/collections/${id}/button.png`; }
function getCuratedCollectionManifest(curated, id) { return curated?.collections?.[id === "upn" ? "black-excellence" : id]; }
function projectCuratedCollection(collection, allowed, limit, collectionId) {
  if (!collection?.sections?.length) return [];
  const byId = new Map(allowed.map((item) => [item.id, item]));
  const rows = collection.sections.map((section) => {
    const cards = [];
    for (const spec of section.items ?? []) {
      let item = byId.get(spec.id);
      if (!item) item = allowed.find((candidate) => normalize(candidate.title) === normalize(spec.title) && (!spec.year || Number(candidate.year) === Number(spec.year)));
      if (item) cards.push(projectCard(item));
      else if (spec.targetCollectionId) cards.push(projectCollection(spec.targetCollectionId, spec.title, allowed.filter((candidate) => candidate.collectionIds.includes(spec.targetCollectionId))));
    }
    const sectionId = canonicalSectionId(collectionId, section.id ?? section.title);
    for (const item of allowed.filter((candidate) => canonicalSectionId(collectionId, collectionChildId(candidate, collectionId)) === sectionId)) {
      if (!cards.some((card) => card.id === item.id)) cards.push(projectCard(item));
    }
    return { id: section.id, title: collectionId === "upn" ? upnSectionTitle(section.id, section.title) : section.title, items: dedupeProjectedCards(cards).slice(0, limit) };
  }).filter((row) => row.items.length);
  const known = new Set(rows.map((row) => canonicalSectionId(collectionId, row.id)));
  for (const row of projectFolderCollectionRows(collectionId, allowed, limit)) if (!known.has(canonicalSectionId(collectionId, row.id))) rows.push(row);
  return rows;
}
function projectOverrideCollection(collection, allowed, limit) { return (collection.carousels ?? []).map((carousel, index) => ({ id: slug(carousel.title || `carousel-${index + 1}`), title: carousel.title || `Carousel ${index + 1}`, items: (carousel.itemIds ?? []).map((id) => allowed.find((item) => item.id === id)).filter(Boolean).slice(0, limit).map(projectCard) })).filter((row) => row.items.length); }
function projectFolderCollectionRows(collectionId, allowed, limit) {
  const groups = new Map();
  for (const item of allowed) {
    const childId = collectionChildId(item, collectionId);
    if (!childId) continue;
    const id = canonicalSectionId(collectionId, childId);
    const child = item.collectionParts.find((part) => part.id === childId);
    if (!groups.has(id)) groups.set(id, { title: collectionId === "upn" ? upnSectionTitle(id, child?.name) : child?.name ?? titleCase(id), items: [] });
    groups.get(id).items.push(item);
  }
  return [...groups].map(([id, group]) => ({ id, title: group.title, items: dedupeProjectedCards([...group.items].sort(byYearThenTitle).map(projectCard)).slice(0, limit) }));
}
function collectionChildId(item, collectionId) { const lookup = collectionId === "upn" ? new Set(["upn", "black-excellence"]) : new Set([collectionId]); const index = item.collectionParts.findIndex((part) => lookup.has(part.id)); return index >= 0 ? item.collectionParts[index + 1]?.id ?? null : null; }
function canonicalSectionId(collectionId, value) { const id = slug(value); if (collectionId !== "upn") return id; return { television: "tv-classics", drama: "umoja-unity-the-prestige-collection", "the-prestige-collection": "umoja-unity-the-prestige-collection", "stand-up-comedy": "kujichagulia-self-determination-stand-up-comedy", "sketches-and-animation": "ujima-collective-work-and-responsibility-sketches-and-animation", "sketches-animation": "ujima-collective-work-and-responsibility-sketches-and-animation", horror: "ujamaa-cooperative-economics-horror-because-it-doesn-t-fit-anywhere-else", comedy: "nia-purpose-comedy", "music-and-culture": "kumbaaa-creativity-music-and-culture", "afrofuturism-and-sci-fi": "imani-faith-afrofuturism-and-sci-fi" }[id] ?? id; }
function upnSectionTitle(id, fallback) { return { cinema: "Cinema", "tv-classics": "Television Classics", "umoja-unity-the-prestige-collection": "Drama", "kujichagulia-self-determination-stand-up-comedy": "Stand-Up Comedy", "ujima-collective-work-and-responsibility-sketches-and-animation": "Sketches & Animation", "ujamaa-cooperative-economics-horror-because-it-doesn-t-fit-anywhere-else": "Horror", "nia-purpose-comedy": "Comedy", "kumbaaa-creativity-music-and-culture": "Music & Culture", "imani-faith-afrofuturism-and-sci-fi": "Afrofuturism & Sci-Fi" }[canonicalSectionId("upn", id)] ?? fallback ?? titleCase(id); }
function movieHeroActions() { return ["action", "comedy", "documentary", "fantasy", "drama", "horror", "romance", "sci-fi", "sports", "western"].map((id) => ({ id, title: titleCase(id), type: "collection", target: id, imageUrl: `/assets/collections/movie-signs/${id}.png` })); }
function tvHeroActions() { return [{ id: "watch", title: "watch teebee.", type: "random-tv" }, { id: "guide", title: "wats on teebee", type: "route", target: "guide" }, { id: "off", title: "doan watch teebee.", type: "power-off" }]; }
function wrestlingPromotionRow(id, title, items, predicate, limit) { const groups = new Map(); for (const item of items.filter(predicate)) { const categoryIndex = item.collectionParts.findIndex((part) => ["active", "inactive", "major-promotions"].includes(part.id)); const promotion = categoryIndex >= 0 ? item.collectionParts[categoryIndex + 1] : null; if (!promotion) continue; if (!groups.has(promotion.id)) groups.set(promotion.id, { name: promotion.name, items: [] }); groups.get(promotion.id).items.push(item); } return { id, title, items: [...groups].map(([promotionId, group]) => projectCollection(promotionId, group.name, group.items)).sort(byTitle).slice(0, limit) }; }
function wrestlingProgrammeRow(id, title, items, limit) { const groups = new Map(); for (const item of items) { const weeklyIndex = item.collectionParts.findIndex((part) => ["weekly", "weekly-tv", "television"].includes(part.id)); const programme = weeklyIndex >= 0 ? item.collectionParts[weeklyIndex + 1] : null; if (!programme) continue; if (!groups.has(programme.id)) groups.set(programme.id, { name: programme.name, items: [] }); groups.get(programme.id).items.push(item); } return { id, title, items: [...groups].map(([programmeId, group]) => projectCollection(programmeId, group.name, group.items)).sort(byTitle).slice(0, limit) }; }
function currentRentalsRow(items, userData, limit) {
  const progress = Object.values(userData?.progress ?? {});
  const byId = new Map(items.map((item) => [item.id, item]));
  const rentals = progress
    .filter((entry) => !entry.completed && Number(entry.seconds) >= 60)
    .map((entry) => { const item = byId.get(entry.itemId); return item ? { ...item, progress: entry.durationSeconds ? Number(entry.seconds) / Number(entry.durationSeconds) : null, rentalUpdatedAt: entry.updatedAt } : null; })
    .filter(Boolean);
  const episodesByShow = new Map();
  for (const item of items.filter((entry) => entry.type === "episode")) { if (!episodesByShow.has(item.showId)) episodesByShow.set(item.showId, []); episodesByShow.get(item.showId).push(item); }
  for (const episodes of episodesByShow.values()) {
    episodes.sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
    const completed = new Set(progress.filter((entry) => entry.completed).map((entry) => entry.itemId));
    const latestCompletedIndex = episodes.reduce((latest, episode, index) => completed.has(episode.id) ? index : latest, -1);
    if (latestCompletedIndex >= 1 && completed.has(episodes[latestCompletedIndex - 1]?.id) && episodes[latestCompletedIndex + 1]) {
      const next = episodes[latestCompletedIndex + 1];
      if (!rentals.some((entry) => entry.id === next.id)) rentals.push({ ...next, progress: 0, rentalUpdatedAt: progress.find((entry) => entry.itemId === episodes[latestCompletedIndex].id)?.updatedAt });
    }
  }
  return { id: "current-rentals", title: "Current Rentals", items: rentals.sort((a, b) => String(b.rentalUpdatedAt ?? "").localeCompare(String(a.rentalUpdatedAt ?? ""))).slice(0, limit).map(projectCard) };
}
function filterRentalRow(row, predicate) { return { ...row, items: row.items.filter(predicate) }; }
function projectCollection(id, title, items) { return { id: `collection:${id}`, collectionId: id, type: "collection", title, genre: `${items.length} item${items.length === 1 ? "" : "s"}`, artworkUrl: items.find((item) => item.artworkUrl)?.artworkUrl ?? null }; }
function projectCard(item) { return { id: item.id, type: item.type, title: item.title, year: item.year, genre: item.genre, rating: item.rating, artworkUrl: item.artworkUrl, parentTitle: item.parentTitle, seasonNumber: item.seasonNumber, episodeNumber: item.episodeNumber, itemCount: item.itemCount, durationSeconds: item.durationSeconds, progress: item.progress }; }
function dedupeProjectedCards(cards) { const seen = new Set(); return cards.filter((card) => { const key = `${normalize(card.title)}|${card.year ?? ""}|${card.type ?? ""}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function projectTracks(streams = {}) { return ["video", "audio", "subtitles"].flatMap((type) => (streams?.[type] ?? []).map((track, index) => ({ id: String(track.index ?? index), type, language: track.language ?? null, label: track.label ?? null, codec: track.codec ?? null, channels: type === "audio" ? track.channels ?? null : undefined, default: Boolean(track.default) }))); }
function slug(value) { return String(value ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function titleCase(value) { return String(value ?? "").replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function byTitle(a, b) { return a.title.localeCompare(b.title); }
function byYearThenTitle(a, b) { return (Number(a.year) || 9999) - (Number(b.year) || 9999) || byTitle(a, b); }
function normalize(value) { return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function personNames(value) { return (Array.isArray(value) ? value : value ? [value] : []).flatMap((person) => person && typeof person === "object" ? [person.name, person.title, person.character, person.role].filter(Boolean) : [person]); }
function searchText(value) { return String(value ?? "").trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); }
function libraryGenre(value) { const label = String(value ?? "").trim(); return !label || /^(unsorted|library)$/i.test(label) ? "Library" : label; }
