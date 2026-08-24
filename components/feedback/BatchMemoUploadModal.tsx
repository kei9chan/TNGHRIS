import React, { useEffect, useMemo, useState } from 'react';
import { BusinessUnit, Department, User } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { supabase } from '../../services/supabaseClient';
import { fetchBusinessUnits, fetchDepartments, fetchUsers } from '../../services/userService';
import {
  BulkImportError,
  downloadImportCsvTemplate,
  downloadImportErrorReport,
  downloadImportXlsxTemplate,
  escapeHtml,
  formatImportDate,
  getImportValue,
  parseImportFile,
  parseYesNo,
  ParsedImportRow,
  splitImportList,
} from '../../services/bulkImportUtils';

export const MEMO_IMPORT_COLUMNS = [
  'memo_title',
  'memo_number',
  'memo_type',
  'description',
  'full_memo_content',
  'business_unit',
  'department',
  'target_audience',
  'employee_ids',
  'employee_emails',
  'effective_date',
  'effective_year',
  'effective_month',
  'publication_date',
  'status',
  'tags',
  'requires_acknowledgement',
  'attachment_filename',
  'notes',
] as const;

type MemoImportRow = ParsedImportRow & {
  errors: BulkImportError[];
  payload?: Record<string, unknown>;
  displayAudience?: string;
  displayAttachments?: string;
};

type ImportSummary = {
  total_rows: number;
  imported_rows: number;
  published_rows: number;
  failed_rows: number;
  duplicate_rows: number;
  invalid_employee_rows: number;
  missing_required_rows: number;
};

interface BatchMemoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => Promise<void> | void;
}

const lower = (value: unknown) => String(value ?? '').trim().toLowerCase();

const addError = (
  errors: BulkImportError[],
  row: ParsedImportRow,
  field: string,
  reason: string,
  suggestion: string,
) => errors.push({ rowNumber: row.rowNumber, field, reason, suggestion });

const findBusinessUnit = (value: string, businessUnits: BusinessUnit[]) => {
  const key = lower(value);
  return businessUnits.find(unit => [unit.id, unit.name, unit.code].some(candidate => lower(candidate) === key));
};

const findDepartment = (value: string, departments: Department[]) => {
  const key = lower(value);
  return departments.find(department => [department.id, department.name].some(candidate => lower(candidate) === key));
};

const findEmployee = (value: string, employees: User[]) => {
  const key = lower(value);
  return employees.find(employee => [employee.id, employee.employeeId, employee.email]
    .some(candidate => lower(candidate) === key));
};

const memoNumberPattern = /^MEMO-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{4}-\d{3,}$/i;

