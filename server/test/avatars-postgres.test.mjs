import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createPool } from '../dist/db/pool.js';
import { migrate } from '../dist/db/migrate.js';
import { PgRepository } from '../dist/db/repo.js';
import { createRoom, applyCommand } from '../dist/room/reducer.js';
import { AVATAR_IDS } from '../../dist/avatars.js';
const url=process.env.AVATAR_TEST_DATABASE_URL;
// An explicit disposable database is required; never infer a production DATABASE_URL.
test('Postgres migration upgrades old players and persists avatar updates across repository restart', {skip:!url}, async () => {
  const pool=createPool(url), schema=`avatar_test_${randomUUID().replaceAll('-','')}`;
  await pool.query(`CREATE SCHEMA ${schema}`);
  // Every connection uses the isolated schema, including transactions in the migration and repository.
  const scopedUrl=new URL(url);scopedUrl.searchParams.set('options',`-c search_path=${schema}`);
  const scoped=createPool(scopedUrl.toString()), repo=new PgRepository(scoped);
  try {
    await scoped.query(await readFile(new URL('../sql/001_init.sql',import.meta.url),'utf8'));
    const old=createRoom({id:randomUUID(),code:'ABC234',hostPlayerId:randomUUID(),hostName:'Legacy',now:Date.now()});
    await scoped.query('INSERT INTO rooms (id,code,status,host_player_id,version,seats,created_at,updated_at) VALUES ($1,$2,$3,$4,0,$5,now(),now())',[old.id,old.code,old.status,old.hostPlayerId,JSON.stringify(old.seats)]);
    await scoped.query('INSERT INTO players (id,room_id,display_name,seat,last_seen_at) VALUES ($1,$2,$3,0,now())',[old.hostPlayerId,old.id,'Legacy']);
    await migrate(scoped,{info(){}});
    assert.equal((await scoped.query('SELECT avatar_id FROM players')).rows[0].avatar_id,'temu');
    // All catalog entries must pass the database allowlist, including the new portraits.
    for (const avatarId of AVATAR_IDS) {
      await scoped.query('UPDATE players SET avatar_id=$1', [avatarId]);
      assert.equal((await scoped.query('SELECT avatar_id FROM players')).rows[0].avatar_id,avatarId);
    }
    await scoped.query("UPDATE players SET avatar_id='temu'");
    await migrate(scoped,{info(){}}); // Re-running migrations is safe.
    const restored=(await repo.loadActiveRooms(0))[0];
    assert.equal(restored.players[old.hostPlayerId].avatarId,'temu');
    const updated=applyCommand(restored,{type:'set-avatar',playerId:old.hostPlayerId,avatarId:'sonio'},{now:Date.now(),random:()=>.5,timing:{}}).snapshot;
    await repo.commit(updated,null);
    const secondPool=createPool(scopedUrl.toString()), secondRepo=new PgRepository(secondPool);
    try { assert.equal((await secondRepo.loadActiveRooms(0))[0].players[old.hostPlayerId].avatarId,'sonio'); } finally {await secondRepo.close();}
    await assert.rejects(scoped.query("UPDATE players SET avatar_id='bad'"),e=>e.code==='23514');
  } finally { await repo.close();await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end(); }
});
