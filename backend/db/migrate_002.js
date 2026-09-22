require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function migrate() {
  const sqlPath = path.join(__dirname, 'migration_002_products_sales.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Aplicando migração 002 (produtos, vendas, remoção de CPF)...');
  try {
    await pool.query(sql);
    console.log('✅ Migração 002 concluída com sucesso.');
  } catch (err) {
    console.error('❌ Erro ao aplicar a migração 002:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