const validateMemoRows = (
  parsedRows: ParsedImportRow[],
  employees: User[],
  businessUnits: BusinessUnit[],
  departments: Department[],
  existingMemoNumbers: Set<string>,
  attachmentFiles: File[],
): MemoImportRow[] => {
  const attachmentLookup = new Map(attachmentFiles.map(file => [lower(file.name), file]));
  const memoNumbers = new Map<string, number>();

  parsedRows.forEach(row => {
    const number = lower(getImportValue(row.values, 'memo_number'));
    if (number) memoNumbers.set(number, (memoNumbers.get(number) || 0) + 1);
  });

  return parsedRows.map(row => {
    const errors: BulkImportError[] = [];
    const title = getImportValue(row.values, 'memo_title', 'title');
    const memoNumber = getImportValue(row.values, 'memo_number');
    const memoType = getImportValue(row.values, 'memo_type') || 'General';
    const description = getImportValue(row.values, 'description', 'summary');
    const content = getImportValue(row.values, 'full_memo_content', 'memo_content', 'body');
    const businessUnitInputs = splitImportList(getImportValue(row.values, 'business_unit', 'business_units'));
    const departmentInputs = splitImportList(getImportValue(row.values, 'department', 'departments'));
    const audience = lower(getImportValue(row.values, 'target_audience'));
    const employeeInputs = [
      ...splitImportList(getImportValue(row.values, 'employee_ids')),
      ...splitImportList(getImportValue(row.values, 'employee_emails')),
    ];
    const effectiveDateValue = getImportValue(row.values, 'effective_date');
    const effectiveDate = formatImportDate(effectiveDateValue)
      || (getImportValue(row.values, 'effective_year') && getImportValue(row.values, 'effective_month')
        ? formatImportDate(`${getImportValue(row.values, 'effective_year')}-${getImportValue(row.values, 'effective_month')}-01`)
        : null);
    const publicationDateValue = getImportValue(row.values, 'publication_date');
    const publicationDate = publicationDateValue ? formatImportDate(publicationDateValue) : null;
    const status = getImportValue(row.values, 'status') || 'Draft';
    const ack = parseYesNo(getImportValue(row.values, 'requires_acknowledgement'), false);
    const attachmentNames = splitImportList(getImportValue(row.values, 'attachment_filename', 'attachment_filenames'));

    if (!title) addError(errors, row, 'memo_title', 'Memo title is required.', 'Enter the title displayed in Memo Library.');
    if (!memoNumber) addError(errors, row, 'memo_number', 'Memo number is required for batch imports.', 'Use the existing format, for example MEMO-HR-TDM-2026-001.');
    else if (!memoNumberPattern.test(memoNumber)) addError(errors, row, 'memo_number', `Memo number “${memoNumber}” does not match the existing format.`, 'Use MEMO-<AREA>-<BU>-<YEAR>-<SEQUENCE>, such as MEMO-HR-TDM-2026-001.');
    if (memoNumber && (existingMemoNumbers.has(lower(memoNumber)) || (memoNumbers.get(lower(memoNumber)) || 0) > 1)) {
      addError(errors, row, 'memo_number', 'This memo number already exists or appears more than once in the upload.', 'Keep memo numbers unique before importing.');
    }
    if (!content && !description) addError(errors, row, 'full_memo_content', 'Memo content or description is required.', 'Enter full memo content, or provide a description/summary.');
    if (!effectiveDate) addError(errors, row, 'effective_date', 'A valid effective date is required.', 'Use YYYY-MM-DD, or provide effective_year and effective_month.');
    if (publicationDateValue && !publicationDate) addError(errors, row, 'publication_date', `Publication date “${publicationDateValue}” is invalid.`, 'Use YYYY-MM-DD or a valid spreadsheet date.');
    if (ack === null) addError(errors, row, 'requires_acknowledgement', 'Requires acknowledgement must be Yes or No.', 'Use Yes or No.');
    if (!['draft', 'published', 'archived'].includes(lower(status))) addError(errors, row, 'status', `Status “${status}” is invalid.`, 'Use Draft, Published, or Archived.');

    const targetBusinessUnits: string[] = [];
    businessUnitInputs.forEach(input => {
      if (lower(input) === 'all' || lower(input) === 'all employees') return;
      const unit = findBusinessUnit(input, businessUnits);
      if (!unit) addError(errors, row, 'business_unit', `Business unit “${input}” was not found.`, 'Use an active business-unit name, code, or ID.');
      else if (!targetBusinessUnits.includes(unit.name)) targetBusinessUnits.push(unit.name);
    });
    const targetDepartments: string[] = [];
    departmentInputs.forEach(input => {
      if (lower(input) === 'all' || lower(input) === 'all departments') return;
      const department = findDepartment(input, departments);
      if (!department) addError(errors, row, 'department', `Department “${input}” was not found.`, 'Use an active department name or ID.');
      else if (!targetDepartments.includes(department.name)) targetDepartments.push(department.name);
    });
    const allAudience = ['all', 'all employees', 'company-wide', 'company wide'].includes(audience);
    if (allAudience || (!businessUnitInputs.length && !departmentInputs.length && !employeeInputs.length)) {
      targetBusinessUnits.splice(0, targetBusinessUnits.length, 'All');
      targetDepartments.splice(0, targetDepartments.length, 'All');
    } else if (businessUnitInputs.some(input => ['all', 'all employees'].includes(lower(input)))) {
      targetBusinessUnits.splice(0, targetBusinessUnits.length, 'All');
    }
    if (departmentInputs.some(input => ['all', 'all departments'].includes(lower(input)))) {
      targetDepartments.splice(0, targetDepartments.length, 'All');
    }
    if (!targetBusinessUnits.length && !targetDepartments.length && !employeeInputs.length) {
      addError(errors, row, 'target_audience', 'At least one business unit, department, employee ID/email, or All target is required.', 'Use All for an all-employee memo.');
    }

    const targetEmployeeIds: string[] = [];
    employeeInputs.forEach(input => {
      const employee = findEmployee(input, employees);
      if (!employee) {
        addError(errors, row, 'employee_ids', `Employee identifier “${input}” was not found.`, 'Use an employee ID or email; names alone are not accepted.');
      } else if (employee.status !== 'Active') {
        addError(errors, row, 'employee_ids', `Employee “${input}” is not active.`, 'Target an active employee.');
      } else if (!targetEmployeeIds.includes(employee.id)) {
        targetEmployeeIds.push(employee.id);
      }
    });

    const missingAttachments = attachmentNames.filter(name => !attachmentLookup.has(lower(name)));
    missingAttachments.forEach(name => addError(errors, row, 'attachment_filename', `Attachment “${name}” was not selected.`, 'Choose the supporting file with the exact filename before importing.'));
    const attachmentPaths = attachmentNames.map(name => lower(name));
    const body = content || `<p>${escapeHtml(description)}</p>`;
    const payload = effectiveDate && ack !== null ? {
      title,
      memo_number: memoNumber,
      memo_type: memoType,
      body,
      target_business_units: targetBusinessUnits,
      target_departments: targetDepartments,
      target_employee_ids: targetEmployeeIds,
      effective_date: effectiveDate,
      publication_date: publicationDate,
      status: lower(status) === 'published' ? 'Published' : lower(status) === 'archived' ? 'Archived' : 'Draft',
      tags: splitImportList(getImportValue(row.values, 'tags')),
      acknowledgement_required: ack,
      attachments: attachmentPaths,
      notes: getImportValue(row.values, 'notes') || null,
    } : undefined;

    return {
      ...row,
      errors,
      payload,
      displayAudience: [
        targetBusinessUnits.length ? `BUs: ${targetBusinessUnits.join(', ')}` : '',
        targetDepartments.length ? `Depts: ${targetDepartments.join(', ')}` : '',
        targetEmployeeIds.length ? `Employees: ${targetEmployeeIds.length}` : '',
      ].filter(Boolean).join(' · ') || 'Invalid target',
      displayAttachments: attachmentNames.length ? attachmentNames.join(', ') : 'None',
    };
  });
};

