import { createServer } from "node:http";
import { createReadStream, readFileSync, watch } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.mjs";
import { resolveMediaBinary } from "./media-runtime.mjs";
import { API_V1_VERSION, apiV1Contract, apiV1Error, apiV1Success, getApiV1Capabilities } from "./api-v1-contract.mjs";
import { authenticateAccessToken, claimPairingCode, createAttemptLimiter, createAuthState, createPairingCode, revokeSession, rotateRefreshToken } from "./api-v1-auth.mjs";
import { clearRating, createMixtape, createUserDataState, deleteMixtape, listMixtapes, recentActivity, setMixtapeItem, setProgress, setRating, updateMixtape } from "./api-v1-user-data.mjs";
import { authorizedCollection, authorizedHome, authorizedItem, authorizedSearch, authorizedSection, buildCatalogueIndex, decodeCursor, resolveAuthorizedMedia } from "./api-v1-catalogue.mjs";
import { authorizePlaybackStream, createPlaybackState, negotiatePlayback } from "./api-v1-playback.mjs";

loadEnvFile();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metadataCatalogPath = path.join(root, "src", "metadata.generated.json");
const config = await readConfig();
const mediaSources = normalizeConfiguredMediaSources(config);
const metadataOverridesPath = path.join(root, "config", "metadata-overrides.json");
const collectionOverridesPath = path.join(root, "config", "collection-overrides.json");
const usersPath = path.join(root, "config", "users.json");
const apiV1AuthPath = path.join(root, "config", "api-v1-auth.json");
const apiV1UserDataPath = path.join(root, "config", "api-v1-user-data.json");
const apiV1ServerIdentity = await readJsonFile(path.join(root, "config", "api-v1-server.json"), { serverId: "unconfigured", displayName: "Tobytube Control Centre" });
const tvSpecialsOverrides = await readJsonFile(path.join(root, "config", "tv-specials-overrides.json"), { shows: {} });
const apiV1PlaybackState = createPlaybackState();
const apiV1AttemptLimiter = createAttemptLimiter({ maximum: 8, windowMs: 15 * 60 * 1000 });
const ffprobePath = await resolveMediaBinary("ffprobe", { configuredPath: process.env.FFPROBE_PATH || config.ffprobePath, root });
const ffmpegPath = await resolveMediaBinary("ffmpeg", { configuredPath: process.env.FFMPEG_PATH || config.ffmpegPath, root });
const optimizationJobs = new Map();
const twdbRefreshStatusPath = path.join(root, "cache", "twdb-refresh-status.json");
let twdbRefreshJob = { state: "idle", startedAt: null, finishedAt: null, error: null, result: null };
let apiV1CatalogueCache = { key: null, items: null, curated: null };
const playbackProbeCache = new Map();
const playbackProbePending = new Map();
const subtitleCache = new Map();
const subtitleCachePending = new Map();
const subtitleCacheDirectory = path.join(root, "cache", "subtitles");
let metadataOverridesCache = { mtimeMs: null, size: null, value: null };
const openSubtitles = {
  apiKey: process.env.OPENSUBTITLES_API_KEY ?? config.openSubtitles?.apiKey ?? null,
  token: process.env.OPENSUBTITLES_TOKEN ?? config.openSubtitles?.token ?? null,
  userAgent: process.env.OPENSUBTITLES_USER_AGENT ?? "Tobytube v1",
};
const mediaWatchers = [];
let mediaWatchTimer = null;
let mediaScanPending = false;
let tvdbToken = null;
let tvdbTokenExpiresAt = 0;
const SERVER_BUILD_ID = "windows-migration-runtime-007";
const port = Number(process.env.PORT ?? config.port ?? 8088);
const lanAccessEnabled = process.env.TOBYTUBE_LAN_ACCESS === "true" || process.env.TOBYTUBE_LAN_BETA === "true";
const lanHost = lanAccessEnabled ? resolvePrivateLanHost(process.env.TOBYTUBE_LAN_HOST) : null;
const listenHosts = [...new Set(["127.0.0.1", lanHost].filter(Boolean))];
const jellyfin = {
  url: normalizeBaseUrl(process.env.JELLYFIN_URL ?? config.jellyfin?.url),
  apiKey: process.env.JELLYFIN_API_KEY ?? config.jellyfin?.apiKey ?? null,
  userId: process.env.JELLYFIN_USER_ID ?? config.jellyfin?.userId ?? null,
  itemCache: null,
  itemCacheAt: 0,
  unreachableUntil: 0,
  userCacheAt: 0,
};
const status = {
  buildId: SERVER_BUILD_ID,
  providers: {
    tmdb: { configured: Boolean(process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_API_KEY) },
    tvdb: { configured: Boolean(process.env.TVDB_API_KEY) },
  },
  state: "idle",
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  error: null,
  stats: null,
  mediaRoots: mediaSources.map((source) => source.path),
  mediaSources,
};

const requestHandler = async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/v1" || url.pathname.startsWith("/api/v1/")) {
      await handleApiV1(url, request, response);
      return;
    }

    if (url.pathname === "/api/metadata/status") {
      sendJson(response, status);
      return;
    }
    if (url.pathname === "/api/twdb/refresh/status") {
      sendJson(response, twdbRefreshJob);
      return;
    }
    if (url.pathname === "/api/twdb/refresh" && request.method === "POST") {
      await startTwdbRefresh(request, response);
      return;
    }

    if (url.pathname === "/api/metadata/overrides") {
      await handleMetadataOverrides(request, response);
      return;
    }
    if (url.pathname === "/api/collections") {
      await handleCollections(request, response);
      return;
    }
    if (url.pathname === "/api/users") {
      await handleUsers(request, response);
      return;
    }
    if (url.pathname === "/api/assets/import" && request.method === "POST") {
      await importCollectionAsset(url, request, response);
      return;
    }

    if (url.pathname === "/api/media/analyze" && request.method === "POST") {
      await analyzeMedia(request, response);
      return;
    }

    if (url.pathname === "/api/media/optimize" && request.method === "POST") {
      await optimizeMedia(request, response);
      return;
    }

    if (url.pathname === "/api/media/optimize/status") {
      sendOptimizationStatus(url, response);
      return;
    }

    if (url.pathname === "/api/metadata/rescan" && request.method === "POST") {
      if (status.state !== "scanning") runScan({ refreshAll: config.refreshProviders === true });
      sendJson(response, status);
      return;
    }

    if (url.pathname === "/api/metadata/refresh-tv" && request.method === "POST") {
      await refreshTvMetadata(url, response);
      return;
    }


    if (url.pathname === "/api/metadata/search-match") {
      await searchMetadataMatch(url, response);
      return;
    }
    if (url.pathname === "/api/tmdb/person") {
      await sendTmdbPersonFilmography(url, response);
      return;
    }
    if (url.pathname === "/api/metadata/hydrate-match" && request.method === "POST") {
      await hydrateMetadataMatch(request, response);
      return;
    }
    if (url.pathname === "/api/media/index") {
      await sendMediaIndex(response);
      return;
    }

    if (url.pathname === "/api/media/stream") {
      await streamMedia(url, request, response);
      return;
    }

    if (url.pathname === "/api/media/playback-stream") {
      await streamPlayback(url, request, response);
      return;
    }

    if (url.pathname === "/api/media/playback-info") {
      await sendPlaybackInfo(url, response);
      return;
    }

    if (url.pathname === "/api/media/subtitle") {
      await streamSubtitle(url, response);
      return;
    }

    if (url.pathname === "/api/subtitles/upload" && request.method === "POST") {
      await uploadSubtitle(request, response);
      return;
    }

    if (url.pathname === "/api/subtitles/folder") {
      await listFolderSubtitles(url, response);
      return;
    }

    if (url.pathname === "/api/subtitles/search") {
      await searchOpenSubtitles(url, response);
      return;
    }

    if (url.pathname === "/api/subtitles/download" && request.method === "POST") {
      await downloadOpenSubtitle(request, response);
      return;
    }

    if (url.pathname === "/api/jellyfin/hls-proxy") {
      await proxyJellyfinHls(url, response);
      return;
    }

    if (url.pathname === "/api/jellyfin/status") {
      await sendJellyfinStatus(response);
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    const message = error?.cause?.message ? `${error.message}: ${error.cause.message}` : error.message ?? String(error);
    if (request.url?.startsWith("/api/")) {
      sendApiError(response, 500, message);
    } else {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error.stack ?? String(error));
    }
  }
};

let readyListeners = 0;
for (const host of listenHosts) {
  createServer(requestHandler).listen(port, host, () => {
    console.log(`Tobytube preview running at http://${host}:${port}/`);
    readyListeners += 1;
    if (readyListeners === listenHosts.length) startServerServices();
  });
}

function startServerServices() {
  startMediaWatchers();
  if (process.env.SCAN_ON_STARTUP !== "false" && config.scanOnStartup !== false) {
    runScan({ refreshNew: config.refreshNewProviders !== false });
  }
}

function resolvePrivateLanHost(configuredHost) {
  const explicit = String(configuredHost ?? "").trim();
  if (explicit) return explicit;

  const candidates = [];
  for (const [interfaceName, addresses] of Object.entries(networkInterfaces())) {
    if (/vpn|tunnel|nord|openvpn|wireguard|tailscale|zerotier/i.test(interfaceName)) continue;
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal) continue;
      const value = address.address;
      const priority = value.startsWith("192.168.") ? 1
        : /^172\.(1[6-9]|2\d|3[01])\./.test(value) ? 2
          : value.startsWith("10.") ? 3 : 99;
      if (priority < 99) candidates.push({ value, priority });
    }
  }

  candidates.sort((left, right) => left.priority - right.priority || left.value.localeCompare(right.value));
  if (!candidates.length) {
    throw new Error("TTMV LAN access was requested, but no private Ethernet/Wi-Fi IPv4 address was found. Set TOBYTUBE_LAN_HOST to the trusted LAN address.");
  }
  return candidates[0].value;
}

function runScan({ refreshAll = false, refreshNew = config.refreshNewProviders !== false } = {}) {
  if (status.state === "scanning") {
    mediaScanPending = true;
    return;
  }
  status.state = "scanning";
  status.startedAt = new Date().toISOString();
  status.finishedAt = null;
  status.exitCode = null;
  status.error = null;
  status.stats = null;
  status.mediaRoots = mediaSources.map((source) => source.path);
  status.mediaSources = mediaSources;

  const args = [path.join(root, "scripts", "metadata-pipeline.mjs")];
  for (const source of mediaSources) {
    args.push("--media-source", `${source.id}|${source.type}`, resolveConfiguredPath(source.path));
  }
  const canRefreshNew = refreshNew && isValidJsonFileSync(metadataCatalogPath);
  if (refreshNew && !canRefreshNew) console.warn("Live catalogue is unavailable; rebuilding locally before provider hydration.");
  if (refreshAll) args.push("--refresh-providers");
  else if (canRefreshNew) {
    args.push("--refresh-new-providers");
    args.push("--provider-backfill-limit", String(config.providerBackfillLimit ?? 25));
  }

  const child = spawn(process.execPath, args, {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stderr = "";
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    process.stderr.write(chunk);
  });
  child.on("close", async (code) => {
    status.exitCode = code;
    status.finishedAt = new Date().toISOString();
    status.error = code === 0 ? null : stderr.trim() || `Metadata scan exited with ${code}`;

    try {
      const metadata = JSON.parse(
        await readFile(path.join(root, "src", "metadata.generated.json"), "utf8"),
      );
      status.stats = metadata.stats;
    } catch (error) {
      status.error = status.error ?? `Could not read generated metadata: ${error.message}`;
    }

    status.state = code === 0 ? "ready" : "error";
    if (mediaScanPending) {
      mediaScanPending = false;
      runScan({ refreshNew: config.refreshNewProviders !== false });
    }
  });
}

function isValidJsonFileSync(filePath) {
  try {
    JSON.parse(readFileSync(filePath, "utf8"));
    return true;
  } catch {
    return false;
  }
}

function startMediaWatchers() {
  if (config.watchMediaRoots === false) return;
  for (const source of mediaSources) {
    const mediaRoot = resolveConfiguredPath(source.path);
    try {
      const watcher = watch(mediaRoot, { recursive: true }, (_eventType, filename) => {
        if (!isRelevantMediaChange(filename)) return;
        clearTimeout(mediaWatchTimer);
        mediaWatchTimer = setTimeout(
          () => runScan({ refreshNew: config.refreshNewProviders !== false }),
          Number(config.watchDebounceMs ?? 4000),
        );
      });
      watcher.on("error", (error) => console.warn(`Media watcher stopped for ${mediaRoot}: ${error.message}`));
      mediaWatchers.push(watcher);
      console.log(`Watching media changes in ${mediaRoot}`);
    } catch (error) {
      console.warn(`Could not watch ${mediaRoot}: ${error.message}`);
    }
  }
}

function isRelevantMediaChange(filename) {
  if (!filename) return true;
  return /\.(mkv|mp4|m4v|avi|mov|wmv|webm|mpg|mpeg|ts|m2ts)$/i.test(String(filename));
}


