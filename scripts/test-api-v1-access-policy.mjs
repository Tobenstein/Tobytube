import assert from "node:assert/strict";
import { ACCESS_DECISIONS, authorizeMediaOrThrow, evaluateMediaAccess, filterAuthorizedMedia, validateAccessPolicy } from "./api-v1-access-policy.mjs";

const viewer = {
  id: "viewer", role: "viewer", enabled: true, accessMode: "all-except-blocked",
  allowedCollections: [], blockedRatings: [], blockedItemIds: [], blockedFranchiseIds: [], blockedPathRules: [],
};
const item = { id: "movie-safe", type: "movie", rating: "PG-13", collectionIds: ["comedy"], franchiseIds: ["safe-series"], sourcePath: "M:\\Collections\\Aisles\\Comedy\\Safe\\Movie.mkv" };
const expectCode = (user, media, allowed, code) => assert.deepEqual(evaluateMediaAccess(user, media), { allowed, code, policyVersion: 1 });

expectCode(null, item, false, ACCESS_DECISIONS.NO_IDENTITY);
expectCode({ ...viewer, enabled: false }, item, false, ACCESS_DECISIONS.DISABLED);
expectCode({ ...viewer, role: "admin" }, item, true, ACCESS_DECISIONS.ADMIN);
expectCode(viewer, item, true, ACCESS_DECISIONS.ALLOW);
expectCode({ ...viewer, blockedRatings: ["pg 13"] }, item, false, ACCESS_DECISIONS.RATING);
expectCode({ ...viewer, blockedItemIds: ["MOVIE-SAFE"] }, item, false, ACCESS_DECISIONS.ITEM);
expectCode({ ...viewer, blockedItemIds: ["show-parent"] }, { ...item, ancestorIds: ["show-parent"] }, false, ACCESS_DECISIONS.ITEM);
expectCode({ ...viewer, blockedFranchiseIds: ["SAFE-SERIES"] }, item, false, ACCESS_DECISIONS.FRANCHISE);
expectCode({ ...viewer, blockedPathRules: ["X:\\"] }, { ...item, sourcePath: "X:\\Private\\Movie.mkv" }, false, ACCESS_DECISIONS.PATH);
expectCode({ ...viewer, blockedPathRules: ["private"] }, { ...item, sourcePath: "M:\\Movies\\Private\\Movie.mkv" }, false, ACCESS_DECISIONS.PATH);
expectCode({ ...viewer, blockedPathRules: ["X:\\"] }, item, true, ACCESS_DECISIONS.ALLOW);

const collectionOnly = { ...viewer, accessMode: "collections-only", allowedCollections: ["comedy"] };
expectCode(collectionOnly, item, true, ACCESS_DECISIONS.ALLOW);
expectCode(collectionOnly, { ...item, collectionIds: ["horror"] }, false, ACCESS_DECISIONS.COLLECTION_REQUIRED);
expectCode(collectionOnly, { id: "comedy", type: "collection", collectionIds: [] }, true, ACCESS_DECISIONS.ALLOW);
expectCode({ ...collectionOnly, blockedItemIds: ["movie-safe"] }, item, false, ACCESS_DECISIONS.ITEM);

assert.equal(validateAccessPolicy(viewer).valid, true);
assert.equal(validateAccessPolicy({ ...viewer, blockedRatings: "TV-MA" }).valid, false);
expectCode({ ...viewer, blockedRatings: "TV-MA" }, item, false, ACCESS_DECISIONS.INVALID_POLICY);

const visible = filterAuthorizedMedia({ ...viewer, blockedItemIds: ["blocked"] }, [{ ...item, id: "allowed" }, { ...item, id: "blocked" }]);
assert.deepEqual(visible.map((entry) => entry.id), ["allowed"]);

assert.throws(() => authorizeMediaOrThrow({ ...viewer, blockedItemIds: [item.id] }, item), (error) => {
  assert.equal(error.code, "MEDIA_NOT_AVAILABLE");
  assert.equal(error.statusCode, 404, "denials deliberately look like missing objects to clients");
  assert.equal(error.message.includes("blocked"), false, "client error must not reveal why an object is hidden");
  return true;
});

console.log("api v1 access policy ok (deny-by-default permission matrix)");
