
import React, { useState, useEffect } from 'react';
import { AwardDesign, AwardSignatory } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import FileUploader from '../ui/FileUploader';
import CertificateRenderer from './CertificateRenderer';

interface AwardTemplateBuilderProps {
    initialDesign?: AwardDesign;
    onChange: (design: AwardDesign) => void;
}

const defaultDesign: AwardDesign = {
    backgroundColor: '#ffffff',
    backgroundImageUrl: '',
    borderWidth: 10,
    borderColor: '#1e3a8a', // dark blue
    fontFamily: 'serif',
    titleColor: '#1e3a8a',
    textColor: '#374151',
    headerText: 'CERTIFICATE OF ACHIEVEMENT',
    bodyText: 'This certificate is proudly presented to\n\n{{employee_name}}\n\nfor outstanding performance and dedication.\n\nAwarded on {{date}}.',
    signatories: [
        { name: 'Signatory Name', title: 'Title' }
    ],
    logoUrl: ''
};

const fonts = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy'];

const AwardTemplateBuilder: React.FC<AwardTemplateBuilderProps> = ({ initialDesign, onChange }) => {
    const [design, setDesign] = useState<AwardDesign>(initialDesign || defaultDesign);
    const [activeTab, setActiveTab] = useState<'content' | 'style' | 'signatories'>('style');

    useEffect(() => {
        onChange(design);
    }, [design, onChange]);

    const handleDesignChange = (field: keyof AwardDesign, value: any) => {
        setDesign(prev => ({ ...prev, [field]: value }));
    };

    const handleSignatoryChange = (index: number, field: keyof AwardSignatory, value: string) => {
        const newSignatories = [...design.signatories];
        newSignatories[index] = { ...newSignatories[index], [field]: value };
        setDesign(prev => ({ ...prev, signatories: newSignatories }));
    };

    const addSignatory = () => {
        setDesign(prev => ({
            ...prev,
            signatories: [...prev.signatories, { name: 'Name', title: 'Title' }]
        }));
    };

    const removeSignatory = (index: number) => {
        setDesign(prev => ({
            ...prev,
            signatories: prev.signatories.filter((_, i) => i !== index)
        }));
    };

    const handleFileUpload = (field: keyof AwardDesign, file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            handleDesignChange(field, reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleSignatureUpload = (index: number, file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
             const newSignatories = [...design.signatories];
             newSignatories[index].signatureUrl = reader.result as string;
             setDesign(prev => ({ ...prev, signatories: newSignatories }));
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 h-[700px]">
            {/* Controls Panel */}
            <div className="w-full lg:w-1/3 flex flex-col border rounded-md dark:border-gray-700 bg-white dark:bg-slate-800 overflow-hidden">
                <div className="flex border-b dark:border-gray-700">
                    <button onClick={() => setActiveTab('style')} className={`flex-1 py-3 text-sm font-medium ${activeTab === 'style' ? 'bg-indigo-50 text-indigo-700 dark:bg-slate-700 dark:text-white border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>Style</button>
                    <button onClick={() => setActiveTab('content')} className={`flex-1 py-3 text-sm font-medium ${activeTab === 'content' ? 'bg-indigo-50 text-indigo-700 dark:bg-slate-700 dark:text-white border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>Content</button>
                    <button onClick={() => setActiveTab('signatories')} className={`flex-1 py-3 text-sm font-medium ${activeTab === 'signatories' ? 'bg-indigo-50 text-indigo-700 dark:bg-slate-700 dark:text-white border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>Signatories</button>
                </div>
                
                <div className="flex-grow overflow-y-auto p-4 space-y-4">
                    {activeTab === 'style' && (
                        <>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium">Background Color</label>
                                <div className="flex items-center gap-2">
                                    <input type="color" value={design.backgroundColor} onChange={e => handleDesignChange('backgroundColor', e.target.value)} className="h-8 w-8 p-0 border-0 cursor-pointer" />
                                    <Input label="" value={design.backgroundColor} onChange={e => handleDesignChange('backgroundColor', e.target.value)} />
                                </div>
                            </div>
                             <div>
                                <label className="block text-sm font-medium mb-1">Background Image</label>
                                <FileUploader onFileUpload={(f) => handleFileUpload('backgroundImageUrl', f)} />
                                {design.backgroundImageUrl && <button onClick={() => handleDesignChange('backgroundImageUrl', '')} className="text-xs text-red-500 mt-1">Remove Image</button>}
                            </div>
                             <div className="space-y-2">
                                <label className="block text-sm font-medium">Border</label>
                                <div className="flex gap-2">
                                    <Input type="number" label="Width (px)" value={design.borderWidth} onChange={e => handleDesignChange('borderWidth', parseInt(e.target.value))} />
                                    <div className="flex flex-col">
                                        <label className="text-xs text-gray-500 mb-1">Color</label>
                                        <input type="color" value={design.borderColor} onChange={e => handleDesignChange('borderColor', e.target.value)} className="h-9 w-full p-0 border-0 cursor-pointer" />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Font Family</label>
                                <select value={design.fontFamily} onChange={e => handleDesignChange('fontFamily', e.target.value)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                                    {fonts.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Title Color</label>
                                    <input type="color" value={design.titleColor} onChange={e => handleDesignChange('titleColor', e.target.value)} className="h-8 w-full p-0 border-0 cursor-pointer" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Text Color</label>
                                    <input type="color" value={design.textColor} onChange={e => handleDesignChange('textColor', e.target.value)} className="h-8 w-full p-0 border-0 cursor-pointer" />
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === 'content' && (
                        <>
                             <div>
                                <label className="block text-sm font-medium mb-1">Logo</label>
                                <FileUploader onFileUpload={(f) => handleFileUpload('logoUrl', f)} />
                                {design.logoUrl && <img src={design.logoUrl} alt="logo" className="h-10 mt-2" />}
                            </div>
                            <Input label="Header Text" value={design.headerText} onChange={e => handleDesignChange('headerText', e.target.value)} />
                            <div>
                                <label className="block text-sm font-medium mb-1">Body Text</label>
                                <Textarea label="" value={design.bodyText} onChange={e => handleDesignChange('bodyText', e.target.value)} rows={6} />
                                <p className="text-xs text-gray-500 mt-1">Use: {'{{employee_name}}'}, {'{{date}}'}, {'{{award_title}}'}</p>
                            </div>
                        </>
                    )}

                    {activeTab === 'signatories' && (
                        <div className="space-y-4">
                            {design.signatories.map((sig, idx) => (
                                <div key={idx} className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded border dark:border-gray-600 relative">
                                    <button onClick={() => removeSignatory(idx)} className="absolute top-2 right-2 text-red-500 hover:text-red-700 text-xs">Remove</button>
                                    <div className="space-y-2">
                                        <Input label="Name" value={sig.name} onChange={e => handleSignatoryChange(idx, 'name', e.target.value)} />
                                        <Input label="Title" value={sig.title} onChange={e => handleSignatoryChange(idx, 'title', e.target.value)} />
                                        <div>
                                            <label className="block text-xs font-medium mb-1">Signature Image</label>
                                            <FileUploader onFileUpload={(f) => handleSignatureUpload(idx, f)} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <Button variant="secondary" onClick={addSignatory} className="w-full">+ Add Signatory</Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Preview Panel */}
            <div className="w-full lg:w-2/3 bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4 overflow-hidden border rounded-md dark:border-gray-700 relative">
                <p className="absolute top-2 left-2 text-xs text-gray-400 font-mono uppercase">Preview Mode</p>
                <div style={{ transform: 'scale(0.6)', transformOrigin: 'center' }}>
                     <CertificateRenderer 
                        design={design} 
                        data={{
                            employeeName: 'John Doe',
                            date: new Date(),
                            awardTitle: 'Award Title',
                            citation: 'For exceptional dedication...'
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

export default AwardTemplateBuilder;
