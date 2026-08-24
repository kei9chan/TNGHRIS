import React, { useMemo, useState } from 'react';
import { Asset, AssetStatus, BusinessUnit, User } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { supabase } from '../../services/supabaseClient';
import {
  BulkImportError,
  downloadImportCsvTemplate,
  downloadImportErrorReport,
  downloadImportXlsxTemplate,
  formatImportDate,
  getImportValue,
  parseImportFile,
  ParsedImportRow,
} from '../../services/bulkImportUtils';

export const ASSET_IMPORT_COLUMNS = [
  'asset_tag',
  'asset_name',
  'asset_type',
  'brand',
  'model',
  'serial_number',
  'description',
  'business_unit',
  'assigned_employee',
  'employee_email',
  'employee_id',
  'date_assigned',
  'condition',
  'status',
  'purchase_date',
  'purchase_cost',
  'warranty_expiry',
  'notes',
] as const;

type AssetImportRow = ParsedImportRow & {
  errors: BulkImportError[];
  payload?: Record<string, unknown>;
  displayEmployee?: string;
  displayBusinessUnit?: string;
};

type ImportSummary = {
  total_rows: number;
  imported_rows: number;
  assigned_rows: number;
  failed_rows: number;
  duplicate_rows: number;
  invalid_employee_rows: number;
  missing_required_rows: number;
};

interface BatchAssetUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: User[];
  businessUnits: BusinessUnit[];
  existingAssets: Asset[];
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

const findEmployee = (value: string, employees: User[]) => {
  const key = lower(value);
  return employees.find(employee => [employee.id, employee.employeeId, employee.email]
    .some(candidate => lower(candidate) === key));
};

const findEmployeeIdentifiers = (row: ParsedImportRow) => [
  getImportValue(row.values, 'assigned_employee'),
  getImportValue(row.values, 'employee_email'),
  getImportValue(row.values, 'employee_id'),
].filter(Boolean);

