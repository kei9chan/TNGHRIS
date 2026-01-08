import React, { useState, useEffect } from 'react';
import { DisciplineEntry } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';

// Icons
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;

interface EditableCategory {
    id: number;
    originalName: string;
    currentName: string;
}

interface CategoryManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    categories: string[];
    entries: DisciplineEntry[];
    onSave: (newCategories: string[], renamed: { oldName: string, newName: string }[], deleted: string[]) => void;
}

const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({ isOpen, onClose, categories: initialCategories, entries, onSave }) => {
    const [editableCategories, setEditableCategories] = useState<EditableCategory[]>([]);
    const [newCategoryName, setNewCategoryName] = useState('');

    useEffect(() => {
        if (isOpen) {
            setEditableCategories(initialCategories.map((name, index) => ({ id: index, originalName: name, currentName: name })));
            setNewCategoryName('');
        }
    }, [initialCategories, isOpen]);

    const handleCategoryChange = (id: number, newName: string) => {
        setEditableCategories(prev => prev.map(cat => cat.id === id ? { ...cat, currentName: newName } : cat));
    };

    const handleAddCategory = () => {
        if (newCategoryName.trim() && !editableCategories.some(c => c.currentName.toLowerCase() === newCategoryName.trim().toLowerCase())) {
            const newCategory: EditableCategory = {
                id: Date.now(),
                originalName: '', // Mark as new
                currentName: newCategoryName.trim(),
            };
            setEditableCategories(prev => [...prev, newCategory]);
            setNewCategoryName('');
        }
    };

    const handleDeleteCategory = (id: number) => {
        setEditableCategories(prev => prev.filter(cat => cat.id !== id));
    };

    const handleSave = () => {
        // If a new category was typed but not added via the "+" button, include it
        const trimmedNew = newCategoryName.trim();
        let categoriesToSave = [...editableCategories];
        if (trimmedNew && !editableCategories.some(c => c.currentName.toLowerCase() === trimmedNew.toLowerCase())) {
            categoriesToSave = [
                ...editableCategories,
                { id: Date.now(), originalName: '', currentName: trimmedNew }
            ];
        }

        const renamed = editableCategories
            .filter(c => c.originalName && c.originalName !== c.currentName)
            .map(c => ({ oldName: c.originalName, newName: c.currentName }));

        const currentOriginalNameSet = new Set(categoriesToSave.map(c => c.originalName));
        const deleted = initialCategories.filter(name => name && !currentOriginalNameSet.has(name));
        
        const finalCategoryList = categoriesToSave.map(c => c.currentName);

        onSave(finalCategoryList, renamed, deleted);
    };

    const isCategoryInUse = (categoryName: string) => {
        return entries.some(entry => entry.category === categoryName);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Manage Categories"
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Save Changes</Button>
                </div>
            }
        >
            <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Add, rename, or delete discipline categories. Deleting a category is only possible if it has no associated entries.</p>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                    {editableCategories.map((cat) => (
                        <div key={cat.id} className="flex items-center space-x-2">
                            <Input
                                label=""
                                id={`cat-${cat.id}`}
                                value={cat.currentName}
                                onChange={(e) => handleCategoryChange(cat.id, e.target.value)}
                                className="flex-grow"
                            />
                            <Button 
                                variant="danger" 
                                size="sm" 
                                onClick={() => handleDeleteCategory(cat.id)} 
                                disabled={isCategoryInUse(cat.originalName)}
                                title={isCategoryInUse(cat.originalName) ? "Cannot delete a category that is in use" : "Delete Category"}
                            >
                                <TrashIcon />
                            </Button>
                        </div>
                    ))}
                </div>
                 <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                     <label htmlFor="new-category" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Add New Category</label>
                    <div className="mt-1 flex items-center space-x-2">
                        <Input
                            label=""
                            id="new-category"
                            placeholder="New category name"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                             onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); }}}
                            className="flex-grow"
                        />
                        <Button onClick={handleAddCategory}><PlusIcon/></Button>
                    </div>
                 </div>
            </div>
        </Modal>
    );
};

export default CategoryManagerModal;
