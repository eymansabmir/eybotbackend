const { Client } = require('pg');

async function main() {
  const connectionString =
    process.env.DATABASE_URL || 'postgresql://postgres:123456@localhost:5432/eybot';
  const c = new Client({ connectionString });
  await c.connect();
  const v = await c.query('SELECT version()');
  console.log('version:', v.rows[0].version);
  try {
    await c.query('CREATE EXTENSION IF NOT EXISTS vector');
    const e = await c.query(
      "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'",
    );
    console.log('extension:', JSON.stringify(e.rows));
  } catch (err) {
    console.error('EXT_ERROR:', err.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error('CONN_ERROR:', err.message);
  process.exit(1);
});
