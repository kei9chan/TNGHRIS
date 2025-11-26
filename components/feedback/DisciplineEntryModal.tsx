import React, { useState, useEffect } from 'react';
import { DisciplineEntry, SeverityLevel, SanctionStep } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';

const TrashIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>);


interface DisciplineEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: DisciplineEntry | null;
  onSave: (entry: DisciplineEntry) => void;
  categories: string[];
  defaultCategory?: string | null;
}

const DisciplineEntryModal: React.FC<DisciplineEntryModalProps> = ({ isOpen, onClose, entry, onSave, categories, defaultCategory }) => {
  const [currentEntry, setCurrentEntry] = useState<Partial<DisciplineEntry>>(entry || {});

  useEffect(() => {
    if (isOpen) {
        setCurrentEntry(entry || {
            category: defaultCategory || (categories.length > 0 ? categories[0] : ''),
            severityLevel: SeverityLevel.Low,
            sanctions: [{ offense: 1, action: '' }],
        });
    }
  }, [entry, isOpen, categories, defaultCategory]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setCurrentEntry(prev => ({ ...prev, [name]: value }));
  };

  const getOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const handleAddSanction = () => {
    const sanctions = currentEntry.sanctions || [];
    setCurrentEntry(prev => ({
        ...prev,
        sanctions: [...sanctions, { offense: sanctions.length + 1, action: '' }]
    }));
  };

  const handleRemoveSanction = (indexToRemove: number) => {
    setCurrentEntry(prev => ({
        ...prev,
        sanctions: (prev.sanctions || [])
            .filter((_, index) => index !== indexToRemove)
            .map((s, i) => ({ ...s, offense: i + 1 }))
    }));
  };

  const handleSanctionActionChange = (index: number, action: string) => {
    const newSanctions = [...(currentEntry.sanctions || [])];
    newSanctions[index] = { ...newSanctions[index], action };
    setCurrentEntry(prev => ({ ...prev, sanctions: newSanctions }));
  };

  const handleSave = () => {
    if (currentEntry.code && currentEntry.description) {
      const finalSanctions = (currentEntry.sanctions || []).filter(s => s.action.trim() !== '');
      onSave({ ...currentEntry, sanctions: finalSanctions } as DisciplineEntry);
    } else {
        alert("Code and Description are required.");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={entry ? `Edit Entry: ${entry.code}` : 'New Discipline Entry'}
      footer={
        <div className="flex justify-end w-full space-x-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>{entry ? 'Save Changes' : 'Create Entry'}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input label="Code" id="code" name="code" value={currentEntry.code || ''} onChange={handleChange} required />
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>
          <select id="category" name="category" value={currentEntry.category || ''} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="severityLevel" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Severity Level</label>
          <select id="severityLevel" name="severityLevel" value={currentEntry.severityLevel || ''} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
            {Object.values(SeverityLevel).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <Textarea label="Description" id="description" name="description" value={currentEntry.description || ''} onChange={handleChange} rows={4} required />
        
        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Progressive Sanctions</label>
            <div className="mt-2 space-y-2">
                {(currentEntry.sanctions || []).map((sanction, index) => (
                    <div key={index} className="flex items-center space-x-2">
                        <span className="p-2 bg-gray-100 dark:bg-gray-700 rounded-md text-sm font-semibold w-16 text-center">{getOrdinal(sanction.offense)}</span>
                        <Input
                            label=""
                            id={`sanction-action-${index}`}
                            value={sanction.action}
                            onChange={(e) => handleSanctionActionChange(index, e.target.value)}
                            className="flex-grow"
                            placeholder="e.g., Verbal Warning"
                        />
                        <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => handleRemoveSanction(index)}
                            className="!p-2"
                        >
                            <TrashIcon />
                        </Button>
                    </div>
                ))}
            </div>
            <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddSanction}
                className="mt-2"
            >
                + Add Step
            </Button>
        </div>
      </div>
    </Modal>
  );
};

export default DisciplineEntryModal;
