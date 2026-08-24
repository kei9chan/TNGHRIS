import ExcelJS from 'exceljs';
import {
  BusinessUnit,
  DisciplineCategory,
  DisciplineEntry,
  DisciplineImportError,
  DisciplineImportMode,
  DisciplineImportResult,
  DisciplineImportRow,
  SeverityLevel,
} from '../types';
import { supabase } from './supabaseClient';

export const DISCIPLINE_IMPORT_COLUMNS = [
  'code',
  'category',
  'severity',
  'description',
  'sanction_1',
  'sanction_2',
  'sanction_3',
  'sanction_4',
  'sanction_5',
  'business_unit',
  'status',
] as const;

const REQUIRED_IMPORT_COLUMNS = ['code', 'category', 'severity', 'description'] as const;

export type DisciplineImportParseResult = {
  rows: DisciplineImportRow[];
  headerErrors: DisciplineImportError[];
};

export type DisciplineValidatedRow = DisciplineImportRow & {
  errors: DisciplineImportError[];
};

const templateExamples = (categories: DisciplineCategory[], businessUnits: BusinessUnit[]) => [
  {
    code: 'ATT-001',
    category: categories.find(category => category.isActive)?.name || 'Attendance',
    severity: 'Low',
    description: 'Example only: habitual tardiness within one cut-off period.',
    sanction_1: 'Verbal Warning',
    sanction_2: 'Written Warning',
    sanction_3: '1 Day Suspension',
    sanction_4: '3 Days Suspension',
    sanction_5: 'Final Warning',
    business_unit: businessUnits[0]?.name || '',
    status: 'Active',
  },
  {
    code: 'CON-001',
    category: categories.filter(category => category.isActive)[1]?.name || categories[0]?.name || 'Conduct',
    severity: 'High',
    description: 'Example only: serious violation of company conduct standards.',
    sanction_1: 'Written Warning',
    sanction_2: 'Suspension',
    sanction_3: 'Final Warning',
    sanction_4: 'Termination subject to HR/legal review',
    sanction_5: '',
    business_unit: '',
    status: 'Active',
  },
];

const escapeCsv = (value: unknown) => {
  const raw = String(value ?? '');
  // Prevent spreadsheet applications from treating imported user content as a formula.
  const text = /^[=+\-@]/.test(raw.trimStart()) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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

const normaliseHeader = (value: unknown) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[\s-]+/g, '_');

const normaliseRow = (source: Record<string, unknown>, rowNumber: number): DisciplineImportRow => {
  const result: DisciplineImportRow = {
    rowNumber,
    code: '',
    category: '',
    severity_level: '',
    description: '',
  };
  Object.entries(source).forEach(([key, value]) => {
    const header = normaliseHeader(key);
    const text = value == null ? '' : String(value).trim();
    if (header === 'severity' || header === 'severity_level') {
      result.severity_level = text;
    } else {
      result[header] = text;
    }
  });
  result.code = String(result.code || '').trim();
  result.category = String(result.category || '').trim();
  result.description = String(result.description || '').trim();
  return result;
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

const validateHeaders = (headers: string[]): DisciplineImportError[] => {
  const errors: DisciplineImportError[] = [];
  const canonicalHeaders = headers.map(normaliseHeader);
  const aliases = canonicalHeaders.map(header => header === 'severity_level' ? 'severity' : header);
  REQUIRED_IMPORT_COLUMNS.forEach(required => {
    if (!aliases.includes(required)) {
      errors.push({
        rowNumber: 1,
        code: '',
        field: required,
        reason: `Required column “${required}” is missing.`,
        suggestion: 'Download a fresh import template and keep the header row unchanged.',
      });
    }
  });
  aliases.forEach(header => {
    const isSanction = /^sanction_[1-5]$/.test(header);
    if (!DISCIPLINE_IMPORT_COLUMNS.includes(header as any) && !isSanction) {
      errors.push({
        rowNumber: 1,
        code: '',
        field: header,
        reason: `Column “${header}” is not supported.`,
        suggestion: `Use only: ${DISCIPLINE_IMPORT_COLUMNS.join(', ')}.`,
      });
    }
  });
  const duplicates = aliases.filter((header, index) => aliases.indexOf(header) !== index);
  Array.from(new Set(duplicates)).forEach(header => errors.push({
    rowNumber: 1,
    code: '',
    field: header,
    reason: `Column “${header}” appears more than once.`,
    suggestion: 'Keep one column for each field.',
  }));
  return errors;
};

export const downloadDisciplineCsvTemplate = (
  categories: DisciplineCategory[],
  businessUnits: BusinessUnit[],
) => {
  const rows = templateExamples(categories, businessUnits);
  const lines = [
    DISCIPLINE_IMPORT_COLUMNS.join(','),
    ...rows.map(row => DISCIPLINE_IMPORT_COLUMNS.map(column => escapeCsv((row as any)[column])).join(',')),
  ];
  downloadBlob(
    new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }),
    'TNG_Code_of_Discipline_Import_Template.csv',
  );
};

