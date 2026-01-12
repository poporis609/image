/**
 * Database Service - PostgreSQL 연결 및 쿼리 실행
 */

import pg from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const { Pool } = pg;

let pool: pg.Pool | null = null;

interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

async function getDbConfig(): Promise<DbConfig> {
  // AWS Secrets Manager에서 전체 DB 설정 가져오기
  if (process.env.USE_SECRETS_MANAGER === 'true' && process.env.DB_SECRET_NAME) {
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const command = new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_NAME });
    const response = await client.send(command);
    
    if (response.SecretString) {
      try {
        const secret = JSON.parse(response.SecretString);
        console.log('[Database] Config loaded from Secrets Manager');
        return {
          host: secret.host || process.env.DB_HOST,
          port: parseInt(secret.port || process.env.DB_PORT || '5432'),
          database: secret.dbname || secret.database || process.env.DB_NAME,
          user: secret.username || secret.user || process.env.DB_USER,
          password: secret.password,
        };
      } catch {
        // JSON 파싱 실패 시 비밀번호만 사용
        console.log('[Database] Password loaded from Secrets Manager (plain text)');
      }
    }
  }

  // 환경변수에서 가져오기 (fallback)
  if (!process.env.DB_HOST || !process.env.DB_PASSWORD) {
    throw new Error('DB configuration not found');
  }
  
  return {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  };
}

export async function initPool(): Promise<pg.Pool> {
  if (!pool) {
    const config = await getDbConfig();
    
    pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
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
