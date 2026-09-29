import { randomUUID } from "node:crypto";
import { evaluateMediaAccess } from "./api-v1-access-policy.mjs";

const DECISION_TTL_MS = 15 * 60 * 1000;
const DIRECT_CONTAINERS = new Set(["mp4", "m4v", "mov", "webm", "mkv", "matroska"]);

export function createPlaybackState() { return { version: 1, sessions: [] }; }

export function negotiatePlayback(state, { user, deviceSession, item, media, clientCapabilities = {}, resumeSeconds = 0 }, now = Date.now()) {
  if (!deviceSession?.userId || deviceSession.userId !== user?.id) throw playbackError("AUTHENTICATION_REQUIRED", 401);
  const access = evaluateMediaAccess(user, item);
  if (!access.allowed) throw playbackError("MEDIA_NOT_AVAILABLE", 404);
  if (!media?.sourcePath) throw playbackError("MEDIA_NOT_AVAILABLE", 404);

  const profile = choosePlaybackProfile(media, clientCapabilities);
  const id = randomUUID();
  const expiresAt = new Date(now + DECISION_TTL_MS).toISOString();
  const internal = {
    id, userId: user.id, deviceId: deviceSession.deviceId, itemId: item.id, sourcePath: media.sourcePath,
    profile, subtitleSources: (media.streams?.subtitles ?? []).filter((track) => track.externalPath).map((track) => ({ id: String(track.index), path: track.externalPath })), createdAt: new Date(now).toISOString(), expiresAt, revokedAt: null,
  };
  state.sessions = [...state.sessions.filter((entry) => Date.parse(entry.expiresAt) > now && !entry.revokedAt), internal];
  return {
    sessionId: id,
    itemId: item.id,
    protocol: profile.protocol,
    url: `/api/v1/playback/streams/${id}`,
    mimeType: profile.mimeType,
    expiresAt,
    resumeSeconds: Math.max(0, Math.floor(Number(resumeSeconds) || 0)),
    durationSeconds: Number(media.durationSeconds) || null,
    seekable: profile.seekable,
    delivery: profile.delivery,
    tracks: projectTracks(media.streams),
  };
}

export function authorizePlaybackStream(state, { sessionId, deviceSession }, now = Date.now()) {
  const playback = state.sessions.find((entry) => entry.id === sessionId && !entry.revokedAt && Date.parse(entry.expiresAt) > now);
  if (!playback || playback.userId !== deviceSession?.userId || playback.deviceId !== deviceSession?.deviceId) throw playbackError("PLAYBACK_SESSION_NOT_AVAILABLE", 404);
  return playback;
}

export function choosePlaybackProfile(media, capabilities = {}) {
  const container = String(media.container ?? extension(media.sourcePath)).toLowerCase();
  const videoCodec = String(media.streams?.video?.[0]?.codec ?? "").toLowerCase();
  const audioCodec = String(media.streams?.audio?.[0]?.codec ?? "").toLowerCase();
  const supportedVideo = new Set(capabilities.videoCodecs ?? ["h264", "av1", "vp8", "vp9"]);
  const supportedAudio = new Set(capabilities.audioCodecs ?? ["aac", "mp3", "opus", "vorbis"]);
  const direct = capabilities.forceTranscode !== true && DIRECT_CONTAINERS.has(container) && (!videoCodec || supportedVideo.has(videoCodec)) && (!audioCodec || supportedAudio.has(audioCodec));
  if (direct) return { protocol: "progressive", delivery: "direct", mimeType: mimeFor(container), seekable: true };
  // The current local converter emits a fragmented MP4 byte stream. Do not
  // advertise HLS until the stream route produces an actual media playlist.
  return { protocol: "progressive", delivery: "transcode", mimeType: "video/mp4", seekable: true };
}

function projectTracks(streams = {}) {
  const map = (type) => (streams[type] ?? []).map((track, index) => ({ id: String(track.index ?? index), type, language: track.language ?? null, label: track.label ?? track.title ?? null, codec: track.codec ?? null, channels: type === "audio" ? Number(track.channels) || null : undefined, default: Boolean(track.default), external: Boolean(track.externalPath) }));
  return [...map("video"), ...map("audio"), ...map("subtitles")];
}
function extension(filePath) { return String(filePath ?? "").split(".").pop() ?? ""; }
function mimeFor(container) { return container === "webm" ? "video/webm" : ["mkv", "matroska"].includes(container) ? "video/x-matroska" : "video/mp4"; }
function playbackError(code, statusCode) { const error = new Error(code === "AUTHENTICATION_REQUIRED" ? "Authentication is required." : "The playback session is unavailable."); error.code = code; error.statusCode = statusCode; return error; }