async function handleMetadataOverrides(request, response) {
  if (request.method === "GET") {
    sendJson(response, await readMetadataOverrides());
    return;
  }
  if (request.method !== "PUT" && request.method !== "POST") {
    response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
    return;
  }
  const body = await readRequestJson(request);
  const current = await readMetadataOverrides();
  if (body.overrides && typeof body.overrides === "object") {
    const now = new Date().toISOString();
    const items = { ...(current.items ?? {}) };
    for (const [id, patch] of Object.entries(body.overrides)) {
      if (!String(id).trim() || !patch || typeof patch !== "object") continue;
      const existing = items[id] ?? {};
      items[id] = {
        ...existing,
        ...patch,
        ...(patch.metadata && typeof patch.metadata === "object"
          ? { metadata: { ...(existing.metadata ?? {}), ...patch.metadata } }
          : {}),
        updatedAt: now,
      };
    }
    const next = { ...current, updatedAt: now, items };
    await writeMetadataOverrides(next);
    sendJson(response, { ok: true, count: Object.keys(body.overrides).length, overrides: body.overrides });
    return;
  }
  const itemId = String(body.itemId ?? "").trim();
  if (!itemId) {
    response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: false, error: "itemId is required" }));
    return;
  }
  const override = await updateMetadataOverride(itemId, body.override ?? {});
  sendJson(response, { ok: true, itemId, override });
}

async function updateMetadataOverride(itemId, patch) {
  const current = await readMetadataOverrides();
  const now = new Date().toISOString();
  const next = {
    ...current,
    updatedAt: now,
    items: {
      ...(current.items ?? {}),
      [itemId]: {
        ...(current.items?.[itemId] ?? {}),
        ...patch,
        ...(patch.metadata && typeof patch.metadata === "object"
          ? { metadata: { ...(current.items?.[itemId]?.metadata ?? {}), ...patch.metadata } }
          : {}),
        updatedAt: now,
      },
    },
  };
  await writeMetadataOverrides(next);
  return next.items[itemId];
}

async function handleCollections(request, response) {
  if (request.method === "GET") {
    sendJson(response, await readJsonFile(collectionOverridesPath, { version: 1, collections: {} }));
    return;
  }
  const body = await readRequestJson(request);
  if (request.method === "DELETE") {
    const collectionId = String(body.collectionId ?? "").trim();
    if (!collectionId) return sendApiError(response, 400, "collectionId is required");
    const current = await readJsonFile(collectionOverridesPath, { version: 1, collections: {} });
    const deletedAt = new Date().toISOString();
    const next = { ...current, updatedAt: deletedAt, collections: { ...(current.collections ?? {}), [collectionId]: { id: collectionId, deleted: true, deletedAt } } };
    await writeJsonFile(collectionOverridesPath, next);
    sendJson(response, { ok: true, collectionId, data: next });
    return;
  }
  if (request.method !== "PUT" && request.method !== "POST") return sendApiError(response, 405, "Method not allowed");
  const collection = body.collection ?? {};
  const collectionId = String(collection.id ?? "").trim();
  if (!collectionId || !collection.title) return sendApiError(response, 400, "Collection id and title are required");
  const current = await readJsonFile(collectionOverridesPath, { version: 1, collections: {} });
  const saved = { ...collection, id: collectionId, updatedAt: new Date().toISOString() };
  const next = { ...current, version: 1, updatedAt: saved.updatedAt, collections: { ...(current.collections ?? {}), [collectionId]: saved } };
  await writeJsonFile(collectionOverridesPath, next);
  sendJson(response, { ok: true, collection: saved, data: next });
}

async function handleUsers(request, response) {
  const fallback = { version: 1, users: [] };
  if (request.method === "GET") {
    sendJson(response, await readJsonFile(usersPath, fallback));
    return;
  }
  if (request.method !== "PUT" && request.method !== "POST") return sendApiError(response, 405, "Method not allowed");
  const body = await readRequestJson(request);
  const submitted = body.user ?? {};
  const displayName = String(submitted.displayName ?? "").trim().slice(0, 80);
  if (!displayName) return sendApiError(response, 400, "Display name is required");
  const current = await readJsonFile(usersPath, fallback);
  const id = String(submitted.id ?? "").trim().replace(/[^a-z0-9-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase()
    || `user-${Date.now()}`;
  const cleanList = (value, limit = 250) => [...new Set((Array.isArray(value) ? value : []).map((entry) => String(entry).trim()).filter(Boolean))].slice(0, limit);
  const previous = (current.users ?? []).find((user) => user.id === id);
  const now = new Date().toISOString();
  const saved = {
    id,
    displayName,
    role: submitted.role === "admin" ? "admin" : "viewer",
    enabled: submitted.enabled !== false,
    accessMode: submitted.accessMode === "collections-only" ? "collections-only" : "all-except-blocked",
    allowedCollections: cleanList(submitted.allowedCollections),
    blockedRatings: cleanList(submitted.blockedRatings, 50),
    blockedItemIds: cleanList(submitted.blockedItemIds),
    blockedFranchiseIds: cleanList(submitted.blockedFranchiseIds),
    blockedPathRules: cleanList(submitted.blockedPathRules),
    notes: String(submitted.notes ?? "").trim().slice(0, 1000),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    lastActiveAt: previous?.lastActiveAt ?? null,
    viewing: previous?.viewing ?? { records: [], favourites: [], totalSeconds: 0 },
  };
  const users = [...(current.users ?? []).filter((user) => user.id !== id), saved];
  const next = { ...current, version: 1, updatedAt: now, users };
  await writeJsonFile(usersPath, next);
  sendJson(response, { ok: true, user: saved, data: next });
}

async function readJsonFile(filePath, fallback) {
  try { return JSON.parse(await readFile(filePath, "utf8")); } catch { return fallback; }
}

async function writeJsonFile(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function importCollectionAsset(url, request, response) {
  const rawName = String(url.searchParams.get("filename") ?? "image");
  const extension = path.extname(rawName).toLowerCase();
  if (!new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]).has(extension)) return sendApiError(response, 400, "Choose a PNG, JPG, WEBP, or GIF image");
  const kind = String(url.searchParams.get("kind") ?? "collection").replace(/[^a-z0-9-]/gi, "").toLowerCase() || "collection";
  const base = path.basename(rawName, extension).replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "image";
  const fileName = `${base}-${Date.now()}${extension === ".jpeg" ? ".jpg" : extension}`;
  const outputDirectory = path.join(root, "assets", "collections", "custom", kind);
  const body = await readRequestBuffer(request, 20_000_000);
  if (!body.length) return sendApiError(response, 400, "The selected image was empty");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, fileName), body);
  sendJson(response, { ok: true, path: `./assets/collections/custom/${kind}/${fileName}` });
}

