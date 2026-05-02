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

function toTrimmedHeader(value: unknown): string {
  return String(value ?? '').trim();
}

async function parseCsvRows(buffer: Buffer): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const rows: ParsedRow[] = [];

    Readable.from(buffer)
      .pipe(csvParser())
      .on('data', (row: Record<string, unknown>) => {
        const normalized: ParsedRow = {};
        Object.entries(row).forEach(([key, value]) => {
          const header = toTrimmedHeader(key);
          if (!header) {
            return;
          }
          normalized[header] = value;
        });

        const hasValue = Object.values(normalized).some(
          (value) => value != null && String(value).trim() !== '',
        );

        if (hasValue) {
          rows.push(normalized);
        }
      })
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

async function parseXlsxRows(buffer: Buffer): Promise<ParsedRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Sheet not found in XLSX file');
  }

  const headerRow = worksheet.getRow(1);
  const headerValues = Array.isArray(headerRow.values) ? headerRow.values : Object.values(headerRow.values);
  const headers: string[] = headerValues
    .slice(1)
    .map((value: ExcelJS.CellValue) => toTrimmedHeader(normalizeCellValue(value)));

  const rows: ParsedRow[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const parsed: ParsedRow = {};

    headers.forEach((header: string, index: number) => {
      if (!header) {
        return;
      }

      const cellValue = row.getCell(index + 1).value;
      parsed[header] = normalizeCellValue(cellValue);
    });

    const hasValue = Object.values(parsed).some(
      (value) => value != null && String(value).trim() !== '',
    );

    if (hasValue) {
      rows.push(parsed);
    }
  }

  return rows;
}

export async function parseTabularRows(buffer: Buffer, filePathOrName: string): Promise<ParsedRow[]> {
  const extension = path.extname(filePathOrName).toLowerCase();

  if (extension === '.csv') {
    return parseCsvRows(buffer);
  }

  if (extension === '.xlsx' || extension === '.xls') {
    return parseXlsxRows(buffer);
  }

  throw new Error(`Unsupported file format '${extension}'. Use .csv, .xls, or .xlsx`);
}
