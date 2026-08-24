import React, { useMemo, useRef, useState } from 'react';
import {
  BusinessUnit,
  DisciplineCategory,
  DisciplineEntry,
  DisciplineImportError,
  DisciplineImportMode,
  DisciplineImportResult,
  DisciplineImportRow,
} from '../../types';
import {
  DISCIPLINE_IMPORT_COLUMNS,
  DisciplineValidatedRow,
  downloadDisciplineCsvTemplate,
  downloadDisciplineErrorReport,
  downloadDisciplineXlsxTemplate,
  importDisciplineRows,
  parseDisciplineImportFile,
  validateDisciplineImportRows,
} from '../../services/disciplineImportService';
import Button from '../ui/Button';
import Modal from '../ui/Modal';

interface DisciplineBulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: DisciplineCategory[];
  businessUnits: BusinessUnit[];
  existingEntries: DisciplineEntry[];
  onImported: () => void | Promise<void>;
}

const modeLabels: Record<DisciplineImportMode, string> = {
  add_only: 'Add new entries only',
  update_only: 'Update matching entries',
  add_update: 'Add and update',
};

const editableColumns = DISCIPLINE_IMPORT_COLUMNS;

const DisciplineBulkImportModal: React.FC<DisciplineBulkImportModalProps> = ({
  isOpen,
  onClose,
  categories,
  businessUnits,
  existingEntries,
  onImported,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<DisciplineImportRow[]>([]);
  const [headerErrors, setHeaderErrors] = useState<DisciplineImportError[]>([]);
  const [mode, setMode] = useState<DisciplineImportMode>('add_only');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<DisciplineImportResult | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  const validatedRows = useMemo(
    () => validateDisciplineImportRows(rows, categories, businessUnits, existingEntries, mode),
    [rows, categories, businessUnits, existingEntries, mode],
  );
  const validRows = useMemo(() => validatedRows.filter(row => row.errors.length === 0), [validatedRows]);
  const rowErrors = useMemo(() => validatedRows.flatMap(row => row.errors), [validatedRows]);
  const allErrors = useMemo(
    () => [...headerErrors, ...rowErrors, ...(result?.errors || [])],
    [headerErrors, rowErrors, result],
  );

  const reset = () => {
    setFile(null);
    setRows([]);
    setHeaderErrors([]);
    setResult(null);
    setWorkflowError(null);
    setMode('add_only');
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (selectedFile?: File) => {
    if (!selectedFile) return;
    if (selectedFile.size > 10 * 1024 * 1024) {
      setWorkflowError('The import file exceeds the 10 MB limit.');
      return;
    }
    setParsing(true);
    setWorkflowError(null);
    setResult(null);
    try {
      const parsed = await parseDisciplineImportFile(selectedFile);
      setFile(selectedFile);
      setRows(parsed.rows);
      setHeaderErrors(parsed.headerErrors);
      if (!parsed.rows.length) setWorkflowError('The file contains no data rows.');
    } catch (error: any) {
      setFile(null);
      setRows([]);
      setHeaderErrors([]);
      setWorkflowError(error?.message || 'The file could not be read.');
    } finally {
      setParsing(false);
    }
  };

  const updateRow = (rowNumber: number, column: string, value: string) => {
    setRows(previous => previous.map(row => {
      if (row.rowNumber !== rowNumber) return row;
      if (column === 'severity') return { ...row, severity_level: value };
      return { ...row, [column]: value };
    }));
    setResult(null);
  };

  const removeRow = (rowNumber: number) => {
    setRows(previous => previous.filter(row => row.rowNumber !== rowNumber));
    setResult(null);
  };

  const handleImport = async () => {
    if (!file || !validRows.length || headerErrors.length) return;
    const confirmation = window.confirm(
      `${modeLabels[mode]}: import ${validRows.length} valid row(s)? ${validatedRows.length - validRows.length} invalid row(s) will not be imported.`,
    );
    if (!confirmation) return;

    setImporting(true);
    setWorkflowError(null);
    try {
      // Submit the complete reviewed file so the server-side audit record keeps
      // the original row count and independently records invalid/skipped rows.
      const imported = await importDisciplineRows(rows, mode, file.name);
      setResult(imported);
      await onImported();
    } catch (error: any) {
      setWorkflowError(error?.message || 'The import failed. No confirmation was recorded.');
    } finally {
      setImporting(false);
    }
  };

  const footer = result ? (
    <div className="flex w-full justify-end">
      <Button onClick={handleClose}>Done</Button>
    </div>
  ) : (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-500">
        {rows.length ? `${validRows.length} valid · ${validatedRows.length - validRows.length} invalid` : 'Upload an XLSX or CSV file to continue.'}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleImport}
          disabled={!file || !validRows.length || headerErrors.length > 0 || importing}
          isLoading={importing}
        >
          Confirm Import ({validRows.length})
        </Button>
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Batch Upload Code of Discipline" size="5xl" footer={footer}>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          ['1', 'Download', 'Use the current template and reference values.'],
          ['2', 'Validate & preview', 'Upload, review, and correct row-level errors.'],
          ['3', 'Confirm import', 'Choose a mode and explicitly confirm changes.'],
        ].map(([number, title, text]) => (
          <div key={number} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">{number}</span><span className="font-semibold text-slate-900 dark:text-white">{title}</span></div>
            <p className="mt-2 text-xs text-slate-500">{text}</p>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h4 className="font-semibold text-slate-900 dark:text-white">Download a fresh template</h4>
            <p className="mt-1 text-sm text-slate-500">XLSX includes Instructions and Reference Data sheets. CSV includes headers and example rows.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => downloadDisciplineCsvTemplate(categories, businessUnits)}>Download CSV</Button>
            <Button variant="secondary" size="sm" onClick={() => downloadDisciplineXlsxTemplate(categories, businessUnits)}>Download XLSX</Button>
          </div>
        </div>
      </section>

      {!result && (
        <section className="grid gap-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">Completed import file</label>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={event => handleFile(event.target.files?.[0])}
              className="mt-2 block w-full rounded-md border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              disabled={parsing}
            />
            <p className="mt-1 text-xs text-slate-500">Accepted: .xlsx and .csv, maximum 10 MB.</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">Import mode *</label>
            <select value={mode} onChange={event => setMode(event.target.value as DisciplineImportMode)} className="mt-2 block w-full rounded-md border-slate-300 py-2 pl-3 pr-8 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white">
              {(Object.keys(modeLabels) as DisciplineImportMode[]).map(value => <option key={value} value={value}>{modeLabels[value]}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-500">Matching is case-insensitive by unique code.</p>
          </div>
        </section>
      )}

      {(workflowError || headerErrors.length > 0) && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200" role="alert">
          {workflowError && <p className="font-semibold">{workflowError}</p>}
          {headerErrors.map(item => <p key={`${item.field}-${item.reason}`} className="mt-1">Header: {item.reason} {item.suggestion}</p>)}
        </div>
      )}

      {result ? (
        <section className="rounded-xl border border-green-200 bg-green-50 p-5 text-green-950 dark:border-green-800 dark:bg-green-950/20 dark:text-green-100">
          <h4 className="text-lg font-bold">Import completed</h4>
          <p className="mt-1 text-sm">Audit reference: {result.importId}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ['Total', result.total],
              ['Added', result.imported],
              ['Updated', result.updated],
              ['Skipped', result.skipped],
              ['Failed', result.failed],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-white/70 p-3 dark:bg-slate-900/40">
                <div className="text-2xl font-bold">{value}</div><div className="text-xs">{label}</div>
              </div>
            ))}
          </div>
          {result.errors.length > 0 && (
            <Button className="mt-4" variant="secondary" onClick={() => downloadDisciplineErrorReport(result.errors)}>Download error report</Button>
          )}
        </section>
      ) : validatedRows.length > 0 && (
        <section>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white">Validation preview</h4>
              <p className="text-sm text-slate-500">Cells are editable. Validation refreshes immediately.</p>
            </div>
            {allErrors.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => downloadDisciplineErrorReport(allErrors)}>Download error report</Button>
            )}
          </div>
          <div className="max-h-[45vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-[1900px] divide-y divide-slate-200 text-xs dark:divide-slate-700">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900">
                <tr>
                  <th className="px-2 py-2 text-left">Row</th>
                  <th className="px-2 py-2 text-left">Validation</th>
                  {editableColumns.map(column => <th key={column} className="px-2 py-2 text-left">{column}</th>)}
                  <th className="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-800">
                {validatedRows.map((row: DisciplineValidatedRow) => (
                  <React.Fragment key={row.rowNumber}>
                    <tr className={row.errors.length ? 'bg-red-50/70 dark:bg-red-950/10' : 'bg-green-50/40 dark:bg-green-950/10'}>
                      <td className="px-2 py-2 font-mono">{row.rowNumber}</td>
                      <td className="px-2 py-2"><span className={`rounded-full px-2 py-1 font-semibold ${row.errors.length ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>{row.errors.length ? `${row.errors.length} error${row.errors.length === 1 ? '' : 's'}` : 'Valid'}</span></td>
                      {editableColumns.map(column => {
                        const value = column === 'severity' ? row.severity_level : String(row[column] || '');
                        const hasError = row.errors.some(item => item.field === column || (column === 'severity' && item.field === 'severity'));
                        return (
                          <td key={column} className="px-1 py-1">
                            {column === 'category' ? (
                              <select value={value} onChange={event => updateRow(row.rowNumber, column, event.target.value)} className={`w-full min-w-[150px] rounded border p-1.5 dark:bg-slate-900 ${hasError ? 'border-red-400' : 'border-slate-300 dark:border-slate-600'}`}>
                                <option value="">Select</option>
                                {categories.filter(category => category.isActive).map(category => <option key={category.name}>{category.name}</option>)}
                              </select>
                            ) : column === 'severity' ? (
                              <select value={value} onChange={event => updateRow(row.rowNumber, column, event.target.value)} className={`w-full min-w-[110px] rounded border p-1.5 dark:bg-slate-900 ${hasError ? 'border-red-400' : 'border-slate-300 dark:border-slate-600'}`}>
                                <option value="">Select</option>
                                {['Low', 'Medium', 'High', 'Critical'].map(item => <option key={item}>{item}</option>)}
                              </select>
                            ) : column === 'status' ? (
                              <select value={value || 'Active'} onChange={event => updateRow(row.rowNumber, column, event.target.value)} className={`w-full min-w-[100px] rounded border p-1.5 dark:bg-slate-900 ${hasError ? 'border-red-400' : 'border-slate-300 dark:border-slate-600'}`}>
                                <option>Active</option><option>Inactive</option>
                              </select>
                            ) : (
                              <input value={value} onChange={event => updateRow(row.rowNumber, column, event.target.value)} className={`w-full min-w-[145px] rounded border p-1.5 dark:bg-slate-900 ${column === 'description' ? 'min-w-[320px]' : ''} ${hasError ? 'border-red-400' : 'border-slate-300 dark:border-slate-600'}`} />
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2"><button type="button" onClick={() => removeRow(row.rowNumber)} className="font-semibold text-red-600 underline">Remove</button></td>
                    </tr>
                    {row.errors.length > 0 && (
                      <tr className="bg-red-50 dark:bg-red-950/20">
                        <td colSpan={editableColumns.length + 3} className="px-3 py-2 text-red-800 dark:text-red-200">
                          {row.errors.map((item, index) => <div key={`${item.field}-${index}`}><strong>{item.field}:</strong> {item.reason} <span className="opacity-80">{item.suggestion}</span></div>)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </Modal>
  );
};

export default DisciplineBulkImportModal;
