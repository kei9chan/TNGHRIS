
import React, { useState, useEffect } from 'react';
import { Award, AwardDesign, BusinessUnit } from '../../types';
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
    businessUnits: BusinessUnit[];
    isDuplicate?: boolean;
}

const AwardTemplateModal: React.FC<AwardTemplateModalProps> = ({ isOpen, onClose, onSave, award, businessUnits, isDuplicate = false }) => {
    const [current, setCurrent] = useState<Partial<Award>>(award || {});
    // Initialize design with existing or let builder set default
    const [design, setDesign] = useState<AwardDesign | undefined>(award?.design);

    useEffect(() => {
        if (isOpen) {
            setCurrent(award || { title: '', description: '', badgeIconUrl: '', isActive: true, isDefault: false });
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
        if (current.title && current.description && design) {
            onSave({ ...current, id: isDuplicate ? '' : current.id, presetKey: isDuplicate ? undefined : current.presetKey, isPreset: isDuplicate ? false : current.isPreset, design } as Award);
        } else {
            alert('Title, description, and certificate design are required.');
        }
    };
    
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isDuplicate ? 'Duplicate Award Template' : award ? 'Edit Award Template' : 'Create Award Template'}
            size="4xl" // Increased size for the builder
            footer={
                 <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>{isDuplicate ? 'Save Copy' : award ? 'Save Changes' : 'Create Award'}</Button>
                </div>
            }
        >
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Award Title" name="title" value={current.title || ''} onChange={handleChange} required placeholder="e.g. Employee of the Month" />
                    <Input label="Badge Icon URL (Optional)" name="badgeIconUrl" value={current.badgeIconUrl || ''} onChange={handleChange} placeholder="https://.../icon.png" />
                    <Input label="Award Category" name="category" value={current.category || ''} onChange={handleChange} placeholder="e.g. Employee Recognition" />
                    <Input label="Optional Award Value / Recognition" name="awardValueLabel" value={current.awardValueLabel || ''} onChange={handleChange} placeholder="e.g. ₱5,000 incentive" />
                </div>
                <Textarea label="Description" name="description" value={current.description || ''} onChange={handleChange} rows={2} required placeholder="Short description of what this award represents." />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="text-sm font-medium">
                        Business Unit
                        <select
                            name="businessUnitId"
                            value={current.businessUnitId || ''}
                            onChange={event => setCurrent(previous => ({ ...previous, businessUnitId: event.target.value || undefined, isDefault: event.target.value ? previous.isDefault : false }))}
                            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                        >
                            <option value="">Company-wide</option>
                            {[...businessUnits].sort((a, b) => a.name.localeCompare(b.name)).map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                        </select>
                    </label>
                    <div className="flex items-end gap-6 pb-2">
                        <label className="flex items-center">
                            <input id="isActive" name="isActive" type="checkbox" checked={current.isActive ?? true} onChange={handleChange} className="h-4 w-4 text-indigo-600 rounded" />
                            <span className="ml-2 text-sm">Active</span>
                        </label>
                        <label className="flex items-center">
                            <input id="isDefault" name="isDefault" type="checkbox" disabled={!current.businessUnitId} checked={current.isDefault ?? false} onChange={handleChange} className="h-4 w-4 text-indigo-600 rounded" />
                            <span className="ml-2 text-sm">Default for this BU</span>
                        </label>
                    </div>
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