function readRequestBuffer(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    request.on("data", (chunk) => {
      length += chunk.length;
      if (length > limit) { request.destroy(new Error("Upload is too large")); return; }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function readMetadataOverrides() {
  try {
    const details = await stat(metadataOverridesPath);
    if (metadataOverridesCache.value
      && metadataOverridesCache.mtimeMs === details.mtimeMs
      && metadataOverridesCache.size === details.size) {
      return metadataOverridesCache.value;
    }
    const value = JSON.parse(await readFile(metadataOverridesPath, "utf8"));
    metadataOverridesCache = { mtimeMs: details.mtimeMs, size: details.size, value };
    return value;
  } catch {
    return { version: 1, updatedAt: null, items: {} };
  }
}

async function writeMetadataOverrides(overrides) {
  await mkdir(path.dirname(metadataOverridesPath), { recursive: true });
  await writeFile(metadataOverridesPath, `${JSON.stringify(overrides, null, 2)}\n`, "utf8");
  const details = await stat(metadataOverridesPath);
  metadataOverridesCache = { mtimeMs: details.mtimeMs, size: details.size, value: overrides };
}

async function analyzeMedia(request, response) {
  const body = await readRequestJson(request);
  const itemId = String(body.itemId ?? "").trim();
  if (!itemId) return sendApiError(response, 400, "itemId is required");
  const filePath = await resolveMediaRequestPath(body.filePath);
  if (!filePath) return sendApiError(response, 404, "A valid media file was not found");
  if (!(await stat(ffprobePath).catch(() => null))?.isFile()) return sendApiError(response, 503, "ffprobe is not available");

  const startedAt = new Date().toISOString();
  await updateMetadataOverride(itemId, { analysis: { status: "running", filePath, startedAt } });
  const result = await runProcess(ffprobePath, ["-v", "error", "-show_format", "-show_streams", "-of", "json", filePath]);
  if (!result.ok) {
    const analysis = { status: "failed", filePath, startedAt, finishedAt: new Date().toISOString(), error: result.error };
    await updateMetadataOverride(itemId, { analysis });
    return sendApiError(response, 500, result.error, { analysis });
  }

  const probe = JSON.parse(result.stdout || "{}");
  const analysis = normalizeProbeResult(filePath, probe, startedAt);
  const override = await updateMetadataOverride(itemId, { analysis });
  sendJson(response, { ok: true, itemId, analysis, override });
}

async function optimizeMedia(request, response) {
  const body = await readRequestJson(request);
  const itemId = String(body.itemId ?? "").trim();
  if (!itemId) return sendApiError(response, 400, "itemId is required");
  const existing = optimizationJobs.get(itemId);
  if (existing?.status === "running" || existing?.status === "queued") {
    sendJson(response, { ok: true, job: existing });
    return;
  }
  const filePath = await resolveMediaRequestPath(body.filePath);
  if (!filePath) return sendApiError(response, 404, "A valid media file was not found");
  if (!(await stat(ffmpegPath).catch(() => null))?.isFile()) return sendApiError(response, 503, "ffmpeg is not available");

  const outputDirectory = path.join(path.dirname(filePath), ".tobytube-optimized");
  const outputPath = path.join(outputDirectory, `${path.parse(filePath).name}.optimized.mp4`);
  if (!isAllowedMediaPath(outputPath)) return sendApiError(response, 403, "Optimization output is outside configured media roots");
  await mkdir(outputDirectory, { recursive: true });
  const completedOutput = await stat(outputPath).catch(() => null);
  if (completedOutput?.isFile()) {
    const job = { itemId, status: "complete", sourcePath: filePath, outputPath, outputSize: completedOutput.size, finishedAt: new Date().toISOString(), reusedExistingCopy: true };
    optimizationJobs.set(itemId, job);
    await updateMetadataOverride(itemId, { optimization: job });
    sendJson(response, { ok: true, job });
    return;
  }
  const job = { itemId, status: "queued", sourcePath: filePath, outputPath, requestedAt: new Date().toISOString(), progress: null };
  optimizationJobs.set(itemId, job);
  await updateMetadataOverride(itemId, { optimization: job });
  runOptimizationJob(job);
  sendJson(response, { ok: true, job });
}

async function runOptimizationJob(job) {
  Object.assign(job, { status: "running", startedAt: new Date().toISOString() });
  await updateMetadataOverride(job.itemId, { optimization: { ...job } });
  const args = ["-n", "-i", job.sourcePath, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", job.outputPath];
  const result = await runProcess(ffmpegPath, args);
  Object.assign(job, {
    status: result.ok ? "complete" : "failed",
    finishedAt: new Date().toISOString(),
    error: result.ok ? null : result.error,
  });
  if (result.ok) job.outputSize = (await stat(job.outputPath).catch(() => null))?.size ?? null;
  await updateMetadataOverride(job.itemId, { optimization: { ...job } });
}

function sendOptimizationStatus(url, response) {
  const itemId = String(url.searchParams.get("itemId") ?? "").trim();
  const job = optimizationJobs.get(itemId) ?? null;
  sendJson(response, { ok: true, itemId, job });
}

async function resolveMediaRequestPath(value) {
  const filePath = resolveLibraryMediaPath(value);
  if (!value || !isAllowedMediaPath(filePath)) return null;
  const fileStats = await stat(filePath).catch(() => null);
  return fileStats?.isFile() ? filePath : null;
}

function normalizeProbeResult(filePath, probe, startedAt) {
  const streams = probe.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === "video") ?? null;
  const audio = streams.filter((stream) => stream.codec_type === "audio");
  const subtitles = streams.filter((stream) => stream.codec_type === "subtitle");
  return {
    status: "complete",
    filePath,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationSeconds: Number(probe.format?.duration) || null,
    size: Number(probe.format?.size) || null,
    bitRate: Number(probe.format?.bit_rate) || null,
    container: probe.format?.format_name ?? null,
    video: video ? { codec: video.codec_name ?? null, profile: video.profile ?? null, width: video.width ?? null, height: video.height ?? null, frameRate: video.avg_frame_rate ?? null, pixelFormat: video.pix_fmt ?? null, hdr: /smpte2084|arib-std-b67/i.test(`${video.color_transfer ?? ""}`) } : null,
    audio: audio.map((stream) => ({ codec: stream.codec_name ?? null, channels: stream.channels ?? null, language: stream.tags?.language ?? null })),
    subtitles: subtitles.map((stream) => ({ codec: stream.codec_name ?? null, language: stream.tags?.language ?? null })),
  };
}

function runProcess(command, args, { timeoutMs = 0 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    const timer = timeoutMs > 0 ? setTimeout(() => {
      timedOut = true;
      if (!child.killed) child.kill();
    }, timeoutMs) : null;
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-8_000_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-16_000); });
    child.on("error", (error) => finish({ ok: false, stdout, error: error.message }));
    child.on("close", (code) => finish({ ok: code === 0 && !timedOut, stdout: stdout.trim(), error: timedOut ? `Process timed out after ${timeoutMs}ms` : code === 0 ? null : stderr.trim().slice(-4000) || `Process exited with ${code}` }));
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function handleApiV1(url, request, response) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-tobytube-api-version": API_V1_VERSION,
  };
  const send = (statusCode, body) => {
    response.writeHead(statusCode, headers);
    response.end(JSON.stringify(body, null, 2));
  };
  const discoveryPaths = new Set(["/api/v1", "/api/v1/capabilities", "/api/v1/contract"]);
  if (discoveryPaths.has(url.pathname) && request.method !== "GET") {
    send(405, apiV1Error("METHOD_NOT_ALLOWED", "This contract-discovery endpoint accepts GET only."));
    return;
  }
  if (url.pathname === "/api/v1") {
    const fingerprint = createHash("sha256").update(String(apiV1ServerIdentity.serverId)).digest("hex").match(/.{1,4}/g).slice(0, 4).join("-").toUpperCase();
    send(200, apiV1Success({ name: apiV1Contract.name, version: API_V1_VERSION, stability: apiV1Contract.stability, server: { id: apiV1ServerIdentity.serverId, displayName: apiV1ServerIdentity.displayName, fingerprint }, capabilitiesUrl: "/api/v1/capabilities", contractUrl: "/api/v1/contract" }));
    return;
  }
  if (url.pathname === "/api/v1/capabilities") {
    send(200, apiV1Success(getApiV1Capabilities()));
    return;
  }
  if (url.pathname === "/api/v1/contract") {
    send(200, apiV1Success(apiV1Contract));
    return;
  }
  if (url.pathname === "/api/v1/admin/pairing-codes" && request.method === "POST") {
    if (!isLoopbackRequest(request)) return send(403, apiV1Error("LOCAL_CONTROL_CENTRE_REQUIRED", "Pairing codes can only be created from the local Control Centre."));
    const body = await readRequestJson(request);
    const users = await readJsonFile(usersPath, { users: [] });
    const user = (users.users ?? []).find((entry) => entry.id === body.userId && entry.enabled !== false);
    if (!user) return send(404, apiV1Error("USER_NOT_AVAILABLE", "The selected account is unavailable."));
    const state = await readJsonFile(apiV1AuthPath, createAuthState());
    const result = createPairingCode(state, user.id);
    await writeJsonFile(apiV1AuthPath, state);
    return send(201, apiV1Success(result));
  }
  if (url.pathname === "/api/v1/pairing/claim" && request.method === "POST") {
    const throttleKey = `pair:${request.socket.remoteAddress ?? "unknown"}`;
    if (!apiV1AttemptLimiter.allow(throttleKey)) return send(429, apiV1Error("TOO_MANY_ATTEMPTS", "Try again later."));
    const state = await readJsonFile(apiV1AuthPath, createAuthState());
    const result = claimPairingCode(state, await readRequestJson(request));
    if (!result) { apiV1AttemptLimiter.recordFailure(throttleKey); return send(401, apiV1Error("PAIRING_FAILED", "The pairing code is invalid or expired.")); }
    if (!(await isEnabledApiUser(result.session.userId))) return send(401, apiV1Error("PAIRING_FAILED", "The pairing code is invalid or expired."));
    apiV1AttemptLimiter.clear(throttleKey);
    await writeJsonFile(apiV1AuthPath, state);
    return send(201, apiV1Success(result));
  }
  if (url.pathname === "/api/v1/auth/refresh" && request.method === "POST") {
    const throttleKey = `refresh:${request.socket.remoteAddress ?? "unknown"}`;
    if (!apiV1AttemptLimiter.allow(throttleKey)) return send(429, apiV1Error("TOO_MANY_ATTEMPTS", "Try again later."));
    const state = await readJsonFile(apiV1AuthPath, createAuthState());
    const result = rotateRefreshToken(state, (await readRequestJson(request)).refreshToken);
    if (!result) { apiV1AttemptLimiter.recordFailure(throttleKey); return send(401, apiV1Error("REFRESH_FAILED", "The refresh token is invalid or expired.")); }
    if (!(await isEnabledApiUser(result.session.userId))) return send(401, apiV1Error("REFRESH_FAILED", "The refresh token is invalid or expired."));
    apiV1AttemptLimiter.clear(throttleKey);
    await writeJsonFile(apiV1AuthPath, state);
    return send(200, apiV1Success(result));
  }
  if (url.pathname === "/api/v1/auth/me" && request.method === "GET") {
    const state = await readJsonFile(apiV1AuthPath, createAuthState());
    const session = authenticateAccessToken(state, readBearerToken(request));
    return session && await isEnabledApiUser(session.userId) ? send(200, apiV1Success({ session })) : send(401, apiV1Error("AUTHENTICATION_REQUIRED", "A valid access token is required."));
  }
  if (url.pathname === "/api/v1/auth/logout" && request.method === "POST") {
    const state = await readJsonFile(apiV1AuthPath, createAuthState());
    const session = authenticateAccessToken(state, readBearerToken(request));
    if (!session) return send(401, apiV1Error("AUTHENTICATION_REQUIRED", "A valid access token is required."));
    revokeSession(state, session.id);
    await writeJsonFile(apiV1AuthPath, state);
    return send(200, apiV1Success({ revoked: true }));
  }
  if (["/api/v1/home", "/api/v1/search"].includes(url.pathname) || /^\/api\/v1\/(?:items|sections|collections)\/[^/]+$/.test(url.pathname) || url.pathname === "/api/v1/playback/sessions" || /^\/api\/v1\/playback\/(?:streams|subtitles)\/[^/]+(?:\/[^/]+)?$/.test(url.pathname)) {
    const context = await authenticateApiContext(request);
    if (!context) return send(401, apiV1Error("AUTHENTICATION_REQUIRED", "A valid access token is required."));
    const { items, curated } = await readApiV1Catalogue();
    const apiUserDataState = await readJsonFile(apiV1UserDataPath, createUserDataState());
    const apiUserData = apiUserDataState.users?.[context.user.id] ?? null;
    try {
      if (url.pathname === "/api/v1/home" && request.method === "GET") return send(200, apiV1Success(authorizedHome(context.user, items, 20, curated, apiUserData)));
      const sectionMatch = url.pathname.match(/^\/api\/v1\/sections\/([^/]+)$/);
      if (sectionMatch && request.method === "GET") return send(200, apiV1Success(authorizedSection(context.user, items, decodeURIComponent(sectionMatch[1]), 20, curated, apiUserData)));
      const collectionMatch = url.pathname.match(/^\/api\/v1\/collections\/([^/]+)$/);
      if (collectionMatch && request.method === "GET") return send(200, apiV1Success(authorizedCollection(context.user, items, decodeURIComponent(collectionMatch[1]), 200, curated)));
      if (url.pathname === "/api/v1/search" && request.method === "GET") return send(200, apiV1Success(authorizedSearch(context.user, items, url.searchParams.get("q"), Math.min(100, Number(url.searchParams.get("limit")) || 30), decodeCursor(url.searchParams.get("cursor")))));
      const itemMatch = url.pathname.match(/^\/api\/v1\/items\/([^/]+)$/);
      if (itemMatch && request.method === "GET") return send(200, apiV1Success({ item: authorizedItem(context.user, items, decodeURIComponent(itemMatch[1])) }));
      if (url.pathname === "/api/v1/playback/sessions" && request.method === "POST") {
        const body = await readRequestJson(request); const item = resolveAuthorizedMedia(context.user, items, body.itemId); const file = item.file;
        const externalSubtitles = await findExternalSubtitles(file.path);
        const streams = { ...(file.streams ?? {}), subtitles: [...(file.streams?.subtitles ?? []), ...externalSubtitles] };
        const decision = negotiatePlayback(apiV1PlaybackState, { user: context.user, deviceSession: context.session, item, media: { sourcePath: file.path, container: path.extname(file.path).slice(1), durationSeconds: item.durationSeconds, streams }, clientCapabilities: body.capabilities, resumeSeconds: body.resumeSeconds });
        const decisionUrl = new URL(`${request.socket.encrypted ? "https" : "http"}://${request.headers.host}/api/v1/playback/streams/${decision.sessionId}`);
        if (decision.delivery === "transcode" && decision.resumeSeconds > 0) decisionUrl.searchParams.set("start", String(decision.resumeSeconds));
        decision.url = decisionUrl.toString();
        decision.tracks = decision.tracks.map((track) => track.external ? { ...track, url: `${decisionUrl.origin}/api/v1/playback/subtitles/${decision.sessionId}/${encodeURIComponent(track.id)}` } : track);
        return send(201, apiV1Success({ decision }));
      }
      const streamMatch = url.pathname.match(/^\/api\/v1\/playback\/streams\/([^/]+)$/);
      if (streamMatch && request.method === "GET") {
        const playback = authorizePlaybackStream(apiV1PlaybackState, { sessionId: decodeURIComponent(streamMatch[1]), deviceSession: context.session });
        const internalUrl = new URL(url); internalUrl.searchParams.set("path", playback.sourcePath); internalUrl.searchParams.set("mode", playback.profile.delivery === "transcode" ? "local-transcode" : "direct");
        return streamPlayback(internalUrl, request, response);
      }
      const subtitleMatch = url.pathname.match(/^\/api\/v1\/playback\/subtitles\/([^/]+)\/([^/]+)$/);
      if (subtitleMatch && request.method === "GET") {
        const playback = authorizePlaybackStream(apiV1PlaybackState, { sessionId: decodeURIComponent(subtitleMatch[1]), deviceSession: context.session });
        const subtitle = playback.subtitleSources?.find((entry) => entry.id === decodeURIComponent(subtitleMatch[2]));
        if (!subtitle) return send(404, apiV1Error("SUBTITLE_NOT_AVAILABLE", "That subtitle track is unavailable."));
        const internalUrl = new URL(url); internalUrl.searchParams.set("path", playback.sourcePath); internalUrl.searchParams.set("subtitleStreamIndex", subtitle.id); internalUrl.searchParams.set("subtitlePath", subtitle.path);
        return streamSubtitle(internalUrl, response);
      }
      return send(405, apiV1Error("METHOD_NOT_ALLOWED", "This authorized media operation is not supported."));
    } catch (error) { return send(error.statusCode ?? 400, apiV1Error(error.code ?? "MEDIA_NOT_AVAILABLE", error.message)); }
  }
  if (["/api/v1/mixtapes", "/api/v1/activity/recent"].includes(url.pathname) || /^\/api\/v1\/(?:mixtapes|ratings|progress)\//.test(url.pathname)) {
    const authState = await readJsonFile(apiV1AuthPath, createAuthState());
    const session = authenticateAccessToken(authState, readBearerToken(request));
    if (!session || !(await isEnabledApiUser(session.userId))) return send(401, apiV1Error("AUTHENTICATION_REQUIRED", "A valid access token is required."));
    const dataState = await readJsonFile(apiV1UserDataPath, createUserDataState());
    const userDataExisted = Object.hasOwn(dataState.users ?? {}, session.userId);
    try {
      let result;
      let changed = false;
      if (url.pathname === "/api/v1/mixtapes" && request.method === "GET") result = { mixtapes: listMixtapes(dataState, session.userId) };
      else if (url.pathname === "/api/v1/mixtapes" && request.method === "POST") { result = { mixtape: createMixtape(dataState, session.userId, (await readRequestJson(request)).name) }; changed = true; }
      else if (url.pathname === "/api/v1/activity/recent" && request.method === "GET") result = { activity: recentActivity(dataState, session.userId, url.searchParams.get("limit")) };
      else {
        const mixtapeItem = url.pathname.match(/^\/api\/v1\/mixtapes\/([^/]+)\/items\/([^/]+)$/);
        const mixtape = url.pathname.match(/^\/api\/v1\/mixtapes\/([^/]+)$/);
        const rating = url.pathname.match(/^\/api\/v1\/ratings\/([^/]+)$/);
        const progress = url.pathname.match(/^\/api\/v1\/progress\/([^/]+)$/);
        if (mixtapeItem && ["PUT", "DELETE"].includes(request.method)) { const body = await readRequestJson(request); result = { mixtape: setMixtapeItem(dataState, session.userId, decodeURIComponent(mixtapeItem[1]), decodeURIComponent(mixtapeItem[2]), request.method === "PUT", body.version) }; changed = true; }
        else if (mixtape && request.method === "PUT") { const body = await readRequestJson(request); result = { mixtape: updateMixtape(dataState, session.userId, decodeURIComponent(mixtape[1]), body, body.version) }; changed = true; }
        else if (mixtape && request.method === "DELETE") { const body = await readRequestJson(request); result = { deleted: deleteMixtape(dataState, session.userId, decodeURIComponent(mixtape[1]), body.version) }; changed = true; }
        else if (rating && request.method === "PUT") { result = { rating: setRating(dataState, session.userId, decodeURIComponent(rating[1]), (await readRequestJson(request)).quarterStars) }; changed = true; }
        else if (rating && request.method === "DELETE") { result = { deleted: clearRating(dataState, session.userId, decodeURIComponent(rating[1])) }; changed = true; }
        else if (progress && request.method === "PUT") { const body = await readRequestJson(request); result = { progress: setProgress(dataState, session.userId, { ...body, itemId: decodeURIComponent(progress[1]) }) }; changed = true; }
        else return send(405, apiV1Error("METHOD_NOT_ALLOWED", "This user-data operation is not supported."));
      }
      if (changed || !userDataExisted) await writeJsonFile(apiV1UserDataPath, dataState);
      return send(200, apiV1Success(result));
    } catch (error) {
      return send(error.statusCode ?? 400, apiV1Error(error.code ?? "INVALID_USER_DATA", error.message, error.details));
    }
  }
  const matchingRoutes = apiV1Contract.routes.filter((route) => {
    const pattern = route.path.replace(/\{[^/]+\}/g, "[^/]+");
    return new RegExp(`^${pattern}$`).test(url.pathname);
  });
  if (matchingRoutes.some((route) => route.method === request.method)) {
    send(501, apiV1Error("NOT_IMPLEMENTED", "This Phase 1 capability is contracted but not available yet."));
    return;
  }
  if (matchingRoutes.length) {
    send(405, apiV1Error("METHOD_NOT_ALLOWED", `Use ${matchingRoutes.map((route) => route.method).join(" or ")} for this route.`));
    return;
  }
  send(404, apiV1Error("NOT_FOUND", "No API v1 route matches this request."));
}

