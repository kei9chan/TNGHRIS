import React, { useState, useEffect } from 'react';
import { KnowledgeBaseCategory } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';

interface CategoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    category: KnowledgeBaseCategory | null;
    onSave: (category: KnowledgeBaseCategory) => void;
}

const CategoryModal: React.FC<CategoryModalProps> = ({ isOpen, onClose, category, onSave }) => {
    const [current, setCurrent] = useState<Partial<KnowledgeBaseCategory>>({});

    useEffect(() => {
        if (isOpen) {
            setCurrent(category || { name: '', description: '', icon: '' });
        }
    }, [category, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setCurrent(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = () => {
        if (current.name?.trim() && current.description?.trim() && current.icon?.trim()) {
            onSave(current as KnowledgeBaseCategory);
        } else {
            alert('All fields are required.');
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={category ? 'Edit Category' : 'New Category'}
            footer={
                <div className="flex justify-end w-full">
                    <Button onClick={handleSave}>{category ? 'Save Changes' : 'Create Category'}</Button>
                </div>
            }
        >
            <div className="space-y-4">
                <Input label="Category Name" name="name" value={current.name || ''} onChange={handleChange} required />
                <Input label="Description" name="description" value={current.description || ''} onChange={handleChange} required />
                <Input label="Icon (Emoji)" name="icon" value={current.icon || ''} onChange={handleChange} required maxLength={2} />
            </div>
        </Modal>
    );
};

export default CategoryModal;
