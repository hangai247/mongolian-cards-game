-- Keep the original anu preset and add the photo-based anu-friend separately.
ALTER TABLE players DROP CONSTRAINT players_avatar_id_check;
ALTER TABLE players ADD CONSTRAINT players_avatar_id_check
  CHECK (avatar_id IN (
    'temu', 'bataa', 'sarnai', 'anu', 'bold', 'naraa', 'oyu',
    'sonio', 'tegshee', 'bulgaa', 'nyamaa', 'uugii', 'enguuj', 'khuslee', 'gerlee', 'doojii',
    'amraa', 'anu-friend'
  ));
