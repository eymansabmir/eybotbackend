const { Client } = require('pg');

async function main() {
  const connectionString =
    process.env.DATABASE_URL || 'postgresql://postgres:123456@localhost:5432/eybot';
  const c = new Client({ connectionString });
  await c.connect();
  try {
    const tables = await c.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('activity_logs', 'ms_knowledge_chunks')
       ORDER BY table_name`,
    );
    console.log('tables:', tables.rows.map((r) => r.table_name));

    const failed = await c.query(
      `SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
       FROM "_prisma_migrations"
       WHERE migration_name = '20260717120000_add_activity_logs'`,
    );
    console.log('migration row:', failed.rows[0] || null);
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
