import React, { useState, useEffect, useRef } from 'react';
import { ContractTemplate, ContractTemplateSection, SignatoryBlock } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import RichTextEditor from '../ui/RichTextEditor';

interface TemplateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  template: Partial<ContractTemplate> | null;
  onSave: (template: Partial<ContractTemplate>) => void;
}

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

const TrashIcon: React.FC = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;

const defaultAcknowledgmentText = `<p>ACKNOWLEDGMENT</p><p><br></p><p>REPUBLIC OF THE PHILIPPINES )</p><p>MAKATI CITY ) S.S.</p><p><br></p><p>BEFORE ME, a Notary Public for and in the City of Makati, personally appeared the following:</p><p><br></p><p><em>[The table of parties will be dynamically inserted here during PDF generation based on the data entered below.]</em></p><p><br></p><p>known to me to be the same persons who executed the foregoing instrument, and who acknowledged to me that the same is their free and voluntary act and deed, as well as the free and voluntary act and deed of the entity represented herein.</p><p><br></p><p>This Instrument, consists of {{total_pages}} pages including this page where the Acknowledgement is written and is signed by the parties and their instrumental witnesses on each and every page thereof.</p><p><br></p><p><strong>WITNESS MY HAND AND SEAL</strong> this ______ day of ________________ 2024 at the place first above written.</p><p>Doc. No. ____;</p><p>Page No. ____;</p><p>Book No. ____;</p><p>Series of 2024.</p>`;