async function readApiV1Catalogue() {
  const paths = {
    metadata: path.join(root, "src", "metadata.generated.json"),
    overrides: metadataOverridesPath,
    movies: path.join(root, "src", "movie-detail.generated.json"),
    tv: path.join(root, "src", "tv-detail.generated.json"),
    curated: path.join(root, "src", "curated-manifest.generated.json"),
    mcu: path.join(root, "src", "mcu-collection.generated.json"),
    criterion: path.join(root, "src", "criterion-collection.generated.json"),
    collectionOverrides: collectionOverridesPath,
  };
  const signatures = await Promise.all(Object.values(paths).map(async (filePath) => { const info = await stat(filePath).catch(() => null); return `${filePath}:${info?.mtimeMs ?? 0}:${info?.size ?? 0}`; }));
  const key = signatures.join("|");
  if (apiV1CatalogueCache.key === key && apiV1CatalogueCache.items) return apiV1CatalogueCache;
  const [metadata, overrides, movieDetails, tvDetails, curatedBase, mcu, criterion, collectionOverrides] = await Promise.all([
    readJsonFile(paths.metadata, { records: [] }), readJsonFile(paths.overrides, { items: {} }),
    readJsonFile(paths.movies, { movies: {} }), readJsonFile(paths.tv, { shows: {} }),
    readJsonFile(paths.curated, { collections: {} }), readJsonFile(paths.mcu, { collection: null }),
    readJsonFile(paths.criterion, { collection: null }),
    readJsonFile(paths.collectionOverrides, { collections: {} }),
  ]);
  const curated = { ...curatedBase, criterion, criterionManifest: curatedBase.criterion, collectionOverrides, specialCollections: { mcu: mcu.collection, criterion } };
  apiV1CatalogueCache = { key, items: buildCatalogueIndex(metadata, { overrides, movieDetails: movieDetails.movies, tvDetails: tvDetails.shows }), curated };
  return apiV1CatalogueCache;
}

function readBearerToken(request) {
  const match = String(request.headers.authorization ?? "").match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
}

function isLoopbackRequest(request) {
  const address = String(request.socket.remoteAddress ?? "").toLowerCase();
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

async function isEnabledApiUser(userId) {
  const users = await readJsonFile(usersPath, { users: [] });
  return Boolean((users.users ?? []).find((user) => user.id === userId && user.enabled !== false));
}

async function authenticateApiContext(request) {
  const authState = await readJsonFile(apiV1AuthPath, createAuthState());
  const session = authenticateAccessToken(authState, readBearerToken(request));
  if (!session) return null;
  const users = await readJsonFile(usersPath, { users: [] });
  const user = (users.users ?? []).find((entry) => entry.id === session.userId && entry.enabled !== false);
  return user ? { session, user } : null;
}

function sendApiError(response, statusCode, error, extra = {}) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify({ ok: false, error, ...extra }, null, 2));
}

function readRequestJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) request.destroy(new Error("Request body too large"));
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}
async function refreshTvMetadata(url, response) {
  const showId = String(url.searchParams.get("showId") ?? "").trim();
  const args = [path.join(root, "scripts", "fetch-tv-details.mjs"), "--refresh-existing"];
  if (showId) args.push(`--show-id=${showId}`);
  const result = await runNodeScript(args);
  sendJson(response, result);
}

function runNodeScript(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, exitCode: code, stdout: stdout.trim(), error: code === 0 ? null : stderr.trim() || `Script exited with ${code}` });
    });
  });
}

async function startTwdbRefresh(request, response) {
  if (twdbRefreshJob.state === "running") return sendApiError(response, 409, "A TWDB refresh is already running");
  const body = await readRequestJson(request);
  const promotion = String(body.promotion ?? "all").toLowerCase();
  const year = Number(body.year ?? new Date().getFullYear());
  if (!["all", "wwe", "aew", "tna"].includes(promotion)) return sendApiError(response, 400, "Unsupported TWDB refresh scope");
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return sendApiError(response, 400, "Invalid TWDB refresh year");
  twdbRefreshJob = { state: "running", promotion, year, startedAt: new Date().toISOString(), finishedAt: null, error: null, result: null };
  const child = spawn(process.execPath, [path.join(root, "scripts", "refresh-twdb.mjs"), `--promotion=${promotion}`, `--year=${year}`], { cwd: root, env: process.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output = `${output}${chunk}`.slice(-20000); process.stdout.write(chunk); });
  child.stderr.on("data", (chunk) => { output = `${output}${chunk}`.slice(-20000); process.stderr.write(chunk); });
  child.on("close", async (code) => {
    let result = null;
    try { result = JSON.parse(await readFile(twdbRefreshStatusPath, "utf8")); } catch {}
    const fallbackError = output.slice(-2000) || `Refresh exited with ${code}`;
    twdbRefreshJob = { ...twdbRefreshJob, state: code === 0 ? "ready" : "error", finishedAt: new Date().toISOString(), error: code === 0 ? null : (result?.error ?? fallbackError), result };
  });
  sendJson(response, { ok: true, job: twdbRefreshJob });
}
async function searchMetadataMatch(url, response) {
  const title = String(url.searchParams.get("title") ?? "").trim();
  if (!title) {
    sendJson(response, { results: [], error: "Title is required." });
    return;
  }

  const mediaType = String(url.searchParams.get("mediaType") ?? "movie").toLowerCase();
  const agent = String(url.searchParams.get("agent") ?? "TMDB").toUpperCase();
  if (agent === "TWDB") {
    await searchTwdbMatch(title, String(url.searchParams.get("year") ?? "").trim(), response);
    return;
  }
  if (agent === "TVDB") {
    await searchTvdbMatch(title, mediaType, response);
    return;
  }
  const year = String(url.searchParams.get("year") ?? "").trim();
  const language = normalizeTmdbLanguage(url.searchParams.get("language"));
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;
  if (!token && !apiKey) {
    sendJson(response, { results: [], error: "TMDB credentials are not configured." });
    return;
  }

  const preferredEndpointType = mediaType === "tv" ? "tv" : "movie";
  const endpointTypes = [preferredEndpointType, preferredEndpointType === "tv" ? "movie" : "tv"];
  const headers = token ? { accept: "application/json", authorization: `Bearer ${token}` } : { accept: "application/json" };
  try {
    // An explicitly entered year is a constraint, not merely a ranking hint.
    // Broaden only when the user leaves the year blank so exact-year matches
    // cannot be crowded out by similarly titled releases from other years.
    const searches = year ? [year] : [null];
    const candidates = (await Promise.all(endpointTypes.flatMap((endpointType) =>
      searches.map(async (searchYear) => {
        const target = new URL(`https://api.themoviedb.org/3/search/${endpointType}`);
        target.searchParams.set("query", title);
        target.searchParams.set("include_adult", "false");
        target.searchParams.set("language", language);
        if (searchYear) target.searchParams.set(endpointType === "tv" ? "first_air_date_year" : "year", searchYear);
        if (!token && apiKey) target.searchParams.set("api_key", apiKey);
        const upstream = await fetch(target, { headers });
        if (!upstream.ok) throw new Error(`TMDB search failed: ${upstream.status}`);
        const payload = await upstream.json();
        return (payload.results ?? []).map((item) => ({ ...item, _endpointType: endpointType }));
      })
    ))).flat();
    const combined = [...new Map(candidates.map((item) => [`${item._endpointType}:${item.id}`, item])).values()];
    const results = combined.slice(0, 20).map((item) => {
      const releaseDate = item.release_date ?? item.first_air_date ?? "";
      return {
        provider: "TMDB", providerId: item.id, mediaType: item._endpointType, title: item.title ?? item.name ?? title,
        year: /^\d{4}/.test(releaseDate) ? releaseDate.slice(0, 4) : null, language: item.original_language ?? null,
        overview: item.overview ?? "", posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w185${item.poster_path}` : null,
        backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w300${item.backdrop_path}` : null, score: item.vote_average ?? null,
      };
    });
    sendJson(response, { results, broadenedSearch: false });
  } catch (error) {
    const detail = [error?.cause?.code, error?.cause?.message, error?.message]
      .filter((value, index, values) => value && values.indexOf(value) === index)
      .join(": ") || "network request failed";
    sendApiError(response, 502, `TMDB could not be reached: ${detail}`);
  }
}

function normalizeTmdbLanguage(value) {
  const language = String(value ?? "en").toLowerCase();
  if (language.startsWith("fr")) return "fr-CA";
  if (language.startsWith("es")) return "es-ES";
  if (language.startsWith("hi")) return "hi-IN";
  return "en-US";
}

async function hydrateMetadataMatch(request, response) {
  const body = await readRequestJson(request);
  const itemId = String(body.itemId ?? "").trim();
  const providerId = String(body.providerId ?? "").trim();
  const mediaType = String(body.mediaType ?? "movie").toLowerCase();
  if (!itemId || !providerId) return sendApiError(response, 400, "itemId and providerId are required");
  const provider = String(body.provider ?? "TMDB").toUpperCase();
  const isWrestlingItem = String(body.identity?.mediaType ?? "").toLowerCase() === "wrestling";

  try {
    let metadata;
    if (provider === "TWDB") {
      metadata = await hydrateTwdbMetadata(providerId);
      const match = { ...(body.match ?? {}), provider: "TWDB", providerId, hydratedAt: new Date().toISOString() };
      const override = await updateMetadataOverride(itemId, { match, metadata, identity: body.identity ?? null, matchedFilePaths: normalizeMatchedFilePaths(body.matchedFilePaths) });
      sendJson(response, { ok: true, itemId, match, metadata, override: withoutMetadataPayload(override) });
      return;
    }
    if (provider === "TVDB") {
      if (isWrestlingItem) return sendApiError(response, 400, "TVDB cannot replace wrestling metadata. Use TWDB for event data or TMDB for artwork.");
      metadata = await hydrateTvdbMetadata(providerId, mediaType, body);
      const match = { ...(body.match ?? {}), provider: "TVDB", providerId, hydratedAt: new Date().toISOString() };
      const override = await updateMetadataOverride(itemId, { match, metadata, identity: body.identity ?? null, matchedFilePaths: normalizeMatchedFilePaths(body.matchedFilePaths) });
      sendJson(response, { ok: true, itemId, match, metadata, override: withoutMetadataPayload(override) });
      return;
    }
    if (isWrestlingItem) {
      const details = await fetchTmdbJson(`/movie/${providerId}`);
      const artwork = {
        posterUrl: tmdbImage(details.poster_path, "w342"),
        backdropUrl: tmdbImage(details.backdrop_path, "w780"),
        artworkTmdbId: details.id,
        artworkProvider: "TMDB",
        hydratedAt: new Date().toISOString(),
      };
      const current = await readMetadataOverrides();
      const existing = current.items?.[itemId] ?? {};
      metadata = { ...(existing.metadata ?? {}), ...Object.fromEntries(Object.entries(artwork).filter(([, value]) => value != null)) };
      const artworkMatch = { ...(body.match ?? {}), provider: "TMDB", providerId, purpose: "artwork", hydratedAt: new Date().toISOString() };
      const override = await updateMetadataOverride(itemId, { ...existing, artworkMatch, metadata, identity: { ...(body.identity ?? {}), mediaType: "wrestling" }, matchedFilePaths: normalizeMatchedFilePaths(body.matchedFilePaths) });
      sendJson(response, { ok: true, itemId, match: existing.match ?? null, artworkMatch, metadata, override: withoutMetadataPayload(override), artworkOnly: true });
      return;
    }
    if (mediaType === "episode") {
      const seasonNumber = Number(body.seasonNumber);
      const episodeNumber = Number(body.episodeNumber);
      if (!Number.isInteger(seasonNumber) || seasonNumber < 0 || !Number.isInteger(episodeNumber) || episodeNumber < 1) return sendApiError(response, 400, "Episode season and episode numbers are required");
      const details = await fetchTmdbJson(`/tv/${providerId}/season/${seasonNumber}/episode/${episodeNumber}`, { append_to_response: "credits,external_ids" });
      metadata = normalizeTmdbEpisode(details, body.showId, seasonNumber, episodeNumber);
    } else if (mediaType === "tv") {
      const details = await fetchTmdbJson(`/tv/${providerId}`, { append_to_response: "aggregate_credits,content_ratings,external_ids" });
      const requestedSeasonNumbers = new Set((body.seasonNumbers ?? []).map(Number).filter((value) => Number.isInteger(value) && value >= 0));
      const seasonStubs = (details.seasons ?? []).filter((season) =>
        season.season_number >= 0 && (!requestedSeasonNumbers.size || requestedSeasonNumbers.has(season.season_number))
      );
      const seasons = [];
      for (let index = 0; index < seasonStubs.length; index += 4) {
        const batch = seasonStubs.slice(index, index + 4);
        seasons.push(...await Promise.all(batch.map(async (season) => {
          try {
            return await fetchTmdbJson(`/tv/${providerId}/season/${season.season_number}`, { append_to_response: "credits" });
          } catch {
            return season;
          }
        })));
      }
      metadata = normalizeTmdbShow(details, seasons, itemId);
    } else {
      const details = await fetchTmdbJson(`/movie/${providerId}`, { append_to_response: "credits,release_dates,external_ids" });
      metadata = normalizeTmdbMovie(details);
    }
    const match = { ...(body.match ?? {}), provider: "TMDB", providerId, hydratedAt: new Date().toISOString() };
    const override = await updateMetadataOverride(itemId, { match, metadata, identity: body.identity ?? null, matchedFilePaths: normalizeMatchedFilePaths(body.matchedFilePaths) });
    sendJson(response, { ok: true, itemId, match, metadata, override: withoutMetadataPayload(override) });
  } catch (error) {
    sendApiError(response, 502, `${provider} metadata hydration failed: ${error?.cause?.message ?? error.message ?? String(error)}`);
  }
}