const summaryLabels: Array<[keyof ImportSummary, string]> = [
  ['total_rows', 'Total rows'],
  ['imported_rows', 'Successfully imported'],
  ['published_rows', 'Published'],
  ['failed_rows', 'Failed rows'],
  ['duplicate_rows', 'Duplicate rows'],
  ['invalid_employee_rows', 'Invalid employees'],
  ['missing_required_rows', 'Missing required fields'],
];

const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

const BatchMemoUploadModal: React.FC<BatchMemoUploadModalProps> = ({ isOpen, onClose, onImported }) => {
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [existingMemoNumbers, setExistingMemoNumbers] = useState<Set<string>>(new Set());
  const [fileName, setFileName] = useState('');
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<MemoImportRow[]>([]);
  const [headerErrors, setHeaderErrors] = useState<BulkImportError[]>([]);
  const [parseError, setParseError] = useState('');
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [publishImported, setPublishImported] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const rowErrors = useMemo(() => rows.flatMap(row => row.errors), [rows]);
  const validRows = useMemo(() => rows.filter(row => row.errors.length === 0 && row.payload), [rows]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const loadReferences = async () => {
      try {
        const [units, departmentRows, userRows, memoRows] = await Promise.all([
          fetchBusinessUnits(),
          fetchDepartments(),
          fetchUsers(),
          supabase.from('memos').select('memo_number'),
        ]);
        if (!active) return;
        setBusinessUnits(units);
        setDepartments(departmentRows);
        setEmployees(userRows);
        setExistingMemoNumbers(new Set((memoRows.data || []).map((row: any) => lower(row.memo_number)).filter(Boolean)));
      } catch (error) {
        console.error('Failed to load memo import reference data', error);
      }
    };
    loadReferences();
    return () => { active = false; };
  }, [isOpen]);

  const reset = () => {
    setFileName('');
    setAttachmentFiles([]);
    setRows([]);
    setHeaderErrors([]);
    setParseError('');
    setImportError('');
    setImporting(false);
    setPublishImported(false);
    setSummary(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAttachments = (files: FileList | null) => {
    const next = files ? Array.from(files) : [];
    setAttachmentFiles(next);
    if (rows.length && fileName) {
      // Re-run validation so attachment filename errors disappear immediately.
      void revalidateRows(rows.map(row => ({ rowNumber: row.rowNumber, values: row.values })), next);
    }
  };

  const revalidateRows = async (parsedRows: ParsedImportRow[], files = attachmentFiles) => {
    setRows(validateMemoRows(parsedRows, employees, businessUnits, departments, existingMemoNumbers, files));
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    setParseError('');
    setImportError('');
    setSummary(null);
    try {
      const parsed = await parseImportFile(file, [...MEMO_IMPORT_COLUMNS]);
      setHeaderErrors(parsed.headerErrors);
      await revalidateRows(parsed.rows);
    } catch (error: any) {
      setRows([]);
      setHeaderErrors([]);
      setParseError(error?.message || 'The file could not be read.');
    }
  };

  const downloadTemplates = async (format: 'csv' | 'xlsx') => {
    const example = {
      memo_title: 'Example memo — delete this row', memo_number: 'MEMO-HR-TDM-2026-001', memo_type: 'Policy', description: 'Example summary only.',
      full_memo_content: '<p>Example content only. Delete this row.</p>', business_unit: businessUnits[0]?.name || 'All', department: 'All', target_audience: 'Business Unit',
      employee_ids: '', employee_emails: '', effective_date: '2026-08-24', effective_year: '2026', effective_month: '8', publication_date: '', status: 'Draft', tags: 'HR, Policy',
      requires_acknowledgement: 'No', attachment_filename: '', notes: '',
    };
    if (format === 'csv') {
      downloadImportCsvTemplate('TNG_Memo_Import_Template.csv', [...MEMO_IMPORT_COLUMNS], example);
      return;
    }
    await downloadImportXlsxTemplate({
      fileName: 'TNG_Memo_Import_Template.xlsx',
      sheetName: 'Memos',
      columns: [...MEMO_IMPORT_COLUMNS],
      example,
      instructions: [
        ['How to use', 'Complete the Memos sheet, delete the example row, optionally select supporting files below, then upload the CSV or XLSX file. Keep header names unchanged.'],
        ['Required fields', 'memo_title, memo_number, and effective_date (or effective_year/effective_month). Provide full_memo_content or description.'],
        ['Memo numbering', 'Keep the existing format, for example MEMO-HR-TDM-2026-001. Duplicate memo numbers are rejected.'],
        ['Targeting', 'Use business_unit, department, employee_ids, and/or employee_emails. Use All for an all-employee memo. Employee names alone are not accepted.'],
        ['Publication', 'Imported rows remain Draft by default. Use the Publish imported memos checkbox only after review; publication then triggers the existing notification/acknowledgement path.'],
        ['Attachments', 'Put exact filenames in attachment_filename, select those files in the supporting-files picker, and the importer will match and store them with the memo.'],
      ],
      references: [{
        name: 'Reference Data',
        columns: ['employee_id', 'email', 'hris_user_id', 'employee_name', 'business_unit', 'department', 'department_id'],
        rows: [
          ...employees.map(employee => ({ employee_id: employee.employeeId || '', email: employee.email, hris_user_id: employee.id, employee_name: employee.name, business_unit: employee.businessUnit, department: employee.department, department_id: employee.departmentId || '' })),
          ...businessUnits.map(unit => ({ employee_id: '', email: '', hris_user_id: '', employee_name: '', business_unit: unit.name, department: '', department_id: '' })),
          ...departments.map(department => ({ employee_id: '', email: '', hris_user_id: '', employee_name: '', business_unit: businessUnits.find(unit => unit.id === department.businessUnitId)?.name || '', department: department.name, department_id: department.id })),
        ],
      }],
    });
  };

  const handleImport = async () => {
    if (headerErrors.length || !rows.length || rowErrors.length || validRows.length !== rows.length) return;
    setImporting(true);
    setImportError('');
    const uploadedPaths: string[] = [];
    try {
      const batchId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
      const referencedNames = new Set(validRows.flatMap(row => (row.payload?.attachments as string[]) || []));
      const pathsByName = new Map<string, string>();
      for (const file of attachmentFiles) {
        if (!referencedNames.has(lower(file.name))) continue;
        const memoNumber = validRows.find(row => ((row.payload?.attachments as string[]) || []).includes(lower(file.name)))?.payload?.memo_number;
        const path = `memos/${safeFileName(String(memoNumber || batchId))}/${safeFileName(file.name)}`;
        const { error } = await supabase.storage.from('memo_attachments').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
        if (error) throw error;
        uploadedPaths.push(path);
        pathsByName.set(lower(file.name), path);
      }
      const payload = validRows.map(row => ({
        ...row.payload,
        attachments: ((row.payload?.attachments as string[]) || []).map(name => pathsByName.get(name)).filter(Boolean),
      }));
      const { data, error } = await supabase.rpc('import_memos_batch', { p_rows: payload, p_publish: publishImported });
      if (error) throw error;
      setSummary({
        total_rows: rows.length,
        imported_rows: Number(data?.imported_rows ?? rows.length),
        published_rows: Number(data?.published_rows ?? (publishImported ? rows.length : 0)),
        failed_rows: Number(data?.failed_rows ?? 0),
        duplicate_rows: Number(data?.duplicate_rows ?? 0),
        invalid_employee_rows: Number(data?.invalid_employee_rows ?? 0),
        missing_required_rows: Number(data?.missing_required_rows ?? 0),
      });
      await onImported();
    } catch (error: any) {
      if (uploadedPaths.length) await supabase.storage.from('memo_attachments').remove(uploadedPaths).catch(() => undefined);
      setImportError(error?.message || 'The memo import could not be completed. No memo rows were saved.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Batch Upload Memos" size="full" centered={false} footer={(
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => downloadTemplates('csv')}>Download CSV Template</Button>
          <Button variant="secondary" onClick={() => downloadTemplates('xlsx')}>Download XLSX Template</Button>
          {rowErrors.length > 0 && <Button variant="secondary" onClick={() => downloadImportErrorReport(`TNG_Memo_Import_Errors_${new Date().toISOString().slice(0, 10)}.csv`, rowErrors)}>Download Error Report</Button>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleClose}>Close</Button>
          <Button onClick={handleImport} isLoading={importing} disabled={!rows.length || !!headerErrors.length || !!rowErrors.length || validRows.length !== rows.length}>Import Memos</Button>
        </div>
      </div>
    )}>
      <div className="space-y-5">
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100">
          Upload the memo sheet, optionally select all supporting files, and preview the resolved target audience before importing. Imported memos are Draft unless you explicitly enable publishing.
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Memo CSV/XLSX</label>
            <label className="inline-flex cursor-pointer items-center rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
              Choose memo CSV/XLSX
              <input type="file" accept=".csv,.xlsx" className="sr-only" onChange={event => handleFile(event.target.files?.[0])} />
            </label>
            {fileName && <span className="ml-3 text-sm text-gray-600 dark:text-gray-300">{fileName}</span>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Supporting memo files</label>
            <input type="file" multiple onChange={event => handleAttachments(event.target.files)} className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-100 file:px-3 file:py-2 file:text-indigo-700" />
            <p className="mt-1 text-xs text-gray-500">Match files by exact filename in attachment_filename.</p>
          </div>
        </div>
        <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <input type="checkbox" checked={publishImported} onChange={event => setPublishImported(event.target.checked)} className="mt-0.5 h-4 w-4" />
          <span><strong>Publish imported memos after validation.</strong> Leave this off to keep every imported memo in Draft for review. Published rows trigger the existing notification and acknowledgement workflow.</span>
        </label>
        {parseError && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{parseError}</div>}
        {headerErrors.length > 0 && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{headerErrors.map(error => <div key={`${error.field}-${error.reason}`}>Row {error.rowNumber}: {error.reason}</div>)}</div>}
        {importError && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{importError}</div>}
        {summary && <div className="grid grid-cols-2 gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900 md:grid-cols-4">{summaryLabels.map(([key, label]) => <div key={key}><div className="text-xs uppercase tracking-wide opacity-70">{label}</div><div className="text-xl font-semibold">{summary[key]}</div></div>)}</div>}
        {rows.length > 0 && <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-slate-900/40"><tr><th className="px-3 py-2 text-left">Row</th><th className="px-3 py-2 text-left">Memo</th><th className="px-3 py-2 text-left">Number</th><th className="px-3 py-2 text-left">Effective</th><th className="px-3 py-2 text-left">Target audience</th><th className="px-3 py-2 text-left">Attachments</th><th className="px-3 py-2 text-left">Validation</th></tr></thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {rows.map(row => <tr key={row.rowNumber} className={row.errors.length ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                <td className="px-3 py-2">{row.rowNumber}</td><td className="px-3 py-2">{getImportValue(row.values, 'memo_title') || '—'}</td><td className="px-3 py-2 font-mono">{getImportValue(row.values, 'memo_number') || '—'}</td><td className="px-3 py-2">{row.payload?.effective_date || getImportValue(row.values, 'effective_date') || '—'}</td><td className="px-3 py-2">{row.displayAudience}</td><td className="px-3 py-2">{row.displayAttachments}</td><td className="px-3 py-2 text-xs">{row.errors.length ? <ul className="list-disc space-y-1 pl-4 text-red-700">{row.errors.map(error => <li key={`${error.field}-${error.reason}`}>{error.field}: {error.reason}</li>)}</ul> : <span className="font-medium text-green-700">Ready</span>}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
        {!rows.length && !parseError && <p className="text-sm text-gray-500">Download a template, complete it, and choose the file to see the preview.</p>}
      </div>
    </Modal>
  );
};

export default BatchMemoUploadModal;
