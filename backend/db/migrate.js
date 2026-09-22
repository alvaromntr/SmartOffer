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
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('Aplicando schema.sql no banco de dados...');
  try {
    await pool.query(sql);
    console.log('✅ Migração concluída com sucesso.');
  } catch (err) {
    console.error('❌ Erro ao aplicar a migração:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
