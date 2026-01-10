/**
 * DB 스키마 정보 조회 스크립트
 */
import 'dotenv/config';
import { query, closePool } from './services/database.js';

async function getSchemaInfo() {
  try {
    // 1. 모든 테이블 목록 조회
    console.log('\n=== 테이블 목록 ===\n');
    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    console.log(tables.map(t => t.table_name).join('\n'));

    // 2. 각 테이블의 컬럼 정보 조회
    console.log('\n=== 테이블별 컬럼 정보 ===\n');
    for (const table of tables) {
      console.log(`\n[${table.table_name}]`);
      const columns = await query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [table.table_name]);
      
      columns.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        const length = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
        console.log(`  - ${col.column_name}: ${col.data_type}${length} ${nullable}${defaultVal}`);
      });
    }

    // 3. Primary Key 정보
    console.log('\n=== Primary Keys ===\n');
    const pks = await query(`
      SELECT 
        tc.table_name,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'PRIMARY KEY' 
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name
    `);
    pks.forEach(pk => console.log(`  ${pk.table_name}.${pk.column_name}`));

    // 4. Foreign Key 관계 조회
    console.log('\n=== Foreign Key 관계 (ERD 연결) ===\n');
    const fks = await query(`
      SELECT 
        tc.table_name AS from_table,
        kcu.column_name AS from_column,
        ccu.table_name AS to_table,
        ccu.column_name AS to_column,
        tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu 
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name
    `);
    
    if (fks.length === 0) {
      console.log('  (Foreign Key 없음)');
    } else {
      fks.forEach(fk => {
        console.log(`  ${fk.from_table}.${fk.from_column} --> ${fk.to_table}.${fk.to_column}`);
      });
    }

    // 5. 인덱스 정보
    console.log('\n=== 인덱스 정보 ===\n');
    const indexes = await query(`
      SELECT 
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);
    indexes.forEach(idx => console.log(`  ${idx.tablename}: ${idx.indexname}`));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await closePool();
  }
}

getSchemaInfo();
