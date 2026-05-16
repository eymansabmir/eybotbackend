import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function initPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const isLocalConnection = (() => {
    try {
      const host = new URL(connectionString).hostname;
      return host === 'localhost' || host === '127.0.0.1' || host === '::1';
    } catch {
      return connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    }
  })();

  const pool = new pg.Pool({
    connectionString,
    ssl: isLocalConnection ? false : { rejectUnauthorized: false }
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

async function generateApiKey(orgId: string, name: string) {
  console.log(`\n🚀 Generating API Credentials for Org: ${orgId} (${name})`);

  const prisma = await initPrisma();

  // 1. Generate Unique App ID (Prefix + 16 chars)
  const appId = `roi_live_${crypto.randomBytes(8).toString('hex')}`;

  // 2. Generate Secure App Secret (32 chars)
  const appSecret = crypto.randomBytes(16).toString('hex');

  // 3. Hash the Secret for storage
  const appSecretHash = await bcrypt.hash(appSecret, 10);

  // 4. Save to Database
  try {
    await prisma.apiKey.create({
      data: {
        orgId,
        name,
        appId,
        appSecretHash,
        isActive: true,
      }
    });

    console.log('\n✅ API Credentials Created Successfully!');
    console.log('--------------------------------------------------');
    console.log(`App ID:      ${appId}`);
    console.log(`App Secret:  ${appSecret}`);
    console.log('--------------------------------------------------');
    console.log('⚠️ IMPORTANT: Save the App Secret now. It is hashed in our DB and CANNOT be retrieved later.');
    console.log('--------------------------------------------------\n');

  } catch (error) {
    console.error('❌ Failed to generate API Key:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get args from command line
const orgId = process.argv[2];
const name = process.argv[3] || 'Default API Key';

if (!orgId) {
  console.error('Usage: npx tsx src/scripts/generate-api-key.ts <orgId> [name]');
  process.exit(1);
}

generateApiKey(orgId, name);
