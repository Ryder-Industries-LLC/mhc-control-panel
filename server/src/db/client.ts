import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Unexpected database error', { error: err.message, stack: err.stack });
});

pool.on('connect', () => {
  logger.debug('New database client connected');
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    logger.error('Query error', {
      text,
      params,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function getClient() {
  const client = await pool.connect();
  return client;
}

export async function disconnect() {
  await pool.end();
  logger.info('Database pool closed');
}