function withoutMetadataPayload(override) {
  if (!override || typeof override !== "object") return override;
  const { metadata, ...compact } = override;
  return compact;
}

async function sendTmdbPersonFilmography(url, response) {
  const name = String(url.searchParams.get("name") ?? "").trim();
  const requestedId = String(url.searchParams.get("id") ?? "").trim();
  if (!name && !requestedId) return sendApiError(response, 400, "A TMDB person id or name is required");
  try {
    let personId = requestedId;
    if (!personId) {
      const search = await fetchTmdbJson("/search/person", { query: name });
      personId = String(search.results?.[0]?.id ?? "");
    }
    if (!personId) return sendApiError(response, 404, `No TMDB person found for ${name}`);
    const [person, credits] = await Promise.all([
      fetchTmdbJson(`/person/${personId}`, { append_to_response: "external_ids" }),
      fetchTmdbJson(`/person/${personId}/combined_credits`),
    ]);
    const works = (credits.crew ?? [])
      .filter((credit) => ["Directing", "Production"].includes(credit.department) || /director|producer/i.test(credit.job ?? ""))
      .map((credit) => ({
        tmdbId: credit.id,
        mediaType: credit.media_type,
        title: credit.title ?? credit.name ?? "Untitled",
        year: String(credit.release_date ?? credit.first_air_date ?? "").slice(0, 4) || null,
        job: credit.job ?? credit.department ?? "Crew",
        genreIds: credit.genre_ids ?? [],
        country: credit.origin_country?.join?.(", ") ?? null,
        posterUrl: tmdbImage(credit.poster_path, "w342"),
      }))
      .sort((a, b) => Number(a.year || 9999) - Number(b.year || 9999) || a.title.localeCompare(b.title));
    sendJson(response, {
      id: `tmdb-person-${person.id}`,
      tmdbId: person.id,
      name: person.name,
      biography: person.biography ?? "",
      birthday: person.birthday ?? null,
      deathday: person.deathday ?? null,
      birthplace: person.place_of_birth ?? null,
      profileUrl: tmdbImage(person.profile_path, "h632"),
      works,
    });
  } catch (error) {
    sendApiError(response, 502, `TMDB person lookup failed: ${error.message ?? String(error)}`);
  }
}

function normalizeMatchedFilePaths(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value ?? "").trim()).filter(Boolean))];
}

async function readTwdb() {
  return JSON.parse(await readFile(path.join(root, "src", "wrestling-reference.generated.json"), "utf8"));
}

function normalizeTwdbSearchText(value) {
  return String(value ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreTwdbRecord(record, wantedTitle, wantedYear) {
  const title = normalizeTwdbSearchText(record.title ?? record.name ?? record.displayTitle);
  const wanted = normalizeTwdbSearchText(wantedTitle);
  if (!title || !wanted) return 0;
  const wantedTokens = new Set(wanted.split(" ").filter((token) => token.length > 1));
  const titleTokens = new Set(title.split(" ").filter((token) => token.length > 1));
  const overlap = [...wantedTokens].filter((token) => titleTokens.has(token)).length / Math.max(1, wantedTokens.size);
  let score = title === wanted ? 100 : title.includes(wanted) || wanted.includes(title) ? 75 : overlap * 60;
  const year = Number(String(record.date ?? record.year ?? "").slice(0, 4));
  if (wantedYear && year === Number(wantedYear)) score += 24;
  else if (wantedYear && year && year !== Number(wantedYear)) score -= Math.min(18, Math.abs(year - Number(wantedYear)) * 3);
  score += Math.min(10, Number(record.matchCount ?? 0) * 0.5);
  return score;
}

async function searchTwdbMatch(title, year, response) {
  try {
    const db = await readTwdb();
    const records = [...(db.events ?? []), ...(db.episodes ?? [])];
    const results = records
      .map((record) => ({ record, score: scoreTwdbRecord(record, title, year) }))
      .filter(({ score }) => score >= 24)
      .sort((a, b) => b.score - a.score || String(b.record.date ?? "").localeCompare(String(a.record.date ?? "")))
      .slice(0, 30)
      .map(({ record, score }) => ({
        provider: "TWDB",
        providerId: record.id,
        mediaType: "wrestling",
        title: record.title ?? record.name ?? record.displayTitle,
        year: Number(String(record.date ?? record.year ?? "").slice(0, 4)) || null,
        language: "en",
        overview: record.summary ?? [record.eventType, record.venue, record.location ?? record.city].filter(Boolean).join(" / "),
        posterUrl: record.posterUrl ?? record.art?.posterUrl ?? null,
        backdropUrl: record.backdropUrl ?? record.art?.backdropUrl ?? null,
        score: Math.round(score),
        date: record.date ?? null,
        promotionId: record.promotionId ?? null,
        matchCount: record.matchCount ?? null,
      }));
    sendJson(response, { results });
  } catch (error) {
    sendApiError(response, 500, `TWDB search failed: ${error.message}`);
  }
}

async function hydrateTwdbMetadata(providerId) {
  const db = await readTwdb();
  const record = [...(db.events ?? []), ...(db.episodes ?? [])].find((entry) => entry.id === providerId);
  if (!record) throw new Error(`TWDB record ${providerId} was not found`);
  const matches = (db.matches ?? [])
    .filter((match) => match.eventId === providerId)
    .sort((a, b) => Number(a.order ?? 999) - Number(b.order ?? 999))
    .map((entry) => ({ ...entry, match: entry.match ?? entry.displayText ?? entry.raw ?? "Match" }));
  const metadata = {
    mediaType: "wrestling",
    twdbId: providerId,
    title: record.title ?? record.name ?? record.displayTitle,
    year: Number(String(record.date ?? record.year ?? "").slice(0, 4)) || null,
    releaseDate: record.date ?? null,
    date: record.date ?? null,
    summary: record.summary ?? "",
    eventType: record.eventType ?? null,
    promotionId: record.promotionId ?? null,
    promotion: record.promotion ?? record.promotionName ?? null,
    location: record.location ?? record.city ?? null,
    venue: record.venue ?? null,
    attendance: record.attendance ?? null,
    network: record.network ?? null,
    commentary: record.commentary ?? null,
    mainEvent: record.mainEvent ?? matches.at(-1)?.displayText ?? matches.at(-1)?.match ?? null,
    matches,
    matchCount: matches.length || record.matchCount || 0,
    inductions: record.inductions ?? [],
    inductionCount: record.inductions?.length ?? 0,
    posterUrl: record.posterUrl ?? record.art?.posterUrl ?? undefined,
    backdropUrl: record.backdropUrl ?? record.art?.backdropUrl ?? undefined,
    hydratedAt: new Date().toISOString(),
  };
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null));
}

