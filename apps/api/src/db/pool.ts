import pg from 'pg';
import { config } from '../config';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: { rejectUnauthorized: false }, // Supabase requires SSL
  max: 10,
});

pool.on('error', (err) => {
  console.error('Unexpected pool error:', err);
});

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function getClient(): Promise<pg.PoolClient> {
  return pool.connect();
}
