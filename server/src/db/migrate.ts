import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from './pool.js';
import type { Logger } from '../logger.js';

const SQL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../sql');

/** Applies sql/NNN_name.sql files in order, once each. Each file runs inside its own transaction. */
export async function migrate(pool: Pool, log: Logger, sqlDir = SQL_DIR): Promise<void> {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const files = (await readdir(sqlDir)).filter(name => /^\d+_.*\.sql$/.test(name)).sort();
  const applied = new Set((await pool.query<{ version: number }>('SELECT version FROM schema_migrations')).rows.map(row => Number(row.version)));
  for (const file of files) {
    const version = Number(file.split('_')[0]);
    if (applied.has(version)) continue;
    const sql = await readFile(path.join(sqlDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      await client.query('COMMIT');
      log.info({ migration: file }, 'applied migration');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