export const downloadDisciplineXlsxTemplate = async (
  categories: DisciplineCategory[],
  businessUnits: BusinessUnit[],
) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TNG HRIS';
  workbook.created = new Date();

  const instructionSheet = workbook.addWorksheet('Instructions', { views: [{ showGridLines: false }] });
  instructionSheet.columns = [{ width: 24 }, { width: 92 }];
  instructionSheet.addRows([
    ['TNG HRIS', 'Code of Discipline bulk-upload template'],
    ['How to use', 'Complete the “Code of Discipline” sheet, keep the header names unchanged, then upload this XLSX file in TNG HRIS. Delete the example rows before importing your final data.'],
    ['Required fields', 'code, category, severity, description'],
    ['Optional fields', 'sanction_1 through sanction_5, business_unit, status'],
    ['Severity values', Object.values(SeverityLevel).join(', ')],
    ['Status values', 'Active, Inactive'],
    ['Category values', categories.filter(category => category.isActive).map(category => category.name).join(', ') || 'Create an active category in Manage Categories first.'],
    ['Business unit', 'Leave blank for a company-wide rule, or enter an exact active TNG HRIS business-unit name/code.'],
    ['Import modes', 'Add new entries only; Update matching entries; Add and update. Existing records are never overwritten without your chosen mode and confirmation.'],
    ['Progressive sanctions', 'Enter sanctions from sanction_1 onward without gaps. More levels can be added later in the entry editor.'],
  ]);
  instructionSheet.getRow(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  instructionSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  instructionSheet.getColumn(1).font = { bold: true };
  instructionSheet.eachRow(row => {
    row.alignment = { vertical: 'top', wrapText: true };
    row.height = Math.max(row.height || 15, 28);
  });

  const dataSheet = workbook.addWorksheet('Code of Discipline', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  dataSheet.autoFilter = { from: 'A1', to: 'K1' };
  dataSheet.columns = DISCIPLINE_IMPORT_COLUMNS.map(column => ({
    header: column,
    key: column,
    width: column === 'description' ? 52 : column.startsWith('sanction') ? 24 : 20,
  }));
  templateExamples(categories, businessUnits).forEach(row => dataSheet.addRow(row));
  dataSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  dataSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  dataSheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  dataSheet.getRow(1).height = 26;
  dataSheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.alignment = { vertical: 'top', wrapText: true };
  });
  for (let rowNumber = 2; rowNumber <= 5001; rowNumber += 1) {
    dataSheet.getCell(`C${rowNumber}`).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"Low,Medium,High,Critical"'],
      showErrorMessage: true,
      errorTitle: 'Invalid severity',
      error: 'Choose Low, Medium, High, or Critical.',
    };
    dataSheet.getCell(`K${rowNumber}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Active,Inactive"'],
      showErrorMessage: true,
      errorTitle: 'Invalid status',
      error: 'Choose Active or Inactive.',
    };
  }

  const referenceSheet = workbook.addWorksheet('Reference Data', { views: [{ state: 'frozen', ySplit: 1 }] });
  referenceSheet.columns = [
    { header: 'Accepted Categories', key: 'category', width: 34 },
    { header: 'Accepted Severities', key: 'severity', width: 24 },
    { header: 'Business Units', key: 'businessUnit', width: 42 },
    { header: 'Business Unit Codes', key: 'businessUnitCode', width: 24 },
    { header: 'Accepted Status', key: 'status', width: 22 },
  ];
  const referenceLength = Math.max(categories.length, Object.values(SeverityLevel).length, businessUnits.length, 2);
  for (let index = 0; index < referenceLength; index += 1) {
    referenceSheet.addRow({
      category: categories.filter(category => category.isActive)[index]?.name || '',
      severity: Object.values(SeverityLevel)[index] || '',
      businessUnit: businessUnits[index]?.name || '',
      businessUnitCode: businessUnits[index]?.code || '',
      status: ['Active', 'Inactive'][index] || '',
    });
  }
  referenceSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  referenceSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    'TNG_Code_of_Discipline_Import_Template.xlsx',
  );
};

export const parseDisciplineImportFile = async (file: File): Promise<DisciplineImportParseResult> => {
  const extension = file.name.toLowerCase().split('.').pop();
  if (!['xlsx', 'csv'].includes(extension || '')) {
    throw new Error('Unsupported file type. Upload an .xlsx or .csv file.');
  }

  if (extension === 'csv') {
    const records = parseCsvRecords(await file.text());
    if (!records.length) throw new Error('The CSV file is empty.');
    const headers = records[0].map(normaliseHeader);
    const headerErrors = validateHeaders(headers);
    const rows = records.slice(1).map((values, index) => {
      const source = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] || '']));
      return normaliseRow(source, index + 2);
    });
    return { rows, headerErrors };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer() as any);
  const worksheet = workbook.getWorksheet('Code of Discipline') || workbook.worksheets[0];
  if (!worksheet) throw new Error('The workbook has no worksheets.');
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, cell => headers.push(normaliseHeader(cell.text)));
  const headerErrors = validateHeaders(headers);
  const rows: DisciplineImportRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const source: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      source[header] = row.getCell(index + 1).text;
    });
    if (Object.values(source).some(value => String(value || '').trim())) {
      rows.push(normaliseRow(source, rowNumber));
    }
  });
  return { rows, headerErrors };
};

const error = (
  row: DisciplineImportRow,
  field: string,
  reason: string,
  suggestion: string,
): DisciplineImportError => ({ rowNumber: row.rowNumber, code: row.code, field, reason, suggestion });

export const validateDisciplineImportRows = (
  rows: DisciplineImportRow[],
  categories: DisciplineCategory[],
  businessUnits: BusinessUnit[],
  existingEntries: DisciplineEntry[],
  mode: DisciplineImportMode,
): DisciplineValidatedRow[] => {
  const activeCategories = new Map(categories
    .filter(category => category.isActive)
    .map(category => [category.name.trim().toLowerCase(), category.name]));
  const businessUnitValues = new Set(businessUnits.flatMap(unit => [unit.id, unit.name, unit.code || ''].filter(Boolean).map(value => value.toLowerCase())));
  const existingByCode = new Map(existingEntries.map(entry => [entry.code.trim().toLowerCase(), entry]));
  const existingDescriptions = new Map(existingEntries.map(entry => [
    `${entry.category.trim().toLowerCase()}::${entry.description.trim().toLowerCase()}`,
    entry,
  ]));
  const uploadCodeCounts = rows.reduce<Record<string, number>>((counts, row) => {
    const code = row.code.trim().toLowerCase();
    if (code) counts[code] = (counts[code] || 0) + 1;
    return counts;
  }, {});

  return rows.map(row => {
    const errors: DisciplineImportError[] = [];
    const code = row.code.trim();
    const category = row.category.trim();
    const severity = String(row.severity_level || '').trim();
    const description = row.description.trim();
    const status = String(row.status || 'Active').trim();
    if (!code) errors.push(error(row, 'code', 'Code is required.', 'Enter a unique discipline code.'));
    if (!category) errors.push(error(row, 'category', 'Category is required.', 'Choose an active category from Reference Data.'));
    else if (!activeCategories.has(category.toLowerCase())) errors.push(error(row, 'category', `Category “${category}” does not exist or is inactive.`, 'Create/activate the category or use an accepted category name.'));
    if (!Object.values(SeverityLevel).some(value => value.toLowerCase() === severity.toLowerCase())) {
      errors.push(error(row, 'severity', `Severity “${severity || '(blank)'}” is invalid.`, 'Use Low, Medium, High, or Critical.'));
    }
    if (!description) errors.push(error(row, 'description', 'Description is required.', 'Enter the rule or infraction description.'));
    if (!['active', 'inactive'].includes(status.toLowerCase())) errors.push(error(row, 'status', `Status “${status}” is invalid.`, 'Use Active or Inactive.'));
    if (row.business_unit && !businessUnitValues.has(String(row.business_unit).trim().toLowerCase())) {
      errors.push(error(row, 'business_unit', `Business unit “${row.business_unit}” was not found.`, 'Use an exact business-unit name/code from Reference Data or leave blank.'));
    }
    if (code && uploadCodeCounts[code.toLowerCase()] > 1) {
      errors.push(error(row, 'code', 'This code appears more than once in the upload.', 'Keep one row per code.'));
    }
    const existing = existingByCode.get(code.toLowerCase());
    if (existing && mode === 'add_only') errors.push(error(row, 'code', 'This code already exists.', 'Use Update matching entries or Add and update.'));
    if (!existing && mode === 'update_only') errors.push(error(row, 'code', 'No matching code exists to update.', 'Use Add and update or Add new entries only.'));
    const duplicateDescription = existingDescriptions.get(`${category.toLowerCase()}::${description.toLowerCase()}`);
    if (description && duplicateDescription && duplicateDescription.code.toLowerCase() !== code.toLowerCase()) {
      errors.push(error(row, 'description', `A similar entry already exists as ${duplicateDescription.code}.`, 'Confirm that this is not a duplicate rule.'));
    }

    let encounteredGap = false;
    for (let index = 1; index <= 5; index += 1) {
      const value = String(row[`sanction_${index}`] || '').trim();
      if (!value) encounteredGap = true;
      else if (encounteredGap) errors.push(error(row, `sanction_${index}`, 'Sanction levels contain a gap.', 'Fill sanctions in order, beginning with sanction_1.'));
    }
    return { ...row, errors };
  });
};

export const importDisciplineRows = async (
  rows: DisciplineImportRow[],
  mode: DisciplineImportMode,
  fileName: string,
): Promise<DisciplineImportResult> => {
  const payload = rows.map(({ rowNumber, ...row }) => ({
    ...row,
    source_row_number: rowNumber,
    severity: row.severity_level,
  }));
  const { data, error: rpcError } = await supabase.rpc('bulk_import_discipline_entries', {
    p_rows: payload,
    p_mode: mode,
    p_file_name: fileName,
  });
  if (rpcError) throw new Error(rpcError.message || 'The import could not be completed.');
  return data as DisciplineImportResult;
};

export const downloadDisciplineErrorReport = (errors: DisciplineImportError[]) => {
  const headers = ['row_number', 'code', 'failed_field', 'error_reason', 'suggested_correction'];
  const lines = [
    headers.join(','),
    ...errors.map(item => [item.rowNumber, item.code, item.field, item.reason, item.suggestion].map(escapeCsv).join(',')),
  ];
  downloadBlob(
    new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }),
    `TNG_Discipline_Import_Errors_${new Date().toISOString().slice(0, 10)}.csv`,
  );
};
