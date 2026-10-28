# Selectable avatars

Players choose a preset before creating/joining a table or starting practice. A browser preference preselects their previous choice. Lobby changes are server-authoritative and locked after starting; duplicate avatars are allowed. The practice save stores its own avatar independently of the browser preference. A cancelled new-game dialog does not alter the active game.

The shared catalog is `src/avatars.ts`, exposed as `mongolian-eight-gar-engine/avatars` and copied to the browser by the normal root build. `avatarId` is an allowlisted ID, never a URL. Create/join default omitted IDs to `temu` for older clients. `room:setAvatar` derives the owner from the authenticated socket and broadcasts committed roster changes. Public seat metadata includes `avatarId` (null for empty seats). Human avatars follow identity through seat changes, reconnects, rematches and reserved bot takeover; ordinary bot avatars derive from absolute seats.

Migration `server/sql/002_player_avatars.sql` adds the defaulted, constrained `players.avatar_id` column. Startup applies it using the existing migration runner. Repositories persist/read this field. Back up production data and use the existing deployment process when publishing; this change was prepared and tested locally only.

The renderer uses seven still WebP cutouts, a people-free room and a foreground copy clipped along the table edge. All placement derives from `room-layout.js`. The current first-person viewpoint, card animations and rules are retained. A local avatar chip stays visible even when the opener-only self-seat badge is hidden. Missing character assets use the seat portrait; missing portraits display initials.

## Verification

- `npm run test:all`: engine, client and server checks. Socket tests require loopback networking.
- `AVATAR_TEST_DATABASE_URL=postgresql://... npm test -w server`: also runs the PostgreSQL migration/persistence test. Use only a disposable local database. The test creates and removes a uniquely named schema and verifies an old player record migrates to the default, updates persist across repository instances, and invalid IDs fail the constraint.
- Serve the repository on a disposable local origin and open `sites/eight-gar/tests/avatars-qa.html`: practice picker, storage denial, restoration, new-game cancellation, missing image fallback, responsive checks, and visual matrices showing every avatar in all seven visible seats. The practice test restores its browser storage values afterward.

## Artwork provenance

Built-in Image Generation was used to edit the original room photographs. Generated PNG originals remain in the generated-image folder. Project assets are JPEG exports at quality 88:

- `dist/assets/ger-room-wide-v5.jpg`, from `ger-table-wide-v4.jpg`.
- `dist/assets/ger-room-portrait-v5.jpg`, from `ger-table-portrait-v4.jpg`.

The v4 originals and all seven existing character assets are retained unchanged. Desktop generation output: `exec-0d5cc914-0477-43df-b4d8-3f8ec03999b1.png`; portrait: `exec-3413a816-b01e-4cab-a931-07320d3382b9.png`.

Exact desktop prompt:

> Use case: precise-object-edit. Edit target: the supplied landscape Mongolian card room photograph. Remove all seven seated people completely including their bodies, heads, hands, clothes and shadows. Reconstruct the room and empty seating naturally behind them. Preserve the exact camera, framing, wide aspect ratio, oval green felt table shape and position, wooden table rail, cups, lanterns, fireplace, textiles, mountain view, warm lighting and overall photorealistic style. The table perimeter must remain exactly aligned with the original so separately rendered character cutouts can be placed later. No people, human silhouettes, cards, text, UI, or watermark. Return one people-free wide background.

Exact portrait prompt:

> Use case: precise-object-edit. Edit target: the supplied portrait Mongolian card room photograph. Remove all seven seated people completely including their bodies, heads, hands, clothes and shadows. Reconstruct the room and empty seating naturally behind them. Preserve the exact camera, portrait framing and aspect ratio, oval green felt table shape and position, wooden table rail, cups, lanterns, fireplace, textiles, mountain view, warm lighting and overall photorealistic style. The table perimeter must remain exactly aligned with the original so separately rendered character cutouts can be placed later. No people, human silhouettes, cards, text, UI, or watermark. Return one people-free portrait background.