async function getTvdbToken() {
  if (tvdbToken && Date.now() < tvdbTokenExpiresAt) return tvdbToken;
  if (!process.env.TVDB_API_KEY) throw new Error("TVDB_API_KEY is not configured");
  const body = { apikey: process.env.TVDB_API_KEY };
  if (process.env.TVDB_PIN) body.pin = process.env.TVDB_PIN;
  const response = await fetch("https://api4.thetvdb.com/v4/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`TVDB login failed: ${response.status}`);
  const payload = await response.json();
  tvdbToken = payload.data?.token;
  if (!tvdbToken) throw new Error("TVDB login did not return a token");
  tvdbTokenExpiresAt = Date.now() + 28 * 24 * 60 * 60 * 1000;
  return tvdbToken;
}

async function fetchTvdb(pathname, canRetry = true) {
  const token = await getTvdbToken();
  const response = await fetch(`https://api4.thetvdb.com/v4${pathname}`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  if (response.status === 401 && canRetry) { tvdbToken = null; tvdbTokenExpiresAt = 0; return fetchTvdb(pathname, false); }
  if (!response.ok) throw new Error(`TVDB returned ${response.status}`);
  return response.json();
}

async function searchTvdbMatch(title, mediaType, response) {
  if (!process.env.TVDB_API_KEY) return sendApiError(response, 503, "TVDB is not configured");
  try {
    const type = mediaType === "movie" ? "movie" : "series";
    const payload = await fetchTvdb(`/search?query=${encodeURIComponent(title)}&type=${type}&limit=20`);
    const results = (payload.data ?? []).map((item) => ({
      provider: "TVDB", providerId: item.tvdb_id ?? item.id, mediaType: type === "series" ? "tv" : "movie",
      title: item.name ?? title, year: item.year ?? null, language: item.primary_language ?? null,
      overview: item.overviews?.eng ?? item.overview ?? "", posterUrl: item.image_url ?? item.thumbnail ?? null,
      backdropUrl: null, score: item.score ?? null,
    }));
    sendJson(response, { results });
  } catch (error) {
    sendApiError(response, 502, error.message);
  }
}

async function hydrateTvdbMetadata(providerId, mediaType, body) {
  if (mediaType === "movie") {
    const payload = await fetchTvdb(`/movies/${encodeURIComponent(providerId)}/extended`);
    const item = payload.data ?? {};
    return { mediaType: "movie", title: item.name, year: item.year ?? null, summary: item.overview ?? "", runtime: item.runtime ?? null, genres: item.genres?.map((genre) => genre.name) ?? [], posterUrl: item.image ?? null, tvdbId: item.id, characters: item.characters ?? [], hydratedAt: new Date().toISOString() };
  }
  if (mediaType === "episode") {
    let page = 0;
    let matchedEpisode = null;
    while (!matchedEpisode && page < 25) {
      const listing = await fetchTvdb(`/series/${encodeURIComponent(providerId)}/episodes/default?page=${page}`);
      const episodes = listing.data?.episodes ?? listing.data ?? [];
      matchedEpisode = episodes.find((episode) => Number(episode.seasonNumber) === Number(body.seasonNumber) && Number(episode.number) === Number(body.episodeNumber));
      if (!listing.links?.next || !episodes.length) break;
      page += 1;
    }
    if (!matchedEpisode?.id) throw new Error(`TVDB episode S${body.seasonNumber}E${body.episodeNumber} was not found`);
    const payload = await fetchTvdb(`/episodes/${matchedEpisode.id}/extended`);
    const item = payload.data ?? matchedEpisode;
    return { id: body.itemId ?? null, mediaType: "episode", showId: body.showId ?? null, seasonNumber: body.seasonNumber, episodeNumber: body.episodeNumber, title: item.name ?? matchedEpisode.name, summary: item.overview ?? "", overview: item.overview ?? "", airDate: item.aired ?? null, runtime: item.runtime ?? null, stillUrl: item.image ?? null, tvdbId: item.id, hydratedAt: new Date().toISOString() };
  }
  const payload = await fetchTvdb(`/series/${encodeURIComponent(providerId)}/extended?meta=episodes`);
  const item = payload.data ?? {};
  return { mediaType: "tv", title: item.name, year: item.year ?? null, summary: item.overview ?? "", overview: item.overview ?? "", averageRuntime: item.averageRuntime ?? null, genres: item.genres?.map((genre) => genre.name) ?? [], posterUrl: item.image ?? null, tvdbId: item.id, cast: (item.characters ?? []).filter((entry) => entry.peopleName).map((entry) => ({ id: `tvdb-person-${entry.peopleId}`, name: entry.peopleName, role: entry.name ?? entry.characterName ?? "Cast", imageUrl: entry.image ?? null })), hydratedAt: new Date().toISOString() };
}

async function fetchTmdbJson(pathname, parameters = {}) {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;
  if (!token && !apiKey) throw new Error("TMDB credentials are not configured");
  const target = new URL(`https://api.themoviedb.org/3${pathname}`);
  Object.entries(parameters).forEach(([key, value]) => value != null && target.searchParams.set(key, value));
  target.searchParams.set("language", "en-US");
  if (!token && apiKey) target.searchParams.set("api_key", apiKey);
  const headers = token ? { accept: "application/json", authorization: `Bearer ${token}` } : { accept: "application/json" };
  const upstream = await fetch(target, { headers });
  if (!upstream.ok) throw new Error(`TMDB returned ${upstream.status} for ${pathname}`);
  return upstream.json();
}

function normalizeTmdbCast(cast = []) {
  return cast.slice(0, 40).map((person) => ({
    id: `tmdb-person-${person.id}`,
    tmdbId: person.id,
    name: person.name,
    role: person.character ?? person.roles?.[0]?.character ?? "Cast",
    character: person.character ?? person.roles?.[0]?.character ?? "Cast",
    imageUrl: person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null,
    profileUrl: person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null,
  }));
}

function normalizeTmdbMovie(details) {
  const director = details.credits?.crew?.find((person) => person.job === "Director");
  const certification = details.release_dates?.results?.find((entry) => entry.iso_3166_1 === "US")?.release_dates?.find((release) => release.certification)?.certification;
  return {
    mediaType: "movie", title: details.title, year: Number(String(details.release_date ?? "").slice(0, 4)) || null,
    summary: details.overview ?? "", tagline: details.tagline ?? "", releaseDate: details.release_date ?? null,
    runtime: details.runtime ?? null, rating: certification || "NR", director: director?.name ?? null,
    country: details.production_countries?.map((country) => country.name).join(", ") || null,
    language: details.original_language?.toUpperCase() ?? null, genres: details.genres?.map((genre) => genre.name) ?? [],
    ratings: { tmdb: details.vote_average ?? null }, tmdbId: details.id, imdbId: details.external_ids?.imdb_id ?? null,
    posterUrl: tmdbImage(details.poster_path, "w342"), backdropUrl: tmdbImage(details.backdrop_path, "w780"),
    cast: normalizeTmdbCast(details.credits?.cast), hydratedAt: new Date().toISOString(),
  };
}

function normalizeTmdbShow(details, hydratedSeasons = [], showId = null) {
  const certification = details.content_ratings?.results?.find((entry) => entry.iso_3166_1 === "US")?.rating ?? details.content_ratings?.results?.find((entry) => entry.rating)?.rating ?? "NR";
  return {
    mediaType: "tv", title: details.name, year: Number(String(details.first_air_date ?? "").slice(0, 4)) || null,
    overview: details.overview ?? "", summary: details.overview ?? "", tagline: details.tagline ?? "", firstAirDate: details.first_air_date ?? null,
    statusLabel: details.status ?? null, rating: certification, averageRuntime: details.episode_run_time?.[0] ?? null,
    genres: details.genres?.map((genre) => genre.name) ?? [], ratings: { tmdb: details.vote_average ?? null },
    tmdbId: details.id, externalIds: details.external_ids ?? {}, posterUrl: tmdbImage(details.poster_path, "w342"), backdropUrl: tmdbImage(details.backdrop_path, "w780"),
    cast: normalizeTmdbCast(details.aggregate_credits?.cast),
    seasons: hydratedSeasons.filter((season) => season.season_number >= 0).map((season) => ({
      seasonNumber: season.season_number, title: season.season_number === 0 ? tvSpecialsOverrides.shows?.[showId]?.seasonTitle || season.name || "Specials" : season.name || `Season ${season.season_number}`, overview: season.overview ?? "",
      airDate: season.air_date ?? null, episodeCount: season.episodes?.length ?? season.episode_count ?? null,
      posterUrl: tmdbImage(season.poster_path, "w342"), cast: normalizeTmdbCast(season.credits?.cast),
      episodes: season.season_number === 0 && tvSpecialsOverrides.shows?.[showId]?.episodes?.length
        ? buildAggregateTmdbSpecials(showId, season.episodes ?? [], tvSpecialsOverrides.shows[showId].episodes, details)
        : (season.episodes ?? []).map((episode) => normalizeTmdbEpisode(episode, showId, season.season_number, episode.episode_number)),
    })), hydratedAt: new Date().toISOString(),
  };
}

function buildAggregateTmdbSpecials(showId, tmdbEpisodes, overrides, details) {
  const byNumber = new Map(tmdbEpisodes.map((episode) => [Number(episode.episode_number), episode]));
  return overrides.map((override) => {
    const sources = (override.tmdbEpisodes ?? []).map((number) => byNumber.get(Number(number))).filter(Boolean);
    const first = sources[0] ?? null;
    const runtimes = sources.map((episode) => Number(episode.runtime)).filter(Number.isFinite);
    const episodeNumber = Number(override.episodeNumber);
    return {
      id: showId ? `${showId}-s00-e${String(episodeNumber).padStart(2, "0")}` : null,
      mediaType: "episode", showId: showId ?? null, seasonNumber: 0, episodeNumber,
      title: override.title || first?.name || `Special ${episodeNumber}`,
      summary: override.overview ?? sources.map((episode) => episode.overview).filter(Boolean).join(" "),
      overview: override.overview ?? sources.map((episode) => episode.overview).filter(Boolean).join(" "),
      airDate: override.airDate ?? first?.air_date ?? null,
      runtime: runtimes.length ? runtimes.reduce((total, runtime) => total + runtime, 0) : details.episode_run_time?.[0] ?? null,
      stillUrl: tmdbImage(first?.still_path, "w500"), aggregate: sources.length > 1,
      tmdbEpisodeNumbers: sources.map((episode) => episode.episode_number), hydratedAt: new Date().toISOString(),
    };
  });
}

function normalizeTmdbEpisode(details, showId, seasonNumber, episodeNumber) {
  return {
    id: showId ? `${showId}-s${String(seasonNumber).padStart(2, "0")}-e${String(episodeNumber).padStart(2, "0")}` : null,
    mediaType: "episode", showId: showId ?? null, seasonNumber, episodeNumber,
    title: details.name || `Episode ${episodeNumber}`, summary: details.overview ?? "", overview: details.overview ?? "",
    airDate: details.air_date ?? null, runtime: details.runtime ?? null, ratings: { tmdb: details.vote_average ?? null },
    stillUrl: tmdbImage(details.still_path, "w500"), cast: normalizeTmdbCast(details.credits?.cast ?? details.guest_stars),
    tmdbId: details.id, externalIds: details.external_ids ?? {}, hydratedAt: new Date().toISOString(),
  };
}

function tmdbImage(imagePath, size) {
  return imagePath ? `https://image.tmdb.org/t/p/${size}${imagePath}` : null;
}
async function sendMediaIndex(response) {
  const metadata = JSON.parse(await readFile(path.join(root, "src", "metadata.generated.json"), "utf8"));
  sendJson(response, {
    generatedAt: metadata.generatedAt,
    stats: metadata.stats,
    mediaRoots: getAllowedMediaRoots(),
    records: (metadata.records ?? []).filter((record) => record.files?.length),
  });
}

async function streamMedia(url, request, response) {
  const requestedPath = url.searchParams.get("path");
  if (!requestedPath) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Missing media path");
    return;
  }

  const filePath = resolveLibraryMediaPath(requestedPath);
  if (!isAllowedMediaPath(filePath)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Media path is outside configured roots");
    return;
  }

  const fileStats = await stat(filePath).catch(() => null);
  if (!fileStats?.isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Media file not found");
    return;
  }

  const range = request.headers.range;
  const headers = {
    "content-type": contentType(filePath),
    "accept-ranges": "bytes",
    "cache-control": "no-store",
  };

  if (!range) {
    response.writeHead(200, { ...headers, "content-length": fileStats.size });
    createReadStream(filePath, { highWaterMark: 1024 * 1024 }).pipe(response);
    return;
  }

  const match = range.match(/bytes=(\d*)-(\d*)/);
  if (!match) {
    response.writeHead(416, { "content-range": `bytes */${fileStats.size}` });
    response.end();
    return;
  }

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : fileStats.size - 1;
  if (start >= fileStats.size || end >= fileStats.size || start > end) {
    response.writeHead(416, { "content-range": `bytes */${fileStats.size}` });
    response.end();
    return;
  }

  response.writeHead(206, {
    ...headers,
    "content-length": end - start + 1,
    "content-range": `bytes ${start}-${end}/${fileStats.size}`,
  });
  createReadStream(filePath, { start, end, highWaterMark: 1024 * 1024 }).pipe(response);
}

async function streamPlayback(url, request, response) {
  const requestedPath = url.searchParams.get("path");
  if (!requestedPath) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Missing media path");
    return;
  }

  const filePath = resolveLibraryMediaPath(requestedPath);
  if (!isAllowedMediaPath(filePath)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Media path is outside configured roots");
    return;
  }

  const jellyfinItem = await findJellyfinItemByPath(filePath).catch(() => null);
  if (jellyfinItem?.Id) {
    if (url.searchParams.get("mode") === "hls") {
      const target = await getJellyfinHlsPlaybackUrl(jellyfinItem.Id, url);
      await proxyJellyfinHlsManifest(target, response);
      return;
    }

    const target = new URL(`${jellyfin.url}/Videos/${jellyfinItem.Id}/stream.mp4`);
    target.searchParams.set("api_key", jellyfin.apiKey);
    target.searchParams.set("Static", "true");
    const startSeconds = Number(url.searchParams.get("start") ?? 0);
    const audioStreamIndex = url.searchParams.get("audioStreamIndex");
    const subtitleStreamIndex = url.searchParams.get("subtitleStreamIndex");
    const videoStreamIndex = url.searchParams.get("videoStreamIndex");
    if (Number.isFinite(startSeconds) && startSeconds > 0) target.searchParams.set("StartTimeTicks", String(Math.floor(startSeconds * 10000000)));
    if (audioStreamIndex && audioStreamIndex !== "default") target.searchParams.set("AudioStreamIndex", audioStreamIndex);
    if (videoStreamIndex && videoStreamIndex !== "default") target.searchParams.set("VideoStreamIndex", videoStreamIndex);
    if (subtitleStreamIndex && subtitleStreamIndex !== "off") target.searchParams.set("SubtitleStreamIndex", subtitleStreamIndex);
    if (subtitleStreamIndex === "off") target.searchParams.set("SubtitleStreamIndex", "-1");
    response.writeHead(302, { location: target.toString(), "cache-control": "no-store" });
    response.end();
    return;
  }

  if (url.searchParams.get("mode") === "local-transcode") {
    await streamLocalTranscode(filePath, url, request, response);
    return;
  }

  await streamMedia(url, request, response);
}

async function sendPlaybackInfo(url, response) {
  const requestedPath = url.searchParams.get("path");
  if (!requestedPath) return sendApiError(response, 400, "Missing media path");
  const filePath = resolveLibraryMediaPath(requestedPath);
  if (!isAllowedMediaPath(filePath) || !(await stat(filePath).catch(() => null))?.isFile()) {
    return sendApiError(response, 404, "A valid media file was not found");
  }

  const probePromise = probePlaybackMedia(filePath);
  const [externalSubtitles, jellyfinItem] = await Promise.all([
    findExternalSubtitles(filePath),
    findJellyfinItemByPath(filePath).catch(() => null),
  ]);
  const probe = url.searchParams.get("deep") === "true"
    ? await probePromise
    : await Promise.race([probePromise, delay(650).then(() => null)]);
  const streams = normalizePlaybackStreams(probe);
  streams.subtitles.push(...externalSubtitles);
  const directPlayable = isBrowserDirectPlayable(filePath, streams);
  const ffmpegAvailable = Boolean((await stat(ffmpegPath).catch(() => null))?.isFile());
  const transport = jellyfinItem?.Id ? "jellyfin-hls" : directPlayable || !ffmpegAvailable ? "direct" : "local-transcode";
  sendJson(response, {
    ok: true,
    path: requestedPath,
    resolvedPath: filePath,
    durationSeconds: Number(probe?.format?.duration) || null,
    streams,
    transport,
    jellyfin: Boolean(jellyfinItem?.Id),
    ffmpeg: ffmpegAvailable,
  });
}

async function probePlaybackMedia(filePath) {
  const fileStats = await stat(filePath).catch(() => null);
  const cacheKey = `${filePath}|${fileStats?.size ?? 0}|${fileStats?.mtimeMs ?? 0}`;
  if (playbackProbeCache.has(cacheKey)) return playbackProbeCache.get(cacheKey);
  if (playbackProbePending.has(cacheKey)) return playbackProbePending.get(cacheKey);
  if (!(await stat(ffprobePath).catch(() => null))?.isFile()) return { streams: [], format: {} };
  const pending = runProcess(ffprobePath, [
      "-v", "error",
      "-show_entries", "format=duration:stream=index,codec_type,codec_name,channels,channel_layout,width,height:stream_tags=language,title",
      "-of", "json",
      filePath,
    ], { timeoutMs: 20_000 })
    .then((result) => {
      let probe = { streams: [], format: {} };
      if (result.ok) {
        try { probe = JSON.parse(result.stdout || "{}"); } catch {}
      }
      if (playbackProbeCache.size >= 80) playbackProbeCache.delete(playbackProbeCache.keys().next().value);
      playbackProbeCache.set(cacheKey, probe);
      return probe;
    })
    .finally(() => playbackProbePending.delete(cacheKey));
  playbackProbePending.set(cacheKey, pending);
  return pending;
}

function normalizePlaybackStreams(probe) {
  const streams = probe?.streams ?? [];
  return {
    video: streams.filter((stream) => stream.codec_type === "video").map((stream, index) => ({
      index: stream.index,
      codec: stream.codec_name ?? null,
      width: stream.width ?? null,
      height: stream.height ?? null,
      label: [stream.height ? `${stream.height}p` : null, stream.codec_name?.toUpperCase()].filter(Boolean).join(" ") || `Video ${index + 1}`,
    })),
    audio: streams.filter((stream) => stream.codec_type === "audio").map((stream, index) => ({
      index: stream.index,
      codec: stream.codec_name ?? null,
      channels: stream.channels ?? null,
      language: stream.tags?.language ?? null,
      label: [stream.tags?.title, stream.tags?.language?.toUpperCase(), stream.codec_name?.toUpperCase(), stream.channel_layout].filter(Boolean).join(" - ") || `Audio ${index + 1}`,
    })),
    subtitles: streams.filter((stream) => stream.codec_type === "subtitle").map((stream, index) => ({
      index: stream.index,
      codec: stream.codec_name ?? null,
      language: stream.tags?.language ?? null,
      label: [stream.tags?.title, stream.tags?.language?.toUpperCase(), stream.codec_name?.toUpperCase()].filter(Boolean).join(" - ") || `Embedded subtitle ${index + 1}`,
      source: "embedded",
    })),
  };
}

async function findExternalSubtitles(filePath) {
  const directory = path.dirname(filePath);
  const mediaStem = normalizeSubtitleStem(path.basename(filePath, path.extname(filePath)));
  const directories = [directory];
  for (const name of ["Subs", "Subtitles", "subs", "subtitles"]) {
    const candidate = path.join(directory, name);
    if ((await stat(candidate).catch(() => null))?.isDirectory()) directories.push(candidate);
  }
  const matches = [];
  for (const subtitleDirectory of [...new Set(directories)]) {
    const entries = await readdir(subtitleDirectory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(srt|vtt)$/i.test(entry.name)) continue;
      const subtitleStem = normalizeSubtitleStem(path.basename(entry.name, path.extname(entry.name)));
      if (subtitleDirectory === directory && !subtitleStem.includes(mediaStem) && !mediaStem.includes(subtitleStem)) continue;
      const subtitlePath = path.join(subtitleDirectory, entry.name);
      const language = inferSubtitleLanguage(entry.name);
      matches.push({
        index: `external:${matches.length}`,
        label: [language?.toUpperCase(), path.extname(entry.name).slice(1).toUpperCase(), "External"].filter(Boolean).join(" - "),
        language,
        codec: path.extname(entry.name).slice(1).toLowerCase(),
        source: "external",
        externalPath: subtitlePath,
      });
    }
  }
  return matches;
}

