import React, { useEffect, useMemo, useState } from 'react';
import { DisciplineCategory, DisciplineEntry } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: DisciplineCategory[];
  entries: DisciplineEntry[];
  onSave: (categories: DisciplineCategory[]) => void | Promise<void>;
}

const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
  categories,
  entries,
  onSave,
}) => {
  const [editable, setEditable] = useState<DisciplineCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setEditable(categories.map(category => ({ ...category, originalName: category.originalName || category.name })));
    setError(null);
  }, [isOpen, categories]);

  const duplicateNames = useMemo(() => {
    const counts = editable.reduce<Record<string, number>>((result, category) => {
      const key = category.name.trim().toLowerCase();
      if (key) result[key] = (result[key] || 0) + 1;
      return result;
    }, {});
    return new Set(Object.entries(counts).filter(([, count]) => Number(count) > 1).map(([name]) => name));
  }, [editable]);

  const update = (index: number, changes: Partial<DisciplineCategory>) => {
    setEditable(previous => previous.map((category, categoryIndex) => categoryIndex === index
      ? { ...category, ...changes }
      : category));
  };

  const addCategory = () => {
    const nextOrder = Math.max(0, ...editable.map(category => category.displayOrder || 0)) + 10;
    setEditable(previous => [...previous, {
      name: '',
      originalName: undefined,
      description: '',
      displayOrder: nextOrder,
      isActive: true,
      entryCount: 0,
    }]);
  };

  const save = async () => {
    if (editable.some(category => !category.name.trim())) {
      setError('Every category requires a name.');
      return;
    }
    if (duplicateNames.size) {
      setError(`Duplicate category names are not allowed: ${Array.from(duplicateNames).join(', ')}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(editable.map(category => ({
        ...category,
        name: category.name.trim(),
        description: category.description?.trim(),
        displayOrder: Math.max(0, Number(category.displayOrder) || 0),
      })));
    } catch (saveError: any) {
      setError(saveError?.message || 'Categories could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage Code of Discipline Categories"
      size="4xl"
      footer={(
        <div className="flex w-full justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} isLoading={saving}>Save Categories</Button>
        </div>
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-300">Create, rename, order, activate, or safely archive categories. Assigned entries are retained when a category is archived.</p>
          <p className="mt-1 text-xs text-slate-500">Categories are stored in Supabase and are not hardcoded in the interface.</p>
        </div>
        <Button size="sm" onClick={addCategory}>Add Category</Button>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-200">{error}</div>}

      <div className="space-y-3">
        {editable
          .map((category, index) => ({ category, index }))
          .sort((left, right) => left.category.displayOrder - right.category.displayOrder || left.category.name.localeCompare(right.category.name))
          .map(({ category, index }) => {
            const actualCount = entries.filter(entry => entry.category === (category.originalName || category.name)).length;
            const isDuplicate = duplicateNames.has(category.name.trim().toLowerCase());
            const archived = Boolean(category.archivedAt);
            return (
              <div key={`${category.originalName || 'new'}-${index}`} className={`rounded-lg border p-4 ${archived ? 'border-slate-300 bg-slate-50 opacity-80 dark:border-slate-700 dark:bg-slate-900/40' : 'border-slate-200 dark:border-slate-700'}`}>
                <div className="grid gap-3 md:grid-cols-[1.1fr_1.5fr_110px]">
                  <Input
                    label="Category Name *"
                    value={category.name}
                    onChange={event => update(index, { name: event.target.value })}
                    className={isDuplicate ? '!border-red-400' : ''}
                  />
                  <Input
                    label="Description"
                    value={category.description || ''}
                    onChange={event => update(index, { description: event.target.value })}
                    placeholder="What this category covers"
                  />
                  <Input
                    label="Display Order"
                    type="number"
                    min={0}
                    value={category.displayOrder}
                    onChange={event => update(index, { displayOrder: Number(event.target.value) })}
                  />
                </div>
                <div className="mt-3 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-indigo-50 px-2 py-1 font-semibold text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300">{actualCount} entr{actualCount === 1 ? 'y' : 'ies'}</span>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={category.isActive && !archived}
                        onChange={event => update(index, { isActive: event.target.checked, archivedAt: undefined })}
                        disabled={archived}
                        className="rounded border-slate-300 text-violet-600"
                      />
                      Active
                    </label>
                  </div>
                  <button
                    type="button"
                    className={`font-semibold underline ${archived ? 'text-green-700' : 'text-amber-700'}`}
                    onClick={() => update(index, archived
                      ? { archivedAt: undefined, isActive: true }
                      : { archivedAt: new Date(), isActive: false })}
                  >
                    {archived ? 'Restore category' : `Archive${actualCount ? ` (preserve ${actualCount})` : ''}`}
                  </button>
                </div>
              </div>
            );
          })}
        {!editable.length && (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No categories yet. Add the first category to continue.</div>
        )}
      </div>
    </Modal>
  );
};

export default CategoryManagerModal;
