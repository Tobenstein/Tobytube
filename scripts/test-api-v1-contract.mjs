import assert from "node:assert/strict";
import { API_V1_VERSION, apiV1Contract, apiV1Error, apiV1Success, getApiV1Capabilities, hasForbiddenClientData } from "./api-v1-contract.mjs";

assert.match(API_V1_VERSION, /^1\.0\.0-preview\.\d+$/);
assert.equal(apiV1Contract.basePath, "/api/v1");
assert.equal(new Set(apiV1Contract.routes.map((route) => `${route.method} ${route.path}`)).size, apiV1Contract.routes.length, "routes must be unique");
assert.ok(apiV1Contract.routes.every((route) => route.path.startsWith("/api/v1")), "all routes must be versioned");
assert.deepEqual(apiV1Contract.rating, { storage: "integer-quarter-stars", minimum: 4, maximum: 20, increment: 1, displayDivisor: 4 });

const identity = apiV1Success({ product: "Tobytube", role: "streaming-api" });
assert.equal(identity.ok, true);
assert.equal(identity.apiVersion, API_V1_VERSION);
assert.equal(hasForbiddenClientData(identity), false);

const capabilities = apiV1Success(getApiV1Capabilities());
assert.equal(capabilities.data.features.contractDiscovery, true);
assert.equal(capabilities.data.features.authentication, true);
assert.equal(capabilities.data.features.passwordLogin, false, "unfinished password login must not be advertised as available");
assert.equal(hasForbiddenClientData(capabilities), false);

const error = apiV1Error("NOT_IMPLEMENTED", "This API capability is not available yet.");
assert.equal(error.ok, false);
assert.equal(error.error.code, "NOT_IMPLEMENTED");
assert.equal(hasForbiddenClientData(error), false);

assert.equal(hasForbiddenClientData({ filePath: "M:\\Movies\\Private\\film.mkv" }), true);
assert.equal(hasForbiddenClientData({ location: "T:\\TV\\Private\\episode.mkv" }), true, "drive paths must be rejected even under an otherwise safe key");
assert.equal(hasForbiddenClientData({ nested: { apiKey: "secret" } }), true);
assert.equal(hasForbiddenClientData({ artworkUrl: "/api/v1/artwork/opaque-id" }), false);

console.log(`api v1 contract ok (${apiV1Contract.routes.length} routes, ${API_V1_VERSION})`);
