/**
 * Database Service - PostgreSQL 연결 및 쿼리 실행
 */

import pg from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const { Pool } = pg;

let pool: pg.Pool | null = null;

async function getDbPassword(): Promise<string> {
  // 환경변수에 직접 설정된 경우
  if (process.env.DB_PASSWORD) {
    return process.env.DB_PASSWORD;
  }

  // AWS Secrets Manager에서 가져오기
  if (process.env.USE_SECRETS_MANAGER === 'true' && process.env.DB_SECRET_NAME) {
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const command = new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_NAME });
    const response = await client.send(command);
    
    if (response.SecretString) {
      const secret = JSON.parse(response.SecretString);
      console.log('[Database] Password loaded from Secrets Manager');
      return secret.password || secret;
    }
  }

  throw new Error('DB_PASSWORD not configured');
}

export async function initPool(): Promise<pg.Pool> {
  if (!pool) {
    const password = await getDbPassword();
    
    pool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: { rejectUnauthorized: false },
    });

    pool.on('error', (err) => {
      console.error('[Database] Unexpected error:', err);
    });
    
    console.log('[Database] Connection pool initialized');
  }
  return pool;
}

export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initPool() first.');
  }
  return pool;
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] || null;
}

export async function execute(sql: string, params: any[] = []): Promise<number> {
  const pool = getPool();
  const result = await pool.query(sql, params);
  return result.rowCount || 0;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('[Database] Connection pool closed');
  }
}
