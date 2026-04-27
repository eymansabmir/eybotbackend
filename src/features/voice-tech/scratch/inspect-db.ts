
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({
  connectionString,
  ssl: false
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const tenantId = 'tenant-ey-001';
  const config = await (prisma as any).routingConfig.findFirst({
    where: { tenantId, name: 'test' },
    include: {
      rules: { orderBy: { priority: 'asc' } },
      entityType: true,
    }
  });

  if (!config) {
    console.log('Config not found');
    return;
  }

  const allEvents = await (prisma as any).voiceOrchestrationEvent.findMany({
    where: { tenantId, routingConfigId: config.id },
  });

  const providers = await (prisma as any).voiceProvider.findMany({ where: { tenantId } });
  const providerMap = new Map<string, string>(providers.map((p: any) => [p.id, p.providerName]));

  const ruleToProviderMap = new Map<string, string>();
  config.rules.forEach((rule: any) => {
    let name = 'unknown';
    if (rule.voiceProviderId && providerMap.has(rule.voiceProviderId)) {
      name = providerMap.get(rule.voiceProviderId)!;
    } else if (rule.action?.voiceProvider) {
      name = rule.action.voiceProvider;
    }
    ruleToProviderMap.set(rule.id, name.toLowerCase());
  });

  const providerGroups = new Map<string, any[]>();
  const providerEvents = allEvents.filter(e => e.step === 'STEP_9_PROVIDER_RESULT');

  providerEvents.forEach((e: any) => {
    let providerName = e.matchedRuleId ? ruleToProviderMap.get(e.matchedRuleId) : null;
    if (!providerName && e.voiceProviderId && providerMap.has(e.voiceProviderId)) {
      providerName = providerMap.get(e.voiceProviderId)!.toLowerCase();
    }
    if (!providerName) {
      const metadata = (e.metadata || {}) as any;
      providerName = (metadata?.voiceProvider || metadata?.provider || 'unknown').toLowerCase();
    }
    
    if (!providerName) providerName = 'unknown';

    if (!providerGroups.has(providerName)) providerGroups.set(providerName, []);
    providerGroups.get(providerName)!.push(e);
  });

  console.log('--- Provider Breakdown ---');
  for (const [name, events] of providerGroups.entries()) {
    console.log(`${name}: ${events.length} events`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