const TemplateDrawer: React.FC<TemplateDrawerProps> = ({ isOpen, onClose, template, onSave }) => {
    const [current, setCurrent] = useState<Partial<ContractTemplate>>({});
    const logoUploadRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setCurrent(template || {
                title: '',
                owningBusinessUnitId: 'bu-tng', // Default
                isDefault: false,
                logoPosition: 'left',
                logoMaxWidth: 200,
                body: '',
                sections: [],
                footer: '',
                companySignatory: {},
                employeeSignatory: {},
                witnesses: [],
                acknowledgmentBody: defaultAcknowledgmentText,
                acknowledgmentParties: [],
            });
        }
    }, [template, isOpen]);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        
        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setCurrent(prev => ({ ...prev, [name]: checked }));
            return;
        }

        setCurrent(prev => ({ ...prev, [name]: type === 'number' ? parseInt(value) || 0 : value }));
    };
    
    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const base64 = await fileToBase64(file);
            setCurrent(prev => ({...prev, logoUrl: base64}));
        }
    };

    // Section handlers
    const handleAddSection = () => {
        const newSection: ContractTemplateSection = {
            id: `section-${Date.now()}`,
            title: '',
            body: '',
        };
        setCurrent(prev => ({ ...prev, sections: [...(prev.sections || []), newSection] }));
    };

    const handleRemoveSection = (id: string) => {
        setCurrent(prev => ({ ...prev, sections: prev.sections?.filter(s => s.id !== id) }));
    };

    const handleSectionChange = (id: string, field: 'title' | 'body', value: string) => {
        setCurrent(prev => ({
            ...prev,
            sections: prev.sections?.map(s => s.id === id ? { ...s, [field]: value } : s)
        }));
    };
    
    const handleSignatoryChange = (
        block: 'companySignatory' | 'employeeSignatory',
        field: keyof SignatoryBlock,
        value: string
    ) => {
        setCurrent(prev => ({
            ...prev,
            [block]: {
                ...(prev[block] || {}),
                [field]: value,
            },
        }));
    };

    const handleAddWitness = () => {
        const newWitness = { id: `witness-${Date.now()}`, name: '' };
        setCurrent(prev => ({ ...prev, witnesses: [...(prev.witnesses || []), newWitness] }));
    };

    const handleRemoveWitness = (id: string) => {
        setCurrent(prev => ({ ...prev, witnesses: prev.witnesses?.filter(w => w.id !== id) }));
    };

    const handleWitnessChange = (id: string, value: string) => {
        setCurrent(prev => ({
            ...prev,
            witnesses: prev.witnesses?.map(w => w.id === id ? { ...w, name: value } : w)
        }));
    };

    const handleAddParty = () => {
        const newParty = { id: `party-${Date.now()}`, name: '', idProof: '', idIssue: '' };
        setCurrent(prev => ({
            ...prev,
            acknowledgmentParties: [...(prev.acknowledgmentParties || []), newParty]
        }));
    };

    const handleRemoveParty = (id: string) => {
        setCurrent(prev => ({
            ...prev,
            acknowledgmentParties: prev.acknowledgmentParties?.filter(p => p.id !== id)
        }));
    };

    const handlePartyChange = (id: string, field: 'name' | 'idProof' | 'idIssue', value: string) => {
        setCurrent(prev => ({
            ...prev,
            acknowledgmentParties: prev.acknowledgmentParties?.map(p =>
                p.id === id ? { ...p, [field]: value } : p
            )
        }));
    };


    const handleSave = () => {
        if (!current.title?.trim() || !current.body?.trim()) {
            alert('Template Name and Introduction Body are required.');
            return;
        }
        onSave(current);
    };

    const footer = (
        <div className="flex justify-end w-full space-x-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>{template?.id ? 'Save Changes' : 'Create Template'}</Button>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={template?.id ? 'Edit Template' : 'New Template'}
            footer={footer}
            size="4xl"
        >
            <div className="space-y-6">
                <Input label="Template Name *" name="title" value={current.title || ''} onChange={handleChange} required autoFocus />
                
                 <div className="flex items-center">
                    <input type="checkbox" id="isDefault" name="isDefault" checked={current.isDefault || false} onChange={handleChange} className="h-4 w-4 text-indigo-600 border-gray-300 rounded" />
                    <label htmlFor="isDefault" className="ml-2 text-sm text-gray-700 dark:text-gray-300">Set as default template for this company</label>
                </div>

                <div className="p-4 border rounded-md dark:border-gray-600 space-y-4">
                    <h3 className="font-semibold text-lg">Logo Settings</h3>
                    <div className="relative flex items-center">
                        <input
                            type="text"
                            name="logoUrl"
                            placeholder="https://example.com/logo.png or paste data URI..."
                            value={current.logoUrl || ''}
                            onChange={handleChange}
                            className="block w-full pr-24 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                        />
                        <input type="file" ref={logoUploadRef} onChange={handleLogoUpload} accept="image/*" className="hidden" />
                        <Button
                            type="button"
                            onClick={() => logoUploadRef.current?.click()}
                            variant="secondary"
                            className="absolute right-1"
                        >
                            Upload
                        </Button>
                    </div>
                    {current.logoUrl && <img src={current.logoUrl} alt="Logo Preview" className="mt-2 max-h-20 border p-1 rounded-md" />}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium">Position</label>
                            <select name="logoPosition" value={current.logoPosition || 'left'} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                                <option value="left">Left</option>
                                <option value="center">Center</option>
                                <option value="right">Right</option>
                            </select>
                        </div>
                        <Input label="Max Width (px)" name="logoMaxWidth" type="number" value={current.logoMaxWidth || ''} onChange={handleChange} />
                    </div>
                </div>
                
                <RichTextEditor 
                    label="Body / Introduction"
                    value={current.body || ''}
                    onChange={(value) => setCurrent(prev => ({...prev, body: value}))}
                />

                <div className="space-y-4 pt-4 border-t dark:border-gray-600">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold">Additional Sections</h3>
                        <Button variant="secondary" onClick={handleAddSection}>+ Add Section</Button>
                    </div>

                    {(current.sections || []).map((section, index) => (
                        <div key={section.id || index} className="p-4 border rounded-md dark:border-gray-700 space-y-3 relative bg-gray-50 dark:bg-slate-900/50">
                            <Button variant="danger" size="sm" className="!p-1 absolute top-2 right-2" onClick={() => handleRemoveSection(section.id)}>
                                <TrashIcon />
                            </Button>
                            <Input
                                label="Section Title (e.g., Payment Schedule, Cancellation Policy)"
                                value={section.title}
                                onChange={(e) => handleSectionChange(section.id, 'title', e.target.value)}
                            />
                            <RichTextEditor
                                value={section.body}
                                onChange={(value) => handleSectionChange(section.id, 'body', value)}
                                rows={5}
                            />
                        </div>
                    ))}
                </div>
                
                <div className="space-y-4 pt-4 border-t dark:border-gray-600">
                    <h3 className="text-lg font-semibold">Signatory Blocks</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Company Signatory */}
                        <div className="p-4 border rounded-md dark:border-gray-700 space-y-3">
                            <h4 className="font-medium">Company Signatory</h4>
                            <Input 
                                label="Name" 
                                name="companySignatory.name" 
                                value={current.companySignatory?.name || ''} 
                                onChange={e => handleSignatoryChange('companySignatory', 'name', e.target.value)}
                            />
                            <Input 
                                label="Position" 
                                name="companySignatory.position" 
                                value={current.companySignatory?.position || ''} 
                                onChange={e => handleSignatoryChange('companySignatory', 'position', e.target.value)}
                            />
                            <Input 
                                label="Company (Optional)" 
                                name="companySignatory.company" 
                                value={current.companySignatory?.company || ''} 
                                onChange={e => handleSignatoryChange('companySignatory', 'company', e.target.value)}
                            />
                        </div>
                        {/* Employee Signatory */}
                        <div className="p-4 border rounded-md dark:border-gray-700 space-y-3">
                            <h4 className="font-medium">Employee Signatory</h4>
                            <Input 
                                label="Name Label" 
                                name="employeeSignatory.name"
                                placeholder="e.g., NAME or {{employee_name}}"
                                value={current.employeeSignatory?.name || ''} 
                                onChange={e => handleSignatoryChange('employeeSignatory', 'name', e.target.value)}
                            />
                            <Input 
                                label="Position Label" 
                                name="employeeSignatory.position"
                                placeholder="e.g., Position"
                                value={current.employeeSignatory?.position || ''} 
                                onChange={e => handleSignatoryChange('employeeSignatory', 'position', e.target.value)}
                            />
                            <Input 
                                label="Company Label (Optional)" 
                                name="employeeSignatory.company" 
                                placeholder="e.g., Company"
                                value={current.employeeSignatory?.company || ''} 
                                onChange={e => handleSignatoryChange('employeeSignatory', 'company', e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-4 pt-4 border-t dark:border-gray-600">
                    <h3 className="text-lg font-semibold">Witnesses</h3>
                    {(current.witnesses || []).map((witness, index) => (
                        <div key={witness.id} className="flex items-end space-x-2">
                            <div className="flex-grow">
                                <Input
                                    label={`Witness ${index + 1} Name Label`}
                                    value={witness.name}
                                    onChange={(e) => handleWitnessChange(witness.id, e.target.value)}
                                />
                            </div>
                            <Button variant="danger" size="sm" onClick={() => handleRemoveWitness(witness.id)}>Remove</Button>
                        </div>
                    ))}
                    <Button variant="secondary" size="sm" onClick={handleAddWitness}>+ Add Witness</Button>
                </div>

                <div className="space-y-4 pt-4 border-t dark:border-gray-600">
                    <h3 className="text-lg font-semibold">Footer</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        This content will appear at the bottom of each page in the generated PDF. You can use placeholders like <code>{`{{page}}`}</code> for page numbering.
                    </p>
                    <RichTextEditor
                        label="Footer Content"
                        value={current.footer || ''}
                        onChange={(value) => setCurrent(prev => ({...prev, footer: value}))}
                        rows={4}
                    />
                </div>

                <div className="space-y-4 pt-4 border-t dark:border-gray-600">
                    <h3 className="text-lg font-semibold">Acknowledgment (Last Page)</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        This content will appear on the final page of the PDF, typically for notarization.
                    </p>
                    <RichTextEditor
                        label="Acknowledgment Text"
                        value={current.acknowledgmentBody || ''}
                        onChange={(value) => setCurrent(prev => ({...prev, acknowledgmentBody: value}))}
                        rows={8}
                    />
                    <div className="space-y-4 pt-4 border-t dark:border-gray-700">
                        <h4 className="font-medium">Parties Appearing in Acknowledgment</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Add the names and details of individuals who will appear before the notary. These will be added to a table in the acknowledgment page.</p>
                        {(current.acknowledgmentParties || []).map((party) => (
                             <div key={party.id} className="p-3 border rounded-md dark:border-gray-700 bg-gray-100 dark:bg-slate-800/50 relative">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <Input
                                        label="Name"
                                        id={`party-name-${party.id}`}
                                        value={party.name}
                                        onChange={(e) => handlePartyChange(party.id, 'name', e.target.value)}
                                        placeholder="e.g., John Doe"
                                    />
                                    <Input
                                        label="Valid Proof of Identification"
                                        id={`party-idProof-${party.id}`}
                                        value={party.idProof}
                                        onChange={(e) => handlePartyChange(party.id, 'idProof', e.target.value)}
                                        placeholder="e.g., Passport No. 123"
                                    />
                                    <Input
                                        label="Date/Place Issued"
                                        id={`party-idIssue-${party.id}`}
                                        value={party.idIssue}
                                        onChange={(e) => handlePartyChange(party.id, 'idIssue', e.target.value)}
                                        placeholder="e.g., 01/01/2024 / Manila"
                                    />
                                </div>
                                <Button variant="danger" size="sm" onClick={() => handleRemoveParty(party.id)} className="!p-1 absolute top-2 right-2">
                                    <TrashIcon />
                                </Button>
                            </div>
                        ))}
                        <Button variant="secondary" size="sm" onClick={handleAddParty}>+ Add Party</Button>
                    </div>
                </div>

            </div>
        </Modal>
    );
};

export default TemplateDrawer;
