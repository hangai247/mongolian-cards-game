-- Room state for the 8 гар host. The engine state (including private hands) lives in game_states.state;
-- this database is never exposed to clients.
CREATE TABLE IF NOT EXISTS rooms (
  id             uuid PRIMARY KEY,
  code           text NOT NULL UNIQUE,
  status         text NOT NULL CHECK (status IN ('lobby', 'playing', 'finished', 'abandoned')),
  host_player_id uuid NOT NULL,
  version        bigint NOT NULL,
  seats          jsonb NOT NULL,
  created_at     timestamptz NOT NULL,
  updated_at     timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS rooms_status_updated_idx ON rooms (status, updated_at);

CREATE TABLE IF NOT EXISTS players (
  id           uuid PRIMARY KEY,
  room_id      uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  seat         smallint NOT NULL CHECK (seat BETWEEN 0 AND 7),
  last_seen_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS players_room_seat_idx ON players (room_id, seat);
CREATE UNIQUE INDEX IF NOT EXISTS players_room_name_idx ON players (room_id, lower(display_name));

CREATE TABLE IF NOT EXISTS game_states (
  room_id    uuid PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  revision   integer NOT NULL,
  state      jsonb NOT NULL,
  meta       jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS moves (
  id              bigserial PRIMARY KEY,
  room_id         uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  room_version    bigint NOT NULL,
  engine_revision integer,
  kind            text NOT NULL,
  cause           text NOT NULL,
  actor_seat      smallint,
  payload         jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, room_version)
);
