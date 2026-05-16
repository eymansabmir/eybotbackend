import { Readable } from 'node:stream';
import path from 'node:path';
import csvParser from 'csv-parser';
import ExcelJS from 'exceljs';

export type ParsedRow = Record<string, unknown>;

function normalizeCellValue(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === 'object' && 'result' in value) {
    return value.result;
  }

  return value;
}

function toNormalizedHeader(value: unknown): string {
  // Use a simple, non-greedy replacement strategy to avoid catastrophic backtracking
  let str = String(value ?? '').trim().toLowerCase();
  
  // Replace non-alphanumeric with underscore (safe)
  str = str.replace(/[^a-z0-9]/g, '_');
  
  // Collapse multiple underscores using a non-recursive approach
  str = str.split('_').filter(Boolean).join('_');
  
  return str;
}



export async function streamTabularRows(
  stream: NodeJS.ReadableStream,
  fileName: string,
  onBatch: (rows: ParsedRow[]) => Promise<void>,
  batchSize = 1000
): Promise<void> {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === '.csv') {
    return new Promise((resolve, reject) => {
      let batch: ParsedRow[] = [];
      const parser = stream.pipe(csvParser());

      parser.on('data', async (row: Record<string, unknown>) => {
        const normalized: ParsedRow = {};
        Object.entries(row).forEach(([key, value]) => {
          const header = toNormalizedHeader(key);
          if (header) normalized[header] = value;
        });

        if (Object.values(normalized).some(v => v != null && String(v).trim() !== '')) {
          batch.push(normalized);
          if (batch.length >= batchSize) {
            parser.pause();
            try {
              await onBatch(batch);
              batch = [];
              parser.resume();
            } catch (err) {
              reject(err);
            }
          }
        }
      });

      parser.on('end', async () => {
        if (batch.length > 0) {
          try {
            await onBatch(batch);
          } catch (err) {
            return reject(err);
          }
        }
        resolve();
      });

      parser.on('error', reject);
    });
  }

  if (extension === '.xlsx' || extension === '.xls') {
    const workbook = new ExcelJS.Workbook();
    // exceljs streaming reader is actually for writing. For reading large files, 
    // it's best to use the workbook.xlsx.read stream if available or similar.
    // However, to keep it simple and relatively efficient:
    await workbook.xlsx.read(stream as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error('Sheet not found');

    const headerRow = worksheet.getRow(1);
    const headerValues = Array.isArray(headerRow.values) ? headerRow.values : Object.values(headerRow.values);
    const headers: string[] = headerValues
      .slice(1)
      .map((value: ExcelJS.CellValue) => toNormalizedHeader(normalizeCellValue(value)));

    let batch: ParsedRow[] = [];
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const parsed: ParsedRow = {};

      headers.forEach((header: string, index: number) => {
        if (header) parsed[header] = normalizeCellValue(row.getCell(index + 1).value);
      });

      if (Object.values(parsed).some(v => v != null && String(v).trim() !== '')) {
        batch.push(parsed);
        if (batch.length >= batchSize) {
          await onBatch(batch);
          batch = [];
        }
      }
    }

    if (batch.length > 0) {
      await onBatch(batch);
    }
    return;
  }

  throw new Error(`Unsupported file format '${extension}'`);
}

export async function parseTabularRows(buffer: Buffer, filePathOrName: string): Promise<ParsedRow[]> {
  const rows: ParsedRow[] = [];
  await streamTabularRows(Readable.from(buffer), filePathOrName, async (batch) => {
    rows.push(...batch);
  }, 1000000); // effectively no batching
  return rows;
}
