const POLICY_VERSION = 1;

export const ACCESS_DECISIONS = Object.freeze({
  ALLOW: "ALLOW",
  ADMIN: "ADMIN_BYPASS",
  NO_IDENTITY: "DENY_NO_IDENTITY",
  DISABLED: "DENY_ACCOUNT_DISABLED",
  INVALID_POLICY: "DENY_INVALID_POLICY",
  COLLECTION_REQUIRED: "DENY_COLLECTION_NOT_ALLOWED",
  RATING: "DENY_RATING",
  ITEM: "DENY_ITEM",
  FRANCHISE: "DENY_FRANCHISE",
  PATH: "DENY_PATH_RULE",
});

function normalizedToken(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizedRating(value) {
  return normalizedToken(value).replace(/[^a-z0-9]+/g, "");
}

function normalizedPath(value) {
  return String(value ?? "").trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/").toLowerCase();
}

function normalizedSet(values, normalizer = normalizedToken) {
  return new Set((Array.isArray(values) ? values : []).map(normalizer).filter(Boolean));
}

function intersects(left, right) {
  for (const value of left) if (right.has(value)) return true;
  return false;
}

function pathRuleMatches(sourcePath, rawRule) {
  const mediaPath = normalizedPath(sourcePath);
  const rule = normalizedPath(rawRule).replace(/\/$/, "");
  if (!mediaPath || !rule) return false;
  if (/^[a-z]:$/i.test(rule)) return mediaPath === `${rule}/` || mediaPath.startsWith(`${rule}/`);
  if (rule.includes("/")) return mediaPath === rule || mediaPath.startsWith(`${rule}/`);
  return mediaPath.split("/").filter(Boolean).includes(rule);
}

export function validateAccessPolicy(user) {
  const errors = [];
  if (!user || typeof user !== "object") errors.push("user is required");
  if (!normalizedToken(user?.id)) errors.push("user.id is required");
  if (!new Set(["admin", "viewer"]).has(user?.role)) errors.push("role must be admin or viewer");
  if (!new Set(["all-except-blocked", "collections-only"]).has(user?.accessMode)) errors.push("accessMode is invalid");
  for (const field of ["allowedCollections", "blockedRatings", "blockedItemIds", "blockedFranchiseIds", "blockedPathRules"]) {
    if (!Array.isArray(user?.[field])) errors.push(`${field} must be an array`);
  }
  return { valid: errors.length === 0, errors };
}

export function evaluateMediaAccess(user, item) {
  if (!user || typeof user !== "object") return decision(false, ACCESS_DECISIONS.NO_IDENTITY);
  if (user.enabled === false) return decision(false, ACCESS_DECISIONS.DISABLED);
  const validation = validateAccessPolicy(user);
  if (!validation.valid) return decision(false, ACCESS_DECISIONS.INVALID_POLICY);
  if (user.role === "admin") return decision(true, ACCESS_DECISIONS.ADMIN);
  if (!item || typeof item !== "object" || !normalizedToken(item.id)) return decision(false, ACCESS_DECISIONS.INVALID_POLICY);

  const effectiveItemIds = normalizedSet([item.id, ...(item.ancestorIds ?? []), item.showId, item.seriesId].filter(Boolean));
  if (intersects(effectiveItemIds, normalizedSet(user.blockedItemIds))) return decision(false, ACCESS_DECISIONS.ITEM);

  const effectiveFranchiseIds = normalizedSet([...(item.franchiseIds ?? []), item.franchiseId].filter(Boolean));
  if (intersects(effectiveFranchiseIds, normalizedSet(user.blockedFranchiseIds))) return decision(false, ACCESS_DECISIONS.FRANCHISE);

  const blockedRatings = normalizedSet(user.blockedRatings, normalizedRating);
  if (item.rating && blockedRatings.has(normalizedRating(item.rating))) return decision(false, ACCESS_DECISIONS.RATING);

  const sourcePaths = [item.sourcePath, ...(item.sourcePaths ?? [])].filter(Boolean);
  if (sourcePaths.some((sourcePath) => user.blockedPathRules.some((rule) => pathRuleMatches(sourcePath, rule)))) {
    return decision(false, ACCESS_DECISIONS.PATH);
  }

  if (user.accessMode === "collections-only") {
    const effectiveCollectionIds = normalizedSet([...(item.collectionIds ?? []), item.type === "collection" ? item.id : null].filter(Boolean));
    if (!intersects(effectiveCollectionIds, normalizedSet(user.allowedCollections))) return decision(false, ACCESS_DECISIONS.COLLECTION_REQUIRED);
  }

  return decision(true, ACCESS_DECISIONS.ALLOW);
}

export function filterAuthorizedMedia(user, items) {
  return (Array.isArray(items) ? items : []).filter((item) => evaluateMediaAccess(user, item).allowed);
}

export function authorizeMediaOrThrow(user, item) {
  const result = evaluateMediaAccess(user, item);
  if (result.allowed) return result;
  const error = new Error("This media object is unavailable for the current account.");
  error.code = "MEDIA_NOT_AVAILABLE";
  error.statusCode = 404;
  error.policyDecision = result.code;
  throw error;
}

function decision(allowed, code) {
  return Object.freeze({ allowed, code, policyVersion: POLICY_VERSION });
}
