import ExcelJS from 'exceljs';

export type BulkImportError = {
  rowNumber: number;
  field: string;
  reason: string;
  suggestion: string;
};

export type ParsedImportRow = {
  rowNumber: number;
  values: Record<string, string>;
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export const normaliseImportHeader = (value: unknown) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[\s-]+/g, '_')
  .replace(/[^a-z0-9_]/g, '');

export const escapeImportCsv = (value: unknown) => {
  const raw = String(value ?? '');
  const safe = /^[=+\-@]/.test(raw.trimStart()) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const splitImportList = (value: unknown) => String(value ?? '')
  .split(/[;,\n]/)
  .map(item => item.trim())
  .filter(Boolean);

export const formatImportDate = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const isoMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const date = isoMatch
    ? new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
    : new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseCsvRecords = (text: string): string[][] => {
  const records: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(value);
      value = '';
    } else if (character === '\n') {
      row.push(value.replace(/\r$/, ''));
      records.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }

  if (value.length || row.length) {
    row.push(value.replace(/\r$/, ''));
    records.push(row);
  }
  return records.filter(record => record.some(cell => cell.trim()));
};

const validateHeaders = (headers: string[], expectedHeaders: string[]) => {
  const errors: BulkImportError[] = [];
  const canonical = headers.map(normaliseImportHeader);
  expectedHeaders.forEach(expected => {
    if (!canonical.includes(expected)) {
      errors.push({
        rowNumber: 1,
        field: expected,
        reason: `Required template column “${expected}” is missing.`,
        suggestion: 'Download a fresh template and keep the header row unchanged.',
      });
    }
  });
  const duplicates = canonical.filter((header, index) => canonical.indexOf(header) !== index);
  Array.from(new Set(duplicates.filter(Boolean))).forEach(header => errors.push({
    rowNumber: 1,
    field: header,
    reason: `Column “${header}” appears more than once.`,
    suggestion: 'Keep one column for each field.',
  }));
  return errors;
};

export const parseImportFile = async (
  file: File,
  expectedHeaders: string[],
): Promise<{ rows: ParsedImportRow[]; headerErrors: BulkImportError[] }> => {
  const extension = file.name.toLowerCase().split('.').pop();
  if (!['xlsx', 'csv'].includes(extension || '')) {
    throw new Error('Unsupported file type. Upload an .xlsx or .csv file.');
  }

  if (extension === 'csv') {
    const records = parseCsvRecords(await file.text());
    if (!records.length) throw new Error('The CSV file is empty.');
    const rawHeaders = records[0];
    const headers = rawHeaders.map(normaliseImportHeader);
    const headerErrors = validateHeaders(headers, expectedHeaders);
    const rows = records.slice(1).map((values, index) => ({
      rowNumber: index + 2,
      values: Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] || ''])),
    }));
    return { rows, headerErrors };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer() as any);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('The workbook has no worksheets.');

  const rawHeaders: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, cell => rawHeaders.push(cell.text));
  const headers = rawHeaders.map(normaliseImportHeader);
  const headerErrors = validateHeaders(headers, expectedHeaders);
  const rows: ParsedImportRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, string> = {};
    headers.forEach((header, index) => {
      values[header] = row.getCell(index + 1).text;
    });
    if (Object.values(values).some(value => String(value || '').trim())) rows.push({ rowNumber, values });
  });
  return { rows, headerErrors };
};

export const getImportValue = (values: Record<string, string>, ...aliases: string[]) => {
  for (const alias of aliases) {
    const value = values[normaliseImportHeader(alias)];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return '';
};

export const downloadImportCsvTemplate = (
  fileName: string,
  columns: string[],
  example: Record<string, unknown> = {},
) => {
  const lines = [
    columns.join(','),
    columns.map(column => escapeImportCsv(example[column] ?? '')).join(','),
  ];
  downloadBlob(
    new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }),
    fileName,
  );
};

export const downloadImportXlsxTemplate = async (options: {
  fileName: string;
  sheetName: string;
  columns: string[];
  instructions: Array<[string, string]>;
  example?: Record<string, unknown>;
  references?: Array<{ name: string; columns: string[]; rows: Array<Record<string, unknown>> }>;
}) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TNG HRIS';
  workbook.created = new Date();

  const instructionSheet = workbook.addWorksheet('Instructions', { views: [{ showGridLines: false }] });
  instructionSheet.columns = [{ width: 26 }, { width: 100 }];
  instructionSheet.addRows([['TNG HRIS', `${options.sheetName} bulk-upload template`], ...options.instructions]);
  instructionSheet.getRow(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  instructionSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  instructionSheet.getColumn(1).font = { bold: true };
  instructionSheet.eachRow(row => {
    row.alignment = { vertical: 'top', wrapText: true };
    row.height = Math.max(row.height || 15, 28);
  });

  const dataSheet = workbook.addWorksheet(options.sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
  dataSheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + Math.min(options.columns.length, 26))}1` };
  dataSheet.columns = options.columns.map(column => ({
    header: column,
    key: column,
    width: /description|content|notes/i.test(column) ? 48 : 23,
  }));
  dataSheet.addRow(options.example || {});
  dataSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  dataSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  dataSheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  dataSheet.getRow(1).height = 32;
  dataSheet.getRow(2).alignment = { vertical: 'top', wrapText: true };

  for (const reference of options.references || []) {
    const sheet = workbook.addWorksheet(reference.name, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = reference.columns.map(column => ({ header: column, key: column, width: 32 }));
    reference.rows.forEach(row => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    options.fileName,
  );
};

export const downloadImportErrorReport = (fileName: string, errors: BulkImportError[]) => {
  const columns = ['row_number', 'field', 'error_reason', 'suggested_correction'];
  const lines = [
    columns.join(','),
    ...errors.map(error => [error.rowNumber, error.field, error.reason, error.suggestion].map(escapeImportCsv).join(',')),
  ];
  downloadBlob(
    new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }),
    fileName,
  );
};

export const parseYesNo = (value: unknown, defaultValue = false) => {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return defaultValue;
  if (['yes', 'y', 'true', '1'].includes(text)) return true;
  if (['no', 'n', 'false', '0'].includes(text)) return false;
  return null;
};

export const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');