async function uploadSubtitle(request, response) {
  const mediaPath = resolveLibraryMediaPath(decodeURIComponent(String(request.headers["x-media-path"] ?? "")));
  const requestedName = decodeURIComponent(String(request.headers["x-subtitle-name"] ?? "subtitle.srt"));
  const extension = path.extname(requestedName).toLowerCase();
  if (!isAllowedMediaPath(mediaPath) || !(await stat(mediaPath).catch(() => null))?.isFile()) return sendApiError(response, 400, "Media file not found");
  if (![".srt", ".vtt"].includes(extension)) return sendApiError(response, 400, "Choose an SRT or VTT subtitle file");
  const body = await readRequestBuffer(request, 10_000_000);
  if (!body.length) return sendApiError(response, 400, "The subtitle file was empty");
  const mediaStem = path.basename(mediaPath, path.extname(mediaPath));
  const language = inferSubtitleLanguage(requestedName) || "en";
  const outputPath = path.join(path.dirname(mediaPath), `${mediaStem}.${language}.manual${extension}`);
  await writeFile(outputPath, body);
  playbackProbeCache.delete(mediaPath);
  sendJson(response, { ok: true, subtitlePath: outputPath });
}

async function listFolderSubtitles(url, response) {
  const mediaPath = resolveLibraryMediaPath(url.searchParams.get("path"));
  if (!isAllowedMediaPath(mediaPath) || !(await stat(mediaPath).catch(() => null))?.isFile()) {
    return sendApiError(response, 400, "Media file not found");
  }
  const directory = path.dirname(mediaPath);
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const subtitles = entries
    .filter((entry) => entry.isFile() && /\.(srt|vtt)$/i.test(entry.name))
    .map((entry) => ({ name: entry.name, path: path.join(directory, entry.name) }))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }));
  sendJson(response, { ok: true, directory, subtitles });
}

function openSubtitlesHeaders() {
  return {
    "Api-Key": openSubtitles.apiKey,
    "User-Agent": openSubtitles.userAgent,
    ...(openSubtitles.token ? { Authorization: `Bearer ${openSubtitles.token}` } : {}),
  };
}

async function searchOpenSubtitles(url, response) {
  if (!openSubtitles.apiKey) return sendApiError(response, 503, "OpenSubtitles is not configured. Add OPENSUBTITLES_API_KEY to .env");
  const query = String(url.searchParams.get("query") ?? "").trim();
  if (!query) return sendApiError(response, 400, "A title is required");
  const target = new URL("https://api.opensubtitles.com/api/v1/subtitles");
  target.searchParams.set("query", query);
  target.searchParams.set("languages", String(url.searchParams.get("languages") ?? "en"));
  ["type", "tmdb_id", "imdb_id", "year", "season_number", "episode_number"].forEach((name) => {
    const value = String(url.searchParams.get(name) ?? "").trim();
    if (value) target.searchParams.set(name, value);
  });
  target.searchParams.set("order_by", "download_count");
  target.searchParams.set("order_direction", "desc");
  const upstream = await fetch(target, { headers: openSubtitlesHeaders() });
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return sendApiError(response, upstream.status, payload.message || "OpenSubtitles search failed");
  const results = (payload.data ?? []).flatMap((entry) => {
    const attributes = entry.attributes ?? {};
    return (attributes.files ?? []).slice(0, 1).map((file) => ({
      fileId: file.file_id,
      fileName: file.file_name,
      language: attributes.language,
      release: attributes.release || attributes.feature_details?.title || file.file_name,
      hearingImpaired: Boolean(attributes.hearing_impaired),
      downloadCount: attributes.download_count ?? 0,
      seasonNumber: attributes.feature_details?.season_number ?? null,
      episodeNumber: attributes.feature_details?.episode_number ?? null,
      featureTitle: attributes.feature_details?.title ?? null,
      featureYear: attributes.feature_details?.year ?? null,
    }));
  }).filter((entry) => entry.fileId)
    .filter((entry) => {
      const requestedSeason = Number(url.searchParams.get("season_number"));
      const requestedEpisode = Number(url.searchParams.get("episode_number"));
      if (!requestedSeason || !requestedEpisode) return true;
      if (entry.seasonNumber == null || entry.episodeNumber == null) return true;
      return Number(entry.seasonNumber) === requestedSeason && Number(entry.episodeNumber) === requestedEpisode;
    });
  sendJson(response, { ok: true, results });
}

async function downloadOpenSubtitle(request, response) {
  if (!openSubtitles.apiKey) return sendApiError(response, 503, "OpenSubtitles is not configured. Add OPENSUBTITLES_API_KEY to .env");
  const body = await readRequestJson(request);
  const mediaPath = resolveLibraryMediaPath(body.mediaPath);
  if (!isAllowedMediaPath(mediaPath) || !(await stat(mediaPath).catch(() => null))?.isFile()) return sendApiError(response, 400, "Media file not found");
  const upstream = await fetch("https://api.opensubtitles.com/api/v1/download", {
    method: "POST",
    headers: { ...openSubtitlesHeaders(), "content-type": "application/json" },
    body: JSON.stringify({ file_id: Number(body.fileId), sub_format: "srt" }),
  });
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok || !payload.link) return sendApiError(response, upstream.status || 502, payload.message || "OpenSubtitles download failed");
  const fileResponse = await fetch(payload.link);
  if (!fileResponse.ok) return sendApiError(response, fileResponse.status, "Subtitle file download failed");
  const language = String(body.language ?? "en").toLowerCase().replace(/[^a-z0-9-]/g, "") || "en";
  const outputPath = path.join(path.dirname(mediaPath), `${path.basename(mediaPath, path.extname(mediaPath))}.${language}.opensubtitles.srt`);
  await writeFile(outputPath, Buffer.from(await fileResponse.arrayBuffer()));
  playbackProbeCache.delete(mediaPath);
  sendJson(response, { ok: true, subtitlePath: outputPath });
}

function normalizeSubtitleStem(value) {
  return String(value).toLowerCase().replace(/\b(eng|en|english|forced|sdh|cc)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function inferSubtitleLanguage(fileName) {
  const match = String(fileName).match(/(?:^|[. _-])(eng|en|english|spa|es|fre|fra|fr|ger|de)(?:[. _-]|$)/i);
  return match?.[1]?.toLowerCase() ?? "en";
}

function isBrowserDirectPlayable(filePath, streams) {
  if (!/\.(mp4|m4v|mov|webm)$/i.test(filePath)) return false;
  const videoCodec = String(streams.video?.[0]?.codec ?? "").toLowerCase();
  const audioCodecs = (streams.audio ?? []).map((stream) => String(stream.codec ?? "").toLowerCase()).filter(Boolean);
  const videoOkay = !videoCodec || ["h264", "av1", "vp8", "vp9"].includes(videoCodec);
  const audioOkay = !audioCodecs.length || audioCodecs.some((codec) => ["aac", "mp3", "opus", "vorbis"].includes(codec));
  return videoOkay && audioOkay;
}

async function streamLocalTranscode(filePath, url, request, response) {
  if (!(await stat(ffmpegPath).catch(() => null))?.isFile()) {
    await streamMedia(url, request, response);
    return;
  }
  // Do not wait for a separate ffprobe pass here. FFmpeg must inspect the same
  // file itself, and serial probing added 10-20 seconds to cold playback.
  const requestedVideo = url.searchParams.get("videoStreamIndex");
  const requestedAudio = url.searchParams.get("audioStreamIndex");
  const videoMap = requestedVideo && requestedVideo !== "default" && /^\d+$/.test(requestedVideo) ? `0:${requestedVideo}` : "0:v:0";
  const audioMap = requestedAudio && requestedAudio !== "default" && /^\d+$/.test(requestedAudio) ? `0:${requestedAudio}` : "0:a:0?";
  const startSeconds = Math.max(0, Number(url.searchParams.get("start") ?? 0) || 0);
  const args = ["-hide_banner", "-loglevel", "error", "-fflags", "+genpts+discardcorrupt", "-err_detect", "ignore_err"];
  if (startSeconds > 0) args.push("-ss", String(startSeconds));
  args.push("-i", filePath, "-map", videoMap, "-map", audioMap, "-sn");
  // A 90 kHz track clock avoids the roughly 35-minute signed 32-bit timestamp
  // rollover that can make long-running fragmented MP4 playback jump to zero.
  args.push("-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-crf", "24", "-pix_fmt", "yuv420p", "-vf", "setpts=PTS-STARTPTS,scale=min(1280\\,iw):-2:flags=fast_bilinear", "-video_track_timescale", "90000", "-g", "24", "-keyint_min", "24", "-sc_threshold", "0");
  args.push("-c:a", "aac", "-af", "asetpts=PTS-STARTPTS", "-ac", "2", "-b:a", "160k", "-max_muxing_queue_size", "2048", "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-frag_duration", "500000", "-flush_packets", "1", "-f", "mp4", "pipe:1");

  response.writeHead(200, {
    "content-type": "video/mp4",
    "cache-control": "no-store",
    "accept-ranges": "none",
  });
  const child = spawn(ffmpegPath, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let outputBytes = 0;
  let stderr = "";
  child.stdout.on("data", (chunk) => { outputBytes += chunk.length; });
  child.stdout.pipe(response);
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
  const stop = () => { if (!child.killed) child.kill(); };
  request.on("aborted", stop);
  response.on("close", stop);
  child.on("error", () => { if (!response.writableEnded) response.end(); });
  child.on("close", (code) => {
    if (code && outputBytes === 0) console.warn(`Playback conversion failed before output for ${filePath}: ${stderr || `ffmpeg exited ${code}`}`);
  });
}

async function proxyJellyfinHls(url, response) {
  const target = url.searchParams.get("url");
  if (!target) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Missing HLS proxy URL");
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Invalid HLS proxy URL");
    return;
  }

  if (!isAllowedJellyfinProxyUrl(targetUrl)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("HLS proxy URL is outside Jellyfin");
    return;
  }

  await proxyJellyfinResource(targetUrl, response);
}

async function proxyJellyfinHlsManifest(target, response) {
  const targetUrl = new URL(target, jellyfin.url);
  if (!targetUrl.searchParams.has("api_key")) targetUrl.searchParams.set("api_key", jellyfin.apiKey);
  await proxyJellyfinResource(targetUrl, response);
}

async function proxyJellyfinResource(targetUrl, response) {
  if (!targetUrl.searchParams.has("api_key")) targetUrl.searchParams.set("api_key", jellyfin.apiKey);
  const upstream = await fetch(targetUrl, { headers: { "X-Emby-Token": jellyfin.apiKey } });
  const contentTypeHeader = upstream.headers.get("content-type") ?? contentType(targetUrl.pathname);
  if (!upstream.ok) {
    response.writeHead(upstream.status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    response.end(`Jellyfin HLS request failed: ${upstream.status}`);
    return;
  }

  if (isHlsPlaylist(targetUrl, contentTypeHeader)) {
    const body = await upstream.text();
    response.writeHead(200, {
      "content-type": "application/vnd.apple.mpegurl; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(rewriteHlsManifest(body, targetUrl));
    return;
  }

  const buffer = Buffer.from(await upstream.arrayBuffer());
  response.writeHead(200, {
    "content-type": contentTypeHeader,
    "content-length": buffer.length,
    "cache-control": "no-store",
  });
  response.end(buffer);
}

function rewriteHlsManifest(body, baseUrl) {
  return body
    .split(/\r?\n/)
    .map((line) => rewriteHlsManifestLine(line, baseUrl))
    .join("\n");
}

function rewriteHlsManifestLine(line, baseUrl) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") && !trimmed.includes("URI=\"")) return line;

  if (trimmed.startsWith("#") && trimmed.includes("URI=\"")) {
    return line.replace(/URI="([^"]+)"/g, (match, value) => `URI="${proxyJellyfinHlsUrl(new URL(value, baseUrl))}"`);
  }

  return proxyJellyfinHlsUrl(new URL(trimmed, baseUrl));
}

function proxyJellyfinHlsUrl(targetUrl) {
  const publicUrl = new URL(targetUrl);
  publicUrl.searchParams.delete("ApiKey");
  publicUrl.searchParams.delete("api_key");
  return `/api/jellyfin/hls-proxy?url=${encodeURIComponent(publicUrl.toString())}`;
}

function isAllowedJellyfinProxyUrl(targetUrl) {
  if (!jellyfin.url) return false;
  const jellyfinOrigin = new URL(jellyfin.url).origin;
  return targetUrl.origin === jellyfinOrigin;
}

function isHlsPlaylist(targetUrl, contentTypeHeader) {
  const extension = path.extname(targetUrl.pathname).toLowerCase();
  return extension === ".m3u8" || /mpegurl|m3u8/i.test(contentTypeHeader ?? "");
}
async function streamSubtitle(url, response) {
  const requestedPath = url.searchParams.get("path");
  const subtitleStreamIndex = url.searchParams.get("subtitleStreamIndex");
  if (!requestedPath || !subtitleStreamIndex || subtitleStreamIndex === "off") {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Missing subtitle request parameters");
    return;
  }

  const filePath = resolveLibraryMediaPath(requestedPath);
  if (!isAllowedMediaPath(filePath)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Media path is outside configured roots");
    return;
  }

  const subtitlePathValue = url.searchParams.get("subtitlePath");
  if (subtitleStreamIndex.startsWith("external:") && subtitlePathValue) {
    const subtitlePath = resolveLibraryMediaPath(subtitlePathValue);
    if (!isAllowedMediaPath(subtitlePath) || !(await stat(subtitlePath).catch(() => null))?.isFile()) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("External subtitle file not found");
      return;
    }
    const body = (await readFile(subtitlePath, "utf8")).replace(/^\uFEFF/, "");
    const vtt = path.extname(subtitlePath).toLowerCase() === ".vtt"
      ? body
      : `WEBVTT\n\n${body.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")}`;
    response.writeHead(200, { "content-type": "text/vtt; charset=utf-8", "cache-control": "no-store" });
    response.end(vtt);
    return;
  }

  const jellyfinItem = await findJellyfinItemByPath(filePath).catch(() => null);
  if (!jellyfinItem?.Id) {
    if (!(await stat(ffmpegPath).catch(() => null))?.isFile()) {
      response.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
      response.end("Embedded subtitle extraction is unavailable");
      return;
    }
    const result = await getEmbeddedSubtitleVtt(filePath, subtitleStreamIndex);
    if (!result.ok) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(result.error || "Embedded subtitle extraction failed");
      return;
    }
    response.writeHead(200, { "content-type": "text/vtt; charset=utf-8", "cache-control": "private, max-age=86400" });
    response.end(result.vtt);
    return;
  }

  const subtitleUrl = new URL(`${jellyfin.url}/Videos/${jellyfinItem.Id}/${jellyfinItem.Id}/Subtitles/${subtitleStreamIndex}/Stream.vtt`);
  subtitleUrl.searchParams.set("api_key", jellyfin.apiKey);
  const subtitleResponse = await fetch(subtitleUrl);
  if (!subtitleResponse.ok) {
    response.writeHead(subtitleResponse.status, { "content-type": "text/plain; charset=utf-8" });
    response.end(`Jellyfin subtitle request failed: ${subtitleResponse.status}`);
    return;
  }

  const body = await subtitleResponse.text();
  response.writeHead(200, {
    "content-type": "text/vtt; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(body.replace(/^\uFEFF/, ""));
}

async function getEmbeddedSubtitleVtt(filePath, subtitleStreamIndex) {
  const fileStats = await stat(filePath).catch(() => null);
  if (!fileStats?.isFile()) return { ok: false, error: "Media file not found" };
  const identity = `${filePath}|${fileStats.size}|${fileStats.mtimeMs}|${subtitleStreamIndex}`;
  const cacheKey = createHash("sha256").update(identity).digest("hex");
  if (subtitleCache.has(cacheKey)) return { ok: true, vtt: subtitleCache.get(cacheKey) };
  if (subtitleCachePending.has(cacheKey)) return subtitleCachePending.get(cacheKey);

  const pending = (async () => {
    const cachePath = path.join(subtitleCacheDirectory, `${cacheKey}.vtt`);
    const cached = await readFile(cachePath, "utf8").catch(() => null);
    if (cached?.startsWith("WEBVTT")) {
      rememberSubtitle(cacheKey, cached);
      return { ok: true, vtt: cached };
    }
    const result = await runProcess(ffmpegPath, ["-v", "error", "-i", filePath, "-map", `0:${subtitleStreamIndex}`, "-f", "webvtt", "pipe:1"]);
    if (!result.ok) return { ok: false, error: result.error || "Embedded subtitle extraction failed" };
    const vtt = result.stdout.replace(/^\uFEFF/, "");
    if (!vtt.startsWith("WEBVTT")) return { ok: false, error: "Subtitle track could not be converted to WebVTT" };
    rememberSubtitle(cacheKey, vtt);
    await mkdir(subtitleCacheDirectory, { recursive: true });
    await writeFile(cachePath, vtt, "utf8").catch(() => {});
    return { ok: true, vtt };
  })().finally(() => subtitleCachePending.delete(cacheKey));

  subtitleCachePending.set(cacheKey, pending);
  return pending;
}

function rememberSubtitle(cacheKey, vtt) {
  if (subtitleCache.size >= 64) subtitleCache.delete(subtitleCache.keys().next().value);
  subtitleCache.set(cacheKey, vtt);
}

async function sendJellyfinStatus(response) {
  const configured = Boolean(jellyfin.url && jellyfin.apiKey);
  if (!configured) {
    sendJson(response, { configured: false, reachable: false, items: 0 });
    return;
  }

  const items = await getJellyfinItems().catch(() => null);
  sendJson(response, {
    configured,
    reachable: Boolean(items),
    items: items?.length ?? 0,
    url: jellyfin.url,
  });
}

async function findJellyfinItemByPath(filePath) {
  if (!jellyfin.url || !jellyfin.apiKey) return null;
  const normalized = normalizeFilesystemPath(filePath);
  const items = await getJellyfinItems();
  return items.find((item) => normalizeFilesystemPath(item.Path) === normalized) ?? null;
}

async function getJellyfinHlsPlaybackUrl(itemId, requestUrl) {
  const userId = await getJellyfinUserId();
  const playbackUrl = new URL(`${jellyfin.url}/Items/${itemId}/PlaybackInfo`);
  playbackUrl.searchParams.set("UserId", userId);
  const startSeconds = Number(requestUrl.searchParams.get("start") ?? 0);
  playbackUrl.searchParams.set("StartTimeTicks", Number.isFinite(startSeconds) && startSeconds > 0 ? String(Math.floor(startSeconds * 10000000)) : "0");
  playbackUrl.searchParams.set("IsPlayback", "true");
  playbackUrl.searchParams.set("AutoOpenLiveStream", "true");
  playbackUrl.searchParams.set("MaxStreamingBitrate", "20000000");
  const audioStreamIndex = requestUrl.searchParams.get("audioStreamIndex");
  const subtitleStreamIndex = requestUrl.searchParams.get("subtitleStreamIndex");
  if (audioStreamIndex && audioStreamIndex !== "default") playbackUrl.searchParams.set("AudioStreamIndex", audioStreamIndex);
  if (subtitleStreamIndex && subtitleStreamIndex !== "off") playbackUrl.searchParams.set("SubtitleStreamIndex", subtitleStreamIndex);

  const response = await fetch(playbackUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Emby-Token": jellyfin.apiKey,
    },
    body: JSON.stringify({ DeviceProfile: buildJellyfinBrowserProfile() }),
  });
  if (!response.ok) throw new Error(`Jellyfin PlaybackInfo failed: ${response.status}`);
  const playbackInfo = await response.json();
  const mediaSource = playbackInfo.MediaSources?.find((source) => source.TranscodingUrl) ?? playbackInfo.MediaSources?.[0];
  if (!mediaSource?.TranscodingUrl) throw new Error("Jellyfin did not return an HLS transcoding URL");
  return new URL(mediaSource.TranscodingUrl, jellyfin.url).toString();
}

