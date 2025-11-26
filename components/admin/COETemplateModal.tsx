
import React, { useState, useEffect, useMemo } from 'react';
import { COETemplate } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import RichTextEditor from '../ui/RichTextEditor';
import FileUploader from '../ui/FileUploader';
import { mockBusinessUnits } from '../../services/mockData';
import { usePermissions } from '../../hooks/usePermissions';

interface COETemplateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (template: COETemplate) => void;
    template: COETemplate | null;
}

const PLACEHOLDERS = [
    '{{employee_name}}',
    '{{position}}',
    '{{date_hired}}',
    '{{salary}}',
    '{{purpose}}',
    '{{date_today}}'
];

const COETemplateModal: React.FC<COETemplateModalProps> = ({ isOpen, onClose, onSave, template }) => {
    const { getAccessibleBusinessUnits } = usePermissions();
    const [current, setCurrent] = useState<Partial<COETemplate>>({});
    
    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);

    useEffect(() => {
        if (isOpen) {
            setCurrent(template || {
                businessUnitId: accessibleBus[0]?.id || '',
                address: '',
                body: '<p>This is to certify that <strong>{{employee_name}}</strong>...</p>',
                signatoryName: '',
                signatoryPosition: '',
                isActive: true
            });
        }
    }, [isOpen, template, accessibleBus]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
             setCurrent(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
        } else {
            setCurrent(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleLogoUpload = (file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            setCurrent(prev => ({ ...prev, logoUrl: reader.result as string }));
        };
        reader.readAsDataURL(file);
    };

    const handleSave = () => {
        if (!current.businessUnitId || !current.body || !current.signatoryName) {
            alert("Please fill in all required fields.");
            return;
        }
        onSave(current as COETemplate);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={template ? 'Edit COE Template' : 'Create COE Template'}
            size="4xl"
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Save Template</Button>
                </div>
            }
        >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                        <select 
                            name="businessUnitId" 
                            value={current.businessUnitId} 
                            onChange={handleChange} 
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                        >
                            {accessibleBus.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                        </select>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Logo</label>
                        <FileUploader onFileUpload={handleLogoUpload} />
                        {current.logoUrl && <img src={current.logoUrl} alt="Logo Preview" className="mt-2 h-16 object-contain border p-1 bg-white" />}
                    </div>

                    <Input label="Address" name="address" value={current.address || ''} onChange={handleChange} placeholder="Company Address" />
                    
                    <div className="border-t pt-4 dark:border-gray-700">
                        <h4 className="font-medium mb-2 text-gray-900 dark:text-white">Signatory</h4>
                        <div className="space-y-3">
                            <Input label="Name" name="signatoryName" value={current.signatoryName || ''} onChange={handleChange} />
                            <Input label="Position" name="signatoryPosition" value={current.signatoryPosition || ''} onChange={handleChange} />
                        </div>
                    </div>
                    
                     <div className="flex items-center">
                        <input 
                            id="isActive" 
                            name="isActive" 
                            type="checkbox" 
                            checked={current.isActive || false} 
                            onChange={handleChange} 
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" 
                        />
                        <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                            Template Active
                        </label>
                    </div>
                </div>

                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md border border-blue-100 dark:border-blue-800 text-sm">
                        <p className="font-bold text-blue-800 dark:text-blue-200 mb-1">Available Placeholders:</p>
                        <div className="flex flex-wrap gap-2">
                            {PLACEHOLDERS.map(p => (
                                <code key={p} className="bg-white dark:bg-slate-800 px-1 py-0.5 rounded border border-blue-200 dark:border-blue-700">{p}</code>
                            ))}
                        </div>
                    </div>
                    <RichTextEditor 
                        label="Certificate Body" 
                        value={current.body || ''} 
                        onChange={(val) => setCurrent(prev => ({ ...prev, body: val }))} 
                        rows={15}
                    />
                </div>
            </div>
        </Modal>
    );
};

export default COETemplateModal;
