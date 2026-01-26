import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const { Pool } = pg;

// Configure SSL based on connection type:
// - Internal Render URLs (no domain suffix) don't require SSL
// - External URLs (.render.com or .oregon-postgres.render.com) require SSL
const dbHost = env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'unknown';
const isExternalUrl = dbHost.includes('.render.com') || dbHost.includes('.postgres.render.com');
const isProduction = env.NODE_ENV === 'production';

// Only enable SSL for external connections in production
const sslConfig = isProduction && isExternalUrl
  ? { rejectUnauthorized: false }  // Render uses self-signed certificates
  : undefined;

// Log database configuration (without sensitive data)
console.log(`[DB] Connecting to: ${dbHost}`);
console.log(`[DB] NODE_ENV: ${env.NODE_ENV}`);
console.log(`[DB] Is external URL: ${isExternalUrl}`);
console.log(`[DB] SSL enabled: ${!!(isProduction && isExternalUrl)}`);

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: sslConfig,
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