const validateAssetRows = (
  parsedRows: ParsedImportRow[],
  employees: User[],
  businessUnits: BusinessUnit[],
  existingAssets: Asset[],
): AssetImportRow[] => {
  const assetTypes = ['Laptop', 'Mobile Phone', 'Monitor', 'Software License', 'Other'];
  const statuses = Object.values(AssetStatus);
  const tagCounts = new Map<string, number>();
  const serialCounts = new Map<string, number>();
  parsedRows.forEach(row => {
    const tag = lower(getImportValue(row.values, 'asset_tag'));
    const serial = lower(getImportValue(row.values, 'serial_number'));
    if (tag) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    if (serial) serialCounts.set(serial, (serialCounts.get(serial) || 0) + 1);
  });
  const existingTags = new Set(existingAssets.map(asset => lower(asset.assetTag)).filter(Boolean));
  const existingSerials = new Set(existingAssets.map(asset => lower(asset.serialNumber)).filter(Boolean));

  return parsedRows.map(row => {
    const errors: BulkImportError[] = [];
    const tag = getImportValue(row.values, 'asset_tag');
    const name = getImportValue(row.values, 'asset_name', 'name');
    const type = getImportValue(row.values, 'asset_type', 'type');
    const businessUnitValue = getImportValue(row.values, 'business_unit', 'business_unit_id');
    const serial = getImportValue(row.values, 'serial_number');
    const statusValue = getImportValue(row.values, 'status') || AssetStatus.Available;
    const purchaseDateValue = getImportValue(row.values, 'purchase_date');
    const purchaseDate = formatImportDate(purchaseDateValue);
    const assignedIdentifiers = findEmployeeIdentifiers(row);
    const businessUnit = findBusinessUnit(businessUnitValue, businessUnits);
    const typeValue = assetTypes.find(item => lower(item) === lower(type)) || type;
    const status = statuses.find(item => lower(item) === lower(statusValue)) || statusValue;

    if (!tag) addError(errors, row, 'asset_tag', 'Asset tag is required.', 'Enter a unique asset tag.');
    if (!name) addError(errors, row, 'asset_name', 'Asset name is required.', 'Enter the name shown in Asset Management.');
    if (!assetTypes.some(item => lower(item) === lower(type))) {
      addError(errors, row, 'asset_type', `Asset type “${type || '(blank)'}” is not supported.`, `Use ${assetTypes.join(', ')}.`);
    }
    if (!businessUnitValue) addError(errors, row, 'business_unit', 'Business unit is required.', 'Use a business-unit name, code, or ID from the template reference sheet.');
    else if (!businessUnit) addError(errors, row, 'business_unit', `Business unit “${businessUnitValue}” was not found.`, 'Use an active business-unit name, code, or ID.');
    if (!purchaseDate) addError(errors, row, 'purchase_date', `Purchase date “${purchaseDateValue || '(blank)'}” is invalid.`, 'Use YYYY-MM-DD or a valid spreadsheet date.');
    if (!statuses.some(item => lower(item) === lower(statusValue))) {
      addError(errors, row, 'status', `Status “${statusValue}” is invalid.`, `Use ${statuses.join(', ')}.`);
    }
    const purchaseCost = getImportValue(row.values, 'purchase_cost', 'value');
    if (purchaseCost && !Number.isFinite(Number(purchaseCost))) {
      addError(errors, row, 'purchase_cost', `Purchase cost “${purchaseCost}” is not a number.`, 'Enter a numeric cost, without currency symbols.');
    }
    const warrantyExpiryValue = getImportValue(row.values, 'warranty_expiry');
    if (warrantyExpiryValue && !formatImportDate(warrantyExpiryValue)) {
      addError(errors, row, 'warranty_expiry', `Warranty expiry “${warrantyExpiryValue}” is invalid.`, 'Use YYYY-MM-DD or a valid spreadsheet date.');
    }
    if (tag && (existingTags.has(lower(tag)) || (tagCounts.get(lower(tag)) || 0) > 1)) {
      addError(errors, row, 'asset_tag', 'This asset tag already exists or appears more than once in the upload.', 'Keep asset tags unique before importing.');
    }
    if (serial && (existingSerials.has(lower(serial)) || (serialCounts.get(lower(serial)) || 0) > 1)) {
      addError(errors, row, 'serial_number', 'This serial number already exists or appears more than once in the upload.', 'Keep serial numbers unique before importing, or leave the field blank.');
    }

    let employee: User | undefined;
    assignedIdentifiers.forEach(identifier => {
      const matched = findEmployee(identifier, employees);
      if (!matched) {
        addError(errors, row, 'employee_id', `Employee identifier “${identifier}” was not found.`, 'Use an employee ID or email from the template reference sheet; names alone are not accepted.');
      } else if (matched.status !== 'Active') {
        addError(errors, row, 'employee_id', `Employee “${identifier}” is not active.`, 'Assign the asset to an active employee.');
      } else if (employee && employee.id !== matched.id) {
        addError(errors, row, 'employee_id', 'The employee ID, email, and assigned employee values identify different employees.', 'Use one consistent employee ID/email for the row.');
      } else {
        employee = matched;
      }
    });
    const dateAssignedValue = getImportValue(row.values, 'date_assigned');
    const dateAssigned = employee ? formatImportDate(dateAssignedValue) : null;
    if (employee && !dateAssigned) addError(errors, row, 'date_assigned', 'Date assigned is required when an employee is assigned.', 'Use YYYY-MM-DD or a valid spreadsheet date.');

    const condition = getImportValue(row.values, 'condition') || (employee ? 'New' : '');
    const statusForPayload = employee ? AssetStatus.Assigned : status;
    if (employee && lower(statusValue) !== lower(AssetStatus.Assigned)) {
      // Assignment is authoritative; this is informational in the preview, not a blocking error.
    }

    const payload = businessUnit && purchaseDate ? {
      asset_tag: tag,
      name,
      type: typeValue,
      brand: getImportValue(row.values, 'brand') || null,
      model: getImportValue(row.values, 'model') || null,
      serial_number: serial || null,
      description: getImportValue(row.values, 'description') || null,
      business_unit_id: businessUnit.id,
      assigned_employee_id: employee?.id || null,
      date_assigned: dateAssigned,
      condition,
      status: statusForPayload,
      purchase_date: purchaseDate,
      purchase_cost: purchaseCost ? Number(purchaseCost) : 0,
      warranty_expiry: warrantyExpiryValue ? formatImportDate(warrantyExpiryValue) : null,
      notes: getImportValue(row.values, 'notes') || null,
    } : undefined;

    return {
      ...row,
      errors,
      payload,
      displayEmployee: employee ? `${employee.name} (${employee.employeeId || employee.email || employee.id})` : 'Unassigned',
      displayBusinessUnit: businessUnit?.name || businessUnitValue || 'Invalid',
    };
  });
};