async function getJellyfinUserId() {
  if (jellyfin.userId && Date.now() - jellyfin.userCacheAt < 5 * 60 * 1000) return jellyfin.userId;
  const response = await fetch(`${jellyfin.url}/Users`, { headers: { "X-Emby-Token": jellyfin.apiKey } });
  if (!response.ok) throw new Error(`Jellyfin user lookup failed: ${response.status}`);
  const users = await response.json();
  jellyfin.userId = users?.[0]?.Id ?? null;
  jellyfin.userCacheAt = Date.now();
  if (!jellyfin.userId) throw new Error("Jellyfin did not return a user id");
  return jellyfin.userId;
}

function buildJellyfinBrowserProfile() {
  return {
    MaxStreamingBitrate: 20000000,
    DirectPlayProfiles: [
      { Type: "Video", Container: "mp4,m4v,mov", VideoCodec: "h264", AudioCodec: "aac,mp3" },
    ],
    TranscodingProfiles: [
      {
        Type: "Video",
        Context: "Streaming",
        Protocol: "hls",
        Container: "ts",
        VideoCodec: "h264",
        AudioCodec: "aac",
        MaxAudioChannels: "6",
        MinSegments: "2",
        BreakOnNonKeyFrames: true,
      },
    ],
    ContainerProfiles: [],
    CodecProfiles: [],
    SubtitleProfiles: [
      { Format: "srt", Method: "External" },
      { Format: "subrip", Method: "External" },
      { Format: "vtt", Method: "External" },
      { Format: "ass", Method: "Encode" },
      { Format: "ssa", Method: "Encode" },
      { Format: "pgssub", Method: "Encode" },
      { Format: "dvdsub", Method: "Encode" },
    ],
  };
}

async function getJellyfinItems() {
  if (jellyfin.itemCache && Date.now() - jellyfin.itemCacheAt < 5 * 60 * 1000) return jellyfin.itemCache;
  if (jellyfin.unreachableUntil > Date.now()) throw new Error("Jellyfin is temporarily unavailable");
  const url = new URL(`${jellyfin.url}/Items`);
  url.searchParams.set("Recursive", "true");
  url.searchParams.set("Fields", "Path");
  url.searchParams.set("IncludeItemTypes", "Movie,Episode,Video");
  try {
    const response = await fetch(url, { headers: { "X-Emby-Token": jellyfin.apiKey }, signal: AbortSignal.timeout(800) });
    if (!response.ok) throw new Error(`Jellyfin item lookup failed: ${response.status}`);
    const data = await response.json();
    jellyfin.itemCache = (data.Items ?? []).filter((item) => item.Path);
    jellyfin.itemCacheAt = Date.now();
    jellyfin.unreachableUntil = 0;
    return jellyfin.itemCache;
  } catch (error) {
    jellyfin.unreachableUntil = Date.now() + 15_000;
    throw error;
  }
}

async function serveStatic(urlPath, response) {
  const requestedPath = decodeURIComponent(urlPath === "/" ? "/index.html" : urlPath);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[\\/])+/, "");
  const filePath = path.join(root, safePath);
  const fileStats = await stat(filePath).catch(() => null);

  if (!fileStats?.isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": contentType(filePath),
    "content-length": fileStats.size,
    "cache-control": /\.(?:html|js|css|json)$/i.test(filePath) ? "no-store" : "public, max-age=3600",
  });
  createReadStream(filePath).pipe(response);
}

async function readConfig() {
  const shared = await readJsonConfig(path.join(root, "config", "tobytube.config.json"));
  const local = await readJsonConfig(path.join(root, "config", "tobytube.local.json"));
  return mergeConfig(shared, local);
}

async function readJsonConfig(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw new Error(`Could not read ${path.relative(root, filePath)}: ${error.message}`);
  }
}

function mergeConfig(shared, local) {
  const merged = {
    ...shared,
    ...local,
    jellyfin: { ...(shared.jellyfin ?? {}), ...(local.jellyfin ?? {}) },
  };
  if (local.mediaSources?.length) delete merged.mediaRoots;
  else if (local.mediaRoots?.length) delete merged.mediaSources;
  return merged;
}

function getAllowedMediaRoots() {
  return [
    ...mediaSources.map((source) => resolveConfiguredPath(source.path)),
    ...(config.playbackRoots ?? []).map(resolveConfiguredPath),
  ];
}

function normalizeConfiguredMediaSources(value) {
  const configured = value.mediaSources?.length
    ? value.mediaSources
    : (value.mediaRoots ?? []).map((sourcePath, index) => ({ id: `legacy-${index + 1}`, type: "mixed", path: sourcePath }));
  const allowedTypes = new Set(["movie", "tv", "wrestling", "mixed"]);
  return configured.filter((source) => source?.enabled !== false).map((source, index) => {
    const type = String(source.type ?? "mixed").toLowerCase();
    if (!allowedTypes.has(type)) throw new Error(`Invalid media source type: ${source.type}`);
    if (!source.path) throw new Error(`Media source ${source.id ?? index + 1} has no path.`);
    if (String(source.id ?? "").includes("|")) throw new Error(`Media source id cannot contain |: ${source.id}`);
    return { id: String(source.id ?? `${type}-${index + 1}`), type, path: String(source.path) };
  });
}

function resolveConfiguredPath(configuredPath) {
  return path.isAbsolute(configuredPath) ? path.resolve(configuredPath) : path.resolve(root, configuredPath);
}

function resolveLibraryMediaPath(value) {
  const requestedPath = String(value ?? "");
  if (!requestedPath) return path.resolve("");
  const portablePath = requestedPath.replaceAll("\\", "/");
  const mediaMarker = portablePath.toLowerCase().lastIndexOf("/media/");
  if (mediaMarker >= 0) {
    const relativeParts = portablePath.slice(mediaMarker + "/media/".length).split("/").filter(Boolean);
    const category = relativeParts[0]?.toLowerCase();
    for (const configuredRoot of getAllowedMediaRoots()) {
      const rootName = path.basename(configuredRoot).toLowerCase();
      if (rootName === category) return path.join(configuredRoot, ...relativeParts.slice(1));
      if (rootName === "media") return path.join(configuredRoot, ...relativeParts);
    }
  }

  if (path.isAbsolute(requestedPath)) return path.resolve(requestedPath);

  return path.resolve(requestedPath);
}

function normalizeBaseUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return String(value).replace(/\/+$/, "");
  }
}

function normalizeFilesystemPath(value) {
  return path.resolve(String(value ?? "")).toLowerCase();
}

function isAllowedMediaPath(filePath) {
  return getAllowedMediaRoots().some((mediaRoot) => {
    const relative = path.relative(mediaRoot, filePath);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
}

function sendJson(response, body) {
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body, null, 2));
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".mp4": "video/mp4",
      ".m4v": "video/mp4",
      ".mkv": "video/x-matroska",
      ".webm": "video/webm",
      ".mov": "video/quicktime",
      ".avi": "video/x-msvideo",
    }[extension] ?? "application/octet-stream"
  );
}
