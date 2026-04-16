import type { IStoragePlugin } from '../../../plugins/storage';
import { parseTabularRows } from '../../../utils/tabular-parser';
import { getOperators, inferType } from '../domain/attribute-inference';
import type { IEntityRepository } from '../data/entity.repository';

export class IngestionService {
  constructor(
    private readonly entityRepo: IEntityRepository,
    private readonly storagePlugin: IStoragePlugin,
  ) {}

  async process(input: {
    tenantId: string;
    entityType: string;
    records: Record<string, unknown>[];
  }): Promise<{ inserted: number; entityTypeId: string }> {
    await this.entityRepo.invalidateEntityTypeCache(input.tenantId, input.entityType);
    await this.entityRepo.invalidateAttributesCache(input.tenantId, input.entityType);

    const entityTypeRecord = await this.entityRepo.ensureEntityType(input.tenantId, input.entityType);

    // Normalize: produce flat records with lowercase dot-notation keys.
    // e.g. { "Location.City": "Delhi" } → { "location.city": "Delhi" }
    const normalizedRecords = input.records
      .map((record) => this.normalize(record))
      .filter((record) => Object.keys(record).length > 0);

    const attributeMap = this.collectAttributes(normalizedRecords);
    await this.updateAttributes(input.tenantId, entityTypeRecord.id, attributeMap);
    await this.entityRepo.createManyEntities({
      tenantId: input.tenantId,
      entityTypeId: entityTypeRecord.id,
      records: normalizedRecords,
    });

    await this.entityRepo.invalidateEntityTypeCache(input.tenantId, input.entityType);
    await this.entityRepo.invalidateAttributesCache(input.tenantId, input.entityType);

    return {
      inserted: normalizedRecords.length,
      entityTypeId: entityTypeRecord.id,
    };
  }

  async processFromFile(input: {
    tenantId: string;
    entityType: string;
    filePath: string;
  }): Promise<{ inserted: number; entityTypeId: string }> {
    const buffer = await this.storagePlugin.downloadFile(input.filePath);
    const rows = await parseTabularRows(buffer, input.filePath);
    const records = rows.map((row) => row as Record<string, unknown>);

    return this.process({
      tenantId: input.tenantId,
      entityType: input.entityType,
      records,
    });
  }

  /**
   * Normalize a record into a flat object with lowercase dot-notation keys.
   * Keys are lowercased so they match query conditions case-insensitively at
   * the schema level. Values are stored as their original parsed types;
   * LOWER()/TRIM() in the query covers runtime case/whitespace differences.
   */
  private normalize(record: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
      // Normalize key: trim whitespace, lowercase
      const normalizedKey = key.trim().toLowerCase();
      if (!normalizedKey || value == null) {
        continue;
      }

      if (typeof value === 'number' || typeof value === 'boolean') {
        result[normalizedKey] = value;
        continue;
      }

      const text = String(value).trim();
      if (!text) {
        continue;
      }

      if (text === 'true' || text === 'false') {
        result[normalizedKey] = text === 'true';
        continue;
      }

      if (!Number.isNaN(Number(text)) && text !== '') {
        result[normalizedKey] = Number(text);
        continue;
      }

      const parsedDate = Date.parse(text);
      if (!Number.isNaN(parsedDate) && isNaN(Number(text))) {
        result[normalizedKey] = new Date(parsedDate).toISOString();
        continue;
      }

      result[normalizedKey] = text;
    }

    return result;
  }

  /**
   * Collect all attribute keys and their sample values from normalized records.
   * Since records are already flat, we just iterate top-level keys.
   */
  private collectAttributes(records: Record<string, unknown>[]): Record<string, unknown[]> {
    const map: Record<string, unknown[]> = {};

    for (const record of records) {
      for (const [key, value] of Object.entries(record)) {
        if (!map[key]) map[key] = [];
        if (map[key]!.length < 100) map[key]!.push(value);
      }
    }

    return map;
  }

  private async updateAttributes(
    tenantId: string,
    entityTypeId: string,
    attributeMap: Record<string, unknown[]>,
  ): Promise<void> {
    for (const [key, values] of Object.entries(attributeMap)) {
      const type = inferType(values);
      const enumValues = type === 'enum'
        ? [...new Set(values.map((value) => String(value).trim()).filter((value) => value !== ''))]
        : null;

      await this.entityRepo.upsertAttribute({
        tenantId,
        entityTypeId,
        key,
        type,
        operators: getOperators(type),
        values: enumValues,
      });
    }
  }
}