const summaryLabels: Array<[keyof ImportSummary, string]> = [
  ['total_rows', 'Total rows'],
  ['imported_rows', 'Successfully imported'],
  ['assigned_rows', 'Assigned successfully'],
  ['failed_rows', 'Failed rows'],
  ['duplicate_rows', 'Duplicate rows'],
  ['invalid_employee_rows', 'Invalid employees'],
  ['missing_required_rows', 'Missing required fields'],
];

const BatchAssetUploadModal: React.FC<BatchAssetUploadModalProps> = ({
  isOpen,
  onClose,
  employees,
  businessUnits,
  existingAssets,
  onImported,
}) => {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<AssetImportRow[]>([]);
  const [headerErrors, setHeaderErrors] = useState<BulkImportError[]>([]);
  const [parseError, setParseError] = useState('');
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const rowErrors = useMemo(() => rows.flatMap(row => row.errors), [rows]);
  const validRows = useMemo(() => rows.filter(row => row.errors.length === 0 && row.payload), [rows]);

  const reset = () => {
    setFileName('');
    setRows([]);
    setHeaderErrors([]);
    setParseError('');
    setImportError('');
    setImporting(false);
    setSummary(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    setParseError('');
    setImportError('');
    setSummary(null);
    try {
      const parsed = await parseImportFile(file, [...ASSET_IMPORT_COLUMNS]);
      setHeaderErrors(parsed.headerErrors);
      setRows(validateAssetRows(parsed.rows, employees, businessUnits, existingAssets));
    } catch (error: any) {
      setRows([]);
      setHeaderErrors([]);
      setParseError(error?.message || 'The file could not be read.');
    }
  };

  const templateExample = () => ({
      asset_tag: 'AST-EXAMPLE-001', asset_name: 'Example Laptop', asset_type: 'Laptop', brand: 'Example Brand', model: 'Model X',
      serial_number: 'DELETE-EXAMPLE', description: 'Delete this example row.', business_unit: businessUnits[0]?.name || '',
      assigned_employee: employees[0]?.employeeId || employees[0]?.email || '', employee_email: '', employee_id: '',
      date_assigned: '2026-08-24', condition: 'New', status: 'Assigned', purchase_date: '2026-08-24', purchase_cost: '0',
      warranty_expiry: '', notes: '',
  });

  const downloadCsvTemplate = () => {
    downloadImportCsvTemplate('TNG_Asset_Import_Template.csv', [...ASSET_IMPORT_COLUMNS], templateExample());
  };

  const downloadXlsxTemplate = async () => {
    const example = templateExample();
    await downloadImportXlsxTemplate({
      fileName: 'TNG_Asset_Import_Template.xlsx',
      sheetName: 'Assets',
      columns: [...ASSET_IMPORT_COLUMNS],
      example,
      instructions: [
        ['How to use', 'Complete the Assets sheet, delete the example row, then upload the CSV or XLSX file in TNG HRIS. Keep the header names unchanged.'],
        ['Required fields', 'asset_tag, asset_name, asset_type, business_unit, purchase_date. If assigning an asset, use employee_id or employee_email and date_assigned.'],
        ['Employee matching', 'Use employee_id or employee_email. Names alone are intentionally not accepted. The assigned_employee column is also accepted when it contains an employee ID or email.'],
        ['Duplicate prevention', 'Asset tags and serial numbers must be unique, including within this upload.'],
        ['Status', `Allowed values: ${Object.values(AssetStatus).join(', ')}. An asset with an employee assignment is saved as Assigned automatically.`],
        ['Dates and cost', 'Use YYYY-MM-DD dates and numeric purchase_cost values.'],
      ],
      references: [
        {
          name: 'Reference Data',
          columns: ['employee_id', 'email', 'hris_user_id', 'employee_name', 'business_unit', 'business_unit_id'],
          rows: [
            ...employees.map(employee => ({ employee_id: employee.employeeId || '', email: employee.email, hris_user_id: employee.id, employee_name: employee.name, business_unit: employee.businessUnit, business_unit_id: employee.businessUnitId || '' })),
            ...businessUnits.map(unit => ({ employee_id: '', email: '', hris_user_id: '', employee_name: '', business_unit: unit.name, business_unit_id: unit.id })),
          ],
        },
      ],
    });
  };

  const handleImport = async () => {
    if (headerErrors.length || !rows.length || rowErrors.length || validRows.length !== rows.length) return;
    setImporting(true);
    setImportError('');
    try {
      const { data, error } = await supabase.rpc('import_assets_batch', {
        p_rows: validRows.map(row => row.payload),
      });
      if (error) throw error;
      setSummary({
        total_rows: rows.length,
        imported_rows: Number(data?.imported_rows ?? rows.length),
        assigned_rows: Number(data?.assigned_rows ?? validRows.filter(row => row.payload?.assigned_employee_id).length),
        failed_rows: Number(data?.failed_rows ?? 0),
        duplicate_rows: Number(data?.duplicate_rows ?? 0),
        invalid_employee_rows: Number(data?.invalid_employee_rows ?? 0),
        missing_required_rows: Number(data?.missing_required_rows ?? 0),
      });
      await onImported();
    } catch (error: any) {
      setImportError(error?.message || 'The asset import could not be completed. No rows were saved.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Batch Upload Assets" size="full" centered={false} footer={(
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={downloadCsvTemplate}>Download CSV Template</Button>
          <Button variant="secondary" onClick={downloadXlsxTemplate}>Download XLSX Template</Button>
          {rowErrors.length > 0 && <Button variant="secondary" onClick={() => downloadImportErrorReport(`TNG_Asset_Import_Errors_${new Date().toISOString().slice(0, 10)}.csv`, rowErrors)}>Download Error Report</Button>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleClose}>Close</Button>
          <Button onClick={handleImport} isLoading={importing} disabled={!rows.length || !!headerErrors.length || !!rowErrors.length || validRows.length !== rows.length}>Import Validated Assets</Button>
        </div>
      </div>
    )}>
      <div className="space-y-5">
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100">
          Upload a completed template to preview all rows. The import requires every row to be valid so the asset, assignment, notification, and history records stay consistent.
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
            Choose asset CSV/XLSX
            <input type="file" accept=".csv,.xlsx" className="sr-only" onChange={event => handleFile(event.target.files?.[0])} />
          </label>
          {fileName && <span className="text-sm text-gray-600 dark:text-gray-300">{fileName}</span>}
          {parseError && <span className="text-sm text-red-600">{parseError}</span>}
        </div>
        {headerErrors.length > 0 && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {headerErrors.map(error => <div key={`${error.field}-${error.reason}`}>Row {error.rowNumber}: {error.reason}</div>)}
          </div>
        )}
        {importError && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{importError}</div>}
        {summary && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900 md:grid-cols-4">
            {summaryLabels.map(([key, label]) => <div key={key}><div className="text-xs uppercase tracking-wide opacity-70">{label}</div><div className="text-xl font-semibold">{summary[key]}</div></div>)}
          </div>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-slate-900/40"><tr>
                <th className="px-3 py-2 text-left">Row</th><th className="px-3 py-2 text-left">Asset tag</th><th className="px-3 py-2 text-left">Asset name</th><th className="px-3 py-2 text-left">Business unit</th><th className="px-3 py-2 text-left">Employee</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Validation</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {rows.map(row => <tr key={row.rowNumber} className={row.errors.length ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                  <td className="px-3 py-2">{row.rowNumber}</td>
                  <td className="px-3 py-2 font-mono">{getImportValue(row.values, 'asset_tag') || '—'}</td>
                  <td className="px-3 py-2">{getImportValue(row.values, 'asset_name') || '—'}</td>
                  <td className="px-3 py-2">{row.displayBusinessUnit}</td>
                  <td className="px-3 py-2">{row.displayEmployee}</td>
                  <td className="px-3 py-2">{row.payload?.status || getImportValue(row.values, 'status') || AssetStatus.Available}</td>
                  <td className="px-3 py-2 text-xs">{row.errors.length ? <ul className="list-disc space-y-1 pl-4 text-red-700">{row.errors.map(error => <li key={`${error.field}-${error.reason}`}>{error.field}: {error.reason}</li>)}</ul> : <span className="font-medium text-green-700">Ready</span>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
        {!rows.length && !parseError && <p className="text-sm text-gray-500">Download a template, complete it, and choose the file to see the preview.</p>}
      </div>
    </Modal>
  );
};

export default BatchAssetUploadModal;
