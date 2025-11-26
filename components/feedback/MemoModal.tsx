import React, { useState, useEffect, useMemo } from 'react';
import { Memo } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import SearchableMultiSelect, { SearchableItem } from '../ui/SearchableMultiSelect';
import { mockBusinessUnits, mockDepartments } from '../../services/mockData';
import RichTextEditor from '../ui/RichTextEditor';
import { usePermissions } from '../../hooks/usePermissions';

interface MemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  memo: Memo | null;
  onSave: (memo: Memo) => void;
}

const MemoModal: React.FC<MemoModalProps> = ({ isOpen, onClose, memo, onSave }) => {
  const { getAccessibleBusinessUnits } = usePermissions();
  const [currentMemo, setCurrentMemo] = useState<Partial<Memo>>(memo || {});

  const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);

  const buItems: SearchableItem[] = useMemo(() => [
      { id: 'All', label: 'All My Business Units' },
      ...accessibleBus.map(bu => ({ id: bu.name, label: bu.name }))
  ], [accessibleBus]);

  const deptItems: SearchableItem[] = useMemo(() => [
      { id: 'All', label: 'All Departments' },
      ...mockDepartments.map(dept => ({ id: dept.name, label: dept.name }))
  ], []);


  useEffect(() => {
    setCurrentMemo(memo || {
      targetDepartments: ['All'],
      targetBusinessUnits: ['All'],
      acknowledgementRequired: false,
      tags: [],
      attachments: [],
      acknowledgementTracker: [],
      body: '',
    });
  }, [memo, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
        const { checked } = e.target as HTMLInputElement;
        setCurrentMemo(prev => ({ ...prev, [name]: checked }));
    } else {
        setCurrentMemo(prev => ({ ...prev, [name]: value }));
    }
  };
  
  const handleTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const tags = e.target.value.split(',').map(tag => tag.trim()).filter(Boolean);
      setCurrentMemo(prev => ({ ...prev, tags }));
  };
  
  const handleSelectionChange = (
    field: 'targetBusinessUnits' | 'targetDepartments',
    ids: string[]
  ) => {
    const previousIds = currentMemo[field] || [];
    // If user selects "All", make it the only selection
    if (ids.includes('All') && !previousIds.includes('All')) {
        setCurrentMemo(prev => ({ ...prev, [field]: ['All'] }));
    } 
    // If user had "All" selected and now selects something else, remove "All"
    else if (ids.length > 1 && previousIds.includes('All')) {
         setCurrentMemo(prev => ({ ...prev, [field]: ids.filter(id => id !== 'All') }));
    }
    // Otherwise, just update with the new selection
    else {
         setCurrentMemo(prev => ({ ...prev, [field]: ids }));
    }
  };


  const handleSave = () => {
    // Basic validation
    if (currentMemo.title && currentMemo.body) {
      onSave(currentMemo as Memo);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={memo ? `Edit Memo: ${memo.title}` : 'New Memo'}
      footer={
        <div className="flex justify-end w-full space-x-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>{memo ? 'Save Changes' : 'Create Memo'}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input label="Title" id="title" name="title" value={currentMemo.title || ''} onChange={handleChange} required />
        <Input label="Effective Date" id="effectiveDate" name="effectiveDate" type="date" value={currentMemo.effectiveDate ? new Date(currentMemo.effectiveDate).toISOString().split('T')[0] : ''} onChange={handleChange} required />
        
        <SearchableMultiSelect
            label="Target Business Units"
            placeholder="Search for BUs..."
            items={buItems}
            selectedItemIds={currentMemo.targetBusinessUnits || []}
            onSelectionChange={(ids) => handleSelectionChange('targetBusinessUnits', ids)}
            variant="primary"
        />

        <SearchableMultiSelect
            label="Target Departments"
            placeholder="Search for Departments..."
            items={deptItems}
            selectedItemIds={currentMemo.targetDepartments || []}
            onSelectionChange={(ids) => handleSelectionChange('targetDepartments', ids)}
            variant="primary"
        />
        
        <Input label="Tags (comma-separated)" id="tags" name="tags" value={currentMemo.tags?.join(', ') || ''} onChange={handleTagsChange} />
        
        <RichTextEditor
          label="Body"
          value={currentMemo.body || ''}
          onChange={(value) => setCurrentMemo(prev => ({ ...prev, body: value }))}
          rows={10}
          placeholder="Enter the memo content here..."
        />
        
        <div className="flex items-center">
            <input id="acknowledgementRequired" name="acknowledgementRequired" type="checkbox" checked={currentMemo.acknowledgementRequired || false} onChange={handleChange} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" />
            <label htmlFor="acknowledgementRequired" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                Acknowledgement Required
            </label>
        </div>
      </div>
    </Modal>
  );
};

export default MemoModal;