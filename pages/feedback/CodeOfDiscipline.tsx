import React, { useEffect, useMemo, useState } from 'react';
import {
  BusinessUnit,
  DisciplineCategory,
  DisciplineEntry,
  Permission,
  SeverityLevel,
} from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { logActivity } from '../../services/auditService';
import {
  downloadDisciplineCsvTemplate,
  downloadDisciplineXlsxTemplate,
} from '../../services/disciplineImportService';
import { supabase } from '../../services/supabaseClient';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import CategoryManagerModal from '../../components/feedback/CategoryManagerModal';
import DisciplineBulkImportModal from '../../components/feedback/DisciplineBulkImportModal';
import DisciplineEntryModal from '../../components/feedback/DisciplineEntryModal';

const ChevronDownIcon = ({ open }: { open: boolean }) => (
  <svg className={`h-5 w-5 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
  </svg>
);

const severityClasses: Record<SeverityLevel, string> = {
  [SeverityLevel.Low]: 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-200',
  [SeverityLevel.Medium]: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200',
  [SeverityLevel.High]: 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200',
  [SeverityLevel.Critical]: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200',
};

const mapRowToEntry = (row: any): DisciplineEntry => ({
  id: row.id,
  code: row.code,
  category: row.category,
  description: row.description,
  severityLevel: row.severity as SeverityLevel,
  sanctions: (Array.isArray(row.sanctions) ? row.sanctions : []).map((sanction: any, index: number) => ({
    offense: Number(sanction.offense || index + 1),
    action: String(sanction.action || ''),
  })),
  businessUnitId: row.business_unit_id || undefined,
  isActive: row.is_active !== false,
  archivedAt: row.archived_at ? new Date(row.archived_at) : undefined,
  lastModifiedAt: row.last_modified_at ? new Date(row.last_modified_at) : new Date(),
  lastModifiedByUserId: row.last_modified_by_user_id || '',
});

const CodeOfDiscipline: React.FC = () => {
  const { user } = useAuth();
  const { can } = usePermissions();
  const canManage = can('CodeOfDiscipline', Permission.Manage);
  const canView = can('CodeOfDiscipline', Permission.View);

  const [entries, setEntries] = useState<DisciplineEntry[]>([]);
  const [categories, setCategories] = useState<DisciplineCategory[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<SeverityLevel | ''>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [orderMode, setOrderMode] = useState<'configured' | 'alphabetical'>('configured');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [selectedEntry, setSelectedEntry] = useState<DisciplineEntry | null>(null);
  const [defaultCategory, setDefaultCategory] = useState<string | null>(null);
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setPageError(null);
    try {
      const [entryResult, categoryResult, businessUnitResult] = await Promise.all([
        supabase.from('discipline_entries').select('*').order('code'),
        supabase.from('discipline_categories').select('*').order('display_order').order('name'),
        supabase.from('business_units').select('id,name,code,color').order('name'),
      ]);
      if (entryResult.error) throw entryResult.error;
      if (categoryResult.error) throw categoryResult.error;
      if (businessUnitResult.error) throw businessUnitResult.error;

      const mappedEntries = (entryResult.data || []).map(mapRowToEntry);
      const counts = mappedEntries.reduce<Record<string, number>>((result, entry) => {
        result[entry.category] = (result[entry.category] || 0) + 1;
        return result;
      }, {});
      const mappedCategories: DisciplineCategory[] = (categoryResult.data || []).map((row: any, index: number) => ({
        name: row.name,
        originalName: row.name,
        description: row.description || undefined,
        displayOrder: Number(row.display_order ?? ((index + 1) * 10)),
        isActive: row.is_active !== false,
        archivedAt: row.archived_at ? new Date(row.archived_at) : undefined,
        entryCount: counts[row.name] || 0,
      }));

      // Preserve visibility for legacy entries whose category metadata was
      // incomplete, while keeping all category management database-backed.
      mappedEntries.forEach(entry => {
        if (!mappedCategories.some(category => category.name === entry.category)) {
          mappedCategories.push({
            name: entry.category,
            originalName: entry.category,
            description: 'Legacy category recovered from existing entries.',
            displayOrder: (mappedCategories.length + 1) * 10,
            isActive: true,
            entryCount: counts[entry.category] || 0,
          });
        }
      });

      setEntries(mappedEntries);
      setCategories(mappedCategories);
      setBusinessUnits((businessUnitResult.data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        code: row.code || undefined,
        color: row.color || undefined,
      })));
      setOpenCategories(previous => previous.size
        ? previous
        : new Set(mappedCategories.filter(category => category.isActive).slice(0, 1).map(category => category.name)));
    } catch (error: any) {
      setPageError(error?.message || 'Code of Discipline data could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const activeCategoryNames = useMemo(
    () => categories.filter(category => category.isActive && !category.archivedAt).map(category => category.name),
    [categories],
  );

  const { visibleCategories, entriesByCategory } = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const filteredEntries = entries.filter(entry => {
      if (!includeArchived && entry.isActive === false) return false;
      if (severityFilter && entry.severityLevel !== severityFilter) return false;
      if (categoryFilter && entry.category !== categoryFilter) return false;
      if (term && ![entry.code, entry.category, entry.description].some(value => value.toLowerCase().includes(term))) return false;
      return true;
    });
    const grouped = filteredEntries.reduce<Record<string, DisciplineEntry[]>>((result, entry) => {
      (result[entry.category] ||= []).push(entry);
      return result;
    }, {});
    let categoryRows = categories.filter(category => {
      if (!includeArchived && (!category.isActive || category.archivedAt)) return false;
      if (categoryFilter && category.name !== categoryFilter) return false;
      if ((term || severityFilter) && !(grouped[category.name]?.length)) return false;
      return true;
    });
    categoryRows = [...categoryRows].sort((left, right) => orderMode === 'alphabetical'
      ? left.name.localeCompare(right.name)
      : left.displayOrder - right.displayOrder || left.name.localeCompare(right.name));
    return { visibleCategories: categoryRows, entriesByCategory: grouped };
  }, [entries, categories, searchTerm, severityFilter, categoryFilter, includeArchived, orderMode]);

  const toggleCategory = (name: string) => {
    setOpenCategories(previous => {
      const next = new Set(previous);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const openEntry = (entry: DisciplineEntry | null, category?: string) => {
    setSelectedEntry(entry);
    setDefaultCategory(category || activeCategoryNames[0] || null);
    setEntryModalOpen(true);
  };

  const saveEntry = async (entry: DisciplineEntry) => {
    if (!user) return;
    const payload = {
      code: entry.code.trim(),
      category: entry.category,
      description: entry.description.trim(),
      severity: entry.severityLevel,
      sanctions: entry.sanctions.map((sanction, index) => ({ offense: index + 1, action: sanction.action.trim() })).filter(sanction => sanction.action),
      business_unit_id: entry.businessUnitId || null,
      is_active: entry.isActive !== false,
      archived_at: entry.isActive === false ? (entry.archivedAt?.toISOString() || new Date().toISOString()) : null,
      archived_by: entry.isActive === false ? user.id : null,
      last_modified_at: new Date().toISOString(),
      last_modified_by_user_id: user.id,
    };
    try {
      const operation = entry.id
        ? supabase.from('discipline_entries').update(payload).eq('id', entry.id)
        : supabase.from('discipline_entries').insert(payload);
      const { error } = await operation;
      if (error) throw error;
      await logActivity(user, entry.id ? 'UPDATE' : 'CREATE', 'DisciplineEntry', entry.id || entry.code, `${entry.id ? 'Updated' : 'Created'} Code of Discipline entry ${entry.code}.`);
      setEntryModalOpen(false);
      setSelectedEntry(null);
      await loadData();
    } catch (error: any) {
      setPageError(error?.message || 'The discipline entry could not be saved.');
    }
  };

  const archiveEntry = async (entry: DisciplineEntry) => {
    if (!window.confirm(`Archive ${entry.code}? Existing cases and version history will be preserved.`)) return;
    try {
      const { error } = await supabase.rpc('archive_discipline_entry', { p_entry_id: entry.id });
      if (error) throw error;
      await loadData();
    } catch (error: any) {
      setPageError(error?.message || 'The entry could not be archived.');
    }
  };

  const saveCategories = async (nextCategories: DisciplineCategory[]) => {
    const { error } = await supabase.rpc('save_discipline_categories', {
      p_categories: nextCategories.map(category => ({
        originalName: category.originalName || null,
        name: category.name,
        description: category.description || null,
        displayOrder: category.displayOrder,
        isActive: category.isActive,
        archived: Boolean(category.archivedAt),
      })),
    });
    if (error) throw new Error(error.message || 'Categories could not be saved.');
    setCategoryModalOpen(false);
    await loadData();
  };

  const businessUnitName = (id?: string) => id
    ? businessUnits.find(unit => unit.id === id)?.name || 'Unknown business unit'
    : 'Company-wide';

  if (!canView) {
    return <div className="p-6"><Card><div className="p-8 text-center text-slate-600 dark:text-slate-300">You do not have permission to view the Code of Discipline.</div></Card></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Code of Discipline</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">Manage company rules, infractions, categories, severity, and progressive sanctions.</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => downloadDisciplineCsvTemplate(categories, businessUnits)}>Download CSV Template</Button>
            <Button variant="secondary" onClick={() => downloadDisciplineXlsxTemplate(categories, businessUnits)}>Download XLSX Template</Button>
            <Button variant="secondary" onClick={() => setBulkModalOpen(true)}>Batch Upload</Button>
            <Button variant="secondary" onClick={() => setCategoryModalOpen(true)}>Manage Categories</Button>
            <Button onClick={() => openEntry(null)}>New Entry</Button>
          </div>
        )}
      </div>

      {pageError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-800 dark:bg-red-950/20 dark:text-red-200" role="alert">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold">Code of Discipline could not be updated</p><p className="text-sm">{pageError}</p></div>
            <div className="flex gap-3"><button className="text-sm font-semibold underline" onClick={() => loadData()}>Retry</button><button className="text-sm font-semibold underline" onClick={() => setPageError(null)}>Dismiss</button></div>
          </div>
        </div>
      )}

      <Card>
        <div className="space-y-4 p-4">
          <Input
            label="Search Code of Discipline"
            placeholder="Search by code, description, or category…"
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Filter by Severity</label>
              <select value={severityFilter} onChange={event => setSeverityFilter(event.target.value as SeverityLevel | '')} className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-8 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white">
                <option value="">All severities</option>
                {Object.values(SeverityLevel).map(level => <option key={level}>{level}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Filter by Category</label>
              <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-8 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white">
                <option value="">All categories</option>
                {categories.map(category => <option key={category.name} value={category.name}>{category.name}{category.archivedAt ? ' (Archived)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Category Order</label>
              <select value={orderMode} onChange={event => setOrderMode(event.target.value as typeof orderMode)} className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-8 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white">
                <option value="configured">Configured order</option><option value="alphabetical">Alphabetical</option>
              </select>
            </div>
            {canManage && (
              <label className="flex items-end gap-2 pb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={includeArchived} onChange={event => setIncludeArchived(event.target.checked)} className="rounded border-gray-300 text-violet-600" />
                Include inactive / archived
              </label>
            )}
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        {loading && <Card><div className="p-10 text-center text-slate-500">Loading Code of Discipline…</div></Card>}
        {!loading && visibleCategories.map(category => {
          const categoryEntries = entriesByCategory[category.name] || [];
          const forcedOpen = Boolean(searchTerm || severityFilter || categoryFilter);
          const open = forcedOpen || openCategories.has(category.name);
          return (
            <Card key={category.name} className={category.archivedAt ? 'opacity-75' : ''}>
              <button type="button" onClick={() => !forcedOpen && toggleCategory(category.name)} className="flex w-full items-center justify-between gap-4 p-5 text-left">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{category.name}</h2>
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">{categoryEntries.length} visible / {category.entryCount} total</span>
                    {category.archivedAt && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">Archived</span>}
                  </div>
                  {category.description && <p className="mt-1 text-sm text-slate-500">{category.description}</p>}
                </div>
                {!forcedOpen && <ChevronDownIcon open={open} />}
              </button>

              {open && (
                <div className="border-t border-slate-200 p-4 dark:border-slate-700">
                  {canManage && category.isActive && !category.archivedAt && (
                    <div className="mb-4 flex justify-end"><Button size="sm" onClick={() => openEntry(null, category.name)}>Add Entry to {category.name}</Button></div>
                  )}
                  {categoryEntries.length ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-[1100px] w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900/50 dark:text-slate-300">
                          <tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Severity</th><th className="px-4 py-3">Progressive Sanctions</th><th className="px-4 py-3">Scope</th><th className="px-4 py-3">Last Modified</th>{canManage && <th className="px-4 py-3">Actions</th>}</tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {categoryEntries.map(entry => (
                            <tr key={entry.id} className={entry.isActive === false ? 'opacity-60' : ''}>
                              <td className="px-4 py-4 font-semibold text-slate-900 dark:text-white">{entry.code}{entry.isActive === false && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">Inactive</span>}</td>
                              <td className="max-w-md px-4 py-4 text-slate-700 dark:text-slate-300">{entry.description}</td>
                              <td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${severityClasses[entry.severityLevel]}`}>{entry.severityLevel}</span></td>
                              <td className="px-4 py-4"><ol className="space-y-1">{entry.sanctions.map(sanction => <li key={sanction.offense}><strong>{sanction.offense}.</strong> {sanction.action}</li>)}</ol>{!entry.sanctions.length && <span className="text-slate-400">No sanctions configured</span>}</td>
                              <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{businessUnitName(entry.businessUnitId)}</td>
                              <td className="px-4 py-4 text-slate-500">{entry.lastModifiedAt.toLocaleString()}</td>
                              {canManage && <td className="px-4 py-4"><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => openEntry(entry)}>Edit</Button>{entry.isActive !== false && <Button size="sm" variant="danger" onClick={() => archiveEntry(entry)}>Archive</Button>}</div></td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No entries match the current filters in this category.</div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
        {!loading && !visibleCategories.length && (
          <Card><div className="p-10 text-center text-slate-500"><p className="font-semibold text-slate-700 dark:text-slate-200">No matching Code of Discipline entries</p><p className="mt-1 text-sm">Clear the filters, create a category, or add a new entry.</p></div></Card>
        )}
      </div>

      <DisciplineEntryModal
        isOpen={entryModalOpen}
        onClose={() => setEntryModalOpen(false)}
        entry={selectedEntry}
        onSave={saveEntry}
        categories={activeCategoryNames}
        defaultCategory={defaultCategory}
        businessUnits={businessUnits}
      />
      <CategoryManagerModal
        isOpen={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        categories={categories}
        entries={entries}
        onSave={saveCategories}
      />
      <DisciplineBulkImportModal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        categories={categories}
        businessUnits={businessUnits}
        existingEntries={entries}
        onImported={loadData}
      />
    </div>
  );
};

export default CodeOfDiscipline;
