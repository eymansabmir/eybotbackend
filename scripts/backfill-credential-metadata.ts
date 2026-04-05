const pg = require('pg');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

type PhoneMapping = Record<string, string>;

function parseArgs(): { mappingPath?: string } {
  const args = process.argv.slice(2);
  const mappingFlagIndex = args.findIndex((arg) => arg === '--mapping');
  if (mappingFlagIndex === -1) {
    return {};
  }

  const mappingPath = args[mappingFlagIndex + 1];
  return { mappingPath };
}

function loadMapping(filePath: string): PhoneMapping {
  const resolved = path.resolve(process.cwd(), filePath);
  const content = fs.readFileSync(resolved, 'utf8');
  const parsed = JSON.parse(content) as unknown;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Mapping JSON must be an object: { "phoneNumberId": "+15551234567" }');
  }

  const mapping: PhoneMapping = {};
  for (const [phoneNumberId, displayPhoneNumber] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof displayPhoneNumber !== 'string' || displayPhoneNumber.trim().length === 0) {
      continue;
    }
    mapping[String(phoneNumberId)] = displayPhoneNumber.trim();
  }
  return mapping;
}

async function main() {
  const { mappingPath } = parseArgs();
  if (!mappingPath) {
    console.error('Usage: ts-node scripts/backfill-credential-metadata.ts --mapping <path-to-json>');
    console.error('Example mapping JSON: { "986914541176866": "+15551234567" }');
    process.exitCode = 1;
    return;
  }

  const mapping = loadMapping(mappingPath);
  if (Object.keys(mapping).length === 0) {
    console.error('No valid mapping entries found. Nothing to backfill.');
    process.exitCode = 1;
    return;
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    const res = await pool.query(`
      SELECT id, name, metadata
      FROM "credentials"
      WHERE type = 'WHATSAPP_CLOUD'
    `);

    let updated = 0;
    for (const row of res.rows as Array<{ id: string; name: string; metadata: Record<string, unknown> | null }>) {
      const metadata = row.metadata ?? {};
      const phoneNumberId = typeof metadata.phoneNumberId === 'string' ? metadata.phoneNumberId : '';
      if (!phoneNumberId) continue;

      const displayPhoneNumber = mapping[phoneNumberId];
      if (!displayPhoneNumber) continue;

      await pool.query(
        `
          UPDATE "credentials"
          SET metadata = jsonb_set(
            COALESCE(metadata, '{}')::jsonb,
            '{displayPhoneNumber}',
            to_jsonb($1::text)
          )
          WHERE id = $2
        `,
        [displayPhoneNumber, row.id],
      );

      updated += 1;
      console.log(`Updated ${row.name} (${row.id}) -> ${displayPhoneNumber}`);
    }

    if (updated === 0) {
      console.log('No credentials were updated. Check mapping file and stored phoneNumberId values.');
    } else {
      console.log(`Backfill complete. Updated ${updated} credential(s).`);
    }
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
