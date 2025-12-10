
import React, { useState, useEffect } from 'react';
import { Award, AwardDesign } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import AwardTemplateBuilder from './AwardTemplateBuilder';

interface AwardTemplateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (award: Award) => void;
    award: Award | null;
}

const AwardTemplateModal: React.FC<AwardTemplateModalProps> = ({ isOpen, onClose, onSave, award }) => {
    const [current, setCurrent] = useState<Partial<Award>>(award || {});
    // Initialize design with existing or let builder set default
    const [design, setDesign] = useState<AwardDesign | undefined>(award?.design);

    useEffect(() => {
        if (isOpen) {
            setCurrent(award || { title: '', description: '', badgeIconUrl: '', isActive: true });
            setDesign(award?.design);
        }
    }, [award, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
            setCurrent(prev => ({...prev, [name]: (e.target as HTMLInputElement).checked }));
        } else {
            setCurrent(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSave = () => {
        if (current.title && current.description && current.badgeIconUrl && design) {
            onSave({ ...current, design } as Award);
        } else {
            alert('Title, Description, Icon URL, and Design are required.');
        }
    };
    
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={award ? 'Edit Award Template' : 'Create Award Template'}
            size="4xl" // Increased size for the builder
            footer={
                 <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>{award ? 'Save Changes' : 'Create Award'}</Button>
                </div>
            }
        >
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Award Title" name="title" value={current.title || ''} onChange={handleChange} required placeholder="e.g. Employee of the Month" />
                    <Input label="Badge Icon URL" name="badgeIconUrl" value={current.badgeIconUrl || ''} onChange={handleChange} required placeholder="https://.../icon.png" />
                </div>
                <Textarea label="Description" name="description" value={current.description || ''} onChange={handleChange} rows={2} required placeholder="Short description of what this award represents." />
                
                 <div className="flex items-center">
                    <input id="isActive" name="isActive" type="checkbox" checked={current.isActive} onChange={handleChange} className="h-4 w-4 text-indigo-600 rounded" />
                    <label htmlFor="isActive" className="ml-2 text-sm">Award is Active</label>
                </div>
                
                <div className="pt-4 border-t dark:border-gray-700">
                    <h3 className="text-lg font-medium mb-4">Certificate Design</h3>
                    <AwardTemplateBuilder 
                        initialDesign={design} 
                        onChange={setDesign} 
                        userId={current.createdByUserId as string | undefined}
                    />
                </div>
            </div>
        </Modal>
    );
};

export default AwardTemplateModal;
