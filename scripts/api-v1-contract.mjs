export const API_V1_VERSION = "1.0.0-preview.1";
export const API_V1_BASE_PATH = "/api/v1";

export const apiV1Contract = Object.freeze({
  name: "Tobytube Streaming Client API",
  version: API_V1_VERSION,
  basePath: API_V1_BASE_PATH,
  stability: "contract-preview",
  timestampFormat: "RFC 3339 UTC",
  pagination: { style: "opaque-cursor", defaultLimit: 30, maximumLimit: 100 },
  rating: { storage: "integer-quarter-stars", minimum: 4, maximum: 20, increment: 1, displayDivisor: 4 },
  envelopes: {
    success: { required: ["ok", "apiVersion", "data"], optional: ["meta"] },
    error: { required: ["ok", "apiVersion", "error"], errorRequired: ["code", "message"], optional: ["requestId", "details"] },
  },
  security: {
    transport: "TLS required outside trusted LAN",
    authentication: "Bearer access token with rotating per-device refresh token",
    authorization: "Server-side deny by default",
    forbiddenResponseFields: ["path", "filePath", "resolvedPath", "apiKey", "token", "passwordHash", "providerCredentials"],
    forbiddenResponsePatterns: ["drive-letter filesystem paths", "UNC filesystem paths", "provider secrets"],
  },
  resources: {
    mediaItem: { id: "stable opaque string", types: ["movie", "show", "episode", "wrestling", "collection"], required: ["id", "type", "title"] },
    user: { required: ["id", "displayName", "role", "capabilities"] },
    device: { required: ["id", "name", "createdAt", "lastActiveAt"] },
    mixtape: { required: ["id", "name", "kind", "itemIds", "version"], kinds: ["watch-later", "custom"] },
    rating: { required: ["itemId", "quarterStars", "ratedAt"], quarterStars: "integer 4 through 20" },
    activity: { types: ["start", "progress", "pause", "complete", "favourite", "rating", "mixtape-change"] },
    playbackDecision: { required: ["sessionId", "protocol", "url", "expiresAt", "resumeSeconds", "tracks"] },
  },
  routes: [
    ["GET", "/", "available", "API identity"],
    ["GET", "/capabilities", "available", "Server and client capability negotiation"],
    ["GET", "/contract", "available", "Machine-readable Phase 1 contract"],
    ["POST", "/admin/pairing-codes", "available", "Create a loopback-only Batcave pairing code"],
    ["POST", "/pairing/claim", "available", "Claim a Batcave pairing code"],
    ["POST", "/auth/login", "planned", "Authenticate an account and device"],
    ["POST", "/auth/refresh", "available", "Rotate a device refresh token"],
    ["POST", "/auth/logout", "available", "Revoke the current device session"],
    ["GET", "/auth/me", "available", "Validate an access token and return its session identity"],
    ["GET", "/home", "planned", "Authorized ordered home rows"],
    ["GET", "/search", "planned", "Authorized paginated search"],
    ["GET", "/items/{itemId}", "planned", "Authorized item details"],
    ["GET", "/collections/{collectionId}", "planned", "Authorized collection details"],
    ["POST", "/playback/sessions", "planned", "Negotiate an authorized playback decision"],
    ["PUT", "/progress/{itemId}", "available", "Idempotently synchronize progress"],
    ["GET", "/mixtapes", "available", "List Watch Later and custom Mixtapes"],
    ["POST", "/mixtapes", "available", "Create a custom Mixtape"],
    ["PUT", "/mixtapes/{mixtapeId}", "available", "Rename or reorder a Mixtape"],
    ["DELETE", "/mixtapes/{mixtapeId}", "available", "Delete a custom Mixtape"],
    ["PUT", "/mixtapes/{mixtapeId}/items/{itemId}", "available", "Idempotently add an item"],
    ["DELETE", "/mixtapes/{mixtapeId}/items/{itemId}", "available", "Idempotently remove an item"],
    ["PUT", "/ratings/{itemId}", "available", "Save an integer quarter-star rating"],
    ["DELETE", "/ratings/{itemId}", "available", "Clear a rating"],
    ["GET", "/activity/recent", "available", "Basic recent activity for Phase 1"],
  ].map(([method, route, status, purpose]) => ({ method, path: `${API_V1_BASE_PATH}${route === "/" ? "" : route}`, status, purpose })),
});

export function apiV1Success(data, meta = undefined) {
  return { ok: true, apiVersion: API_V1_VERSION, data, ...(meta ? { meta } : {}) };
}

export function apiV1Error(code, message, details = undefined) {
  return { ok: false, apiVersion: API_V1_VERSION, error: { code, message, ...(details ? { details } : {}) } };
}

export function getApiV1Capabilities() {
  return {
    api: { version: API_V1_VERSION, stability: "contract-preview" },
    server: { product: "Tobytube Control Centre", role: "authoritative-server" },
    client: { role: "streaming-only" },
    features: {
      contractDiscovery: true,
      policyEvaluation: true,
      pairing: true,
      authentication: true,
      passwordLogin: false,
      authorizedCatalogue: true,
      playbackNegotiation: true,
      progressSync: true,
      watchLater: true,
      customMixtapes: true,
      quarterStarRatings: true,
      phase2Diary: false,
    },
  };
}

export function hasForbiddenClientData(value) {
  const serialized = JSON.stringify(value);
  const forbiddenKeys = /"(?:path|filePath|resolvedPath|apiKey|passwordHash|providerCredentials)"\s*:/i;
  const windowsPath = /[A-Z]:\\\\(?:[^"\\]+\\\\)+/i;
  const uncPath = /\\\\\\\\[^"\\]+\\\\[^"\\]+/;
  return forbiddenKeys.test(serialized) || windowsPath.test(serialized) || uncPath.test(serialized);
}
