const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const connectionString =
    process.env.DATABASE_URL || 'postgresql://postgres:123456@localhost:5432/eybot';
  const sqlPath = path.join(
    __dirname,
    '..',
    'prisma',
    'migrations',
    '20260803120000_add_ms_knowledge_chunks_pgvector',
    'migration.sql',
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const c = new Client({ connectionString });
  await c.connect();
  try {
    await c.query(sql);
    const check = await c.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'ms_knowledge_chunks'`,
    );
    console.log('ms_knowledge_chunks exists:', check.rows[0].n === 1);
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
