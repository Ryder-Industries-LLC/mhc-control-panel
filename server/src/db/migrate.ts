import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, disconnect } from './client.js';
import { logger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

interface Migration {
  id: number;
  name: string;
  executed_at: Date;
}

async function createMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      executed_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

async function getExecutedMigrations(): Promise<Migration[]> {
  const result = await query<Migration>('SELECT * FROM migrations ORDER BY id ASC');
  return result.rows;
}

async function executeMigration(id: number, name: string, sql: string) {
  const client = await (await import('./client.js')).getClient();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO migrations (id, name) VALUES ($1, $2)', [id, name]);
    await client.query('COMMIT');
    logger.info(`Migration ${id}_${name} executed successfully`);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`Migration ${id}_${name} failed`, { error });
    throw error;
  } finally {
    client.release();
  }
}

async function runMigrations() {
  try {
    logger.info('Starting database migrations');

    await createMigrationsTable();

    const executed = await getExecutedMigrations();
    const executedIds = new Set(executed.map((m) => m.id));

    const files = await fs.readdir(MIGRATIONS_DIR);
    const migrationFiles = files
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => {
        const match = f.match(/^(\d+)_(.+)\.sql$/);
        if (!match) throw new Error(`Invalid migration filename: ${f}`);
        return { id: parseInt(match[1], 10), name: match[2], filename: f };
      });

    for (const migration of migrationFiles) {
      if (executedIds.has(migration.id)) {
        logger.debug(`Skipping migration ${migration.id}_${migration.name} (already executed)`);
        continue;
      }

      const filepath = path.join(MIGRATIONS_DIR, migration.filename);
      const sql = await fs.readFile(filepath, 'utf-8');

      await executeMigration(migration.id, migration.name, sql);
    }

    logger.info('All migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed', { error });
    throw error;
  } finally {
    await disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().catch((error) => {
    console.error('Fatal migration error:', error);
    process.exit(1);
  });
}

export { runMigrations };
