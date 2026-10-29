-- Extend the existing allowlist without changing saved player choices.
ALTER TABLE players DROP CONSTRAINT players_avatar_id_check;
ALTER TABLE players ADD CONSTRAINT players_avatar_id_check
  CHECK (avatar_id IN (
    'temu', 'bataa', 'sarnai', 'anu', 'bold', 'naraa', 'oyu',
    'sonio', 'tegshee', 'bulgaa', 'nyamaa', 'uugii', 'enguuj', 'khuslee', 'gerlee', 'doojii'
  ));
