# API v1 Access Policy

Status: implemented and tested as an isolated policy engine; not yet connected to catalogue or playback serialization.

The source of truth is `scripts/api-v1-access-policy.mjs`. Every API v1 route that identifies, lists, describes, illustrates, recommends, schedules, or plays media must call this same evaluator before returning data.

## Decision order

1. Missing identity denies.
2. Disabled account denies.
3. Invalid or incomplete policy denies.
4. An enabled administrator is allowed.
5. A blocked item ID, parent/show ID, or ancestor ID denies.
6. A blocked franchise denies.
7. A blocked normalized rating denies.
8. A blocked drive, path prefix, or folder segment denies.
9. `collections-only` requires at least one effective collection in the account allow-list.
10. The object is allowed.

The effective context for an episode must include its show/ancestor IDs, inherited franchise IDs, effective collection memberships, rating, and internal source paths. This context stays inside the server and is removed before serialization.

## Non-disclosure behavior

A denied known object and an unknown object must be indistinguishable to a streaming client. `authorizeMediaOrThrow` therefore emits the generic code `MEDIA_NOT_AVAILABLE` with HTTP 404 and does not reveal whether the cause was a rating, private path, title, franchise, collection, disabled account, or another policy rule.

## Path rules

- Drive rules such as `X:\\` block everything on that drive.
- Path-prefix rules block that directory and its descendants.
- Bare folder rules such as `Private` match complete normalized path segments, not partial filenames.
- Path comparison is case-insensitive and normalizes Windows separators.
- Physical paths are evaluation-only data and must never appear in API v1 output.

## Activation gate

The engine must remain disconnected until each new endpoint has tests proving:

- filtering occurs before pagination and serialization;
- alternate access through search, details, artwork, recommendations, TV Guide, collections, and playback is also denied;
- parent/show restrictions propagate to episodes;
- cached responses are partitioned by user and policy revision;
- no denial response reveals the existence or reason for hidden content.

Run the matrix with `npm run test:api-v1-policy`.
