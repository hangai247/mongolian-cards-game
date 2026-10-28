ALTER TABLE players ADD COLUMN avatar_id text NOT NULL DEFAULT 'temu'
  CHECK (avatar_id IN ('temu', 'bataa', 'sarnai', 'anu', 'bold', 'naraa', 'oyu'));
