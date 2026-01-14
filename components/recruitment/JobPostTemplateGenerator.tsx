
import React, { useState, useRef, useEffect } from 'react';
import { JobPostVisualTemplate } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import html2canvas from 'html2canvas';

interface JobPostTemplateGeneratorProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (template: JobPostVisualTemplate) => void;
    template?: JobPostVisualTemplate | null;
    saving?: boolean;
}

// --- Helper Components ---

const ColorPickerInput = ({ label, value, onChange }: { label: string, value: string, onChange: (val: string) => void }) => (
    <div>
        <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">{label}</label>
        <div className="flex items-center space-x-2 bg-slate-800 p-1 rounded-md border border-slate-700">
            <div className="relative h-8 w-8 rounded overflow-hidden shadow-sm shrink-0 cursor-pointer">
                <input
                    type="color"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="absolute -top-2 -left-2 h-12 w-12 p-0 border-0 cursor-pointer"
                />
            </div>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="flex-grow bg-transparent border-none text-white text-sm font-mono focus:ring-0 uppercase"
                maxLength={7}
            />
        </div>
    </div>
);

const SectionHeader = ({ title }: { title: string }) => (
    <div className="flex items-center gap-2 mt-6 mb-3 pb-1 border-b border-slate-700">
        <span className="text-xs font-bold uppercase text-indigo-400 tracking-widest">{title}</span>
    </div>
);

const InputGroup = ({ label, value, onChange, placeholder, type = "text", as = "input" }: any) => (
    <div className="mb-3">
        <label className="block text-xs font-medium text-slate-300 mb-1.5">{label}</label>
        {as === 'textarea' ? (
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-slate-500"
                placeholder={placeholder}
                rows={4}
            />
        ) : (
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-slate-500"
                placeholder={placeholder}
            />
        )}
    </div>
);

const ImageUploader = ({ label, image, onUpload, onRemove }: { label: string, image: string, onUpload: (f: File) => void, onRemove: () => void }) => {
    const fileInput = useRef<HTMLInputElement>(null);
    
    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            onUpload(e.target.files[0]);
        }
    };

    return (
        <div className="mb-4">
            <label className="block text-xs font-medium text-slate-300 mb-1.5">{label}</label>
            <div className="flex items-center gap-3">
                <div 
                    onClick={() => fileInput.current?.click()}
                    className="h-12 w-12 rounded-md border border-dashed border-slate-500 bg-slate-800 flex items-center justify-center cursor-pointer hover:bg-slate-700 transition-colors overflow-hidden relative"
                >
                    {image ? (
                        <img src={image} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-slate-500 text-xs">+</span>
                    )}
                </div>
                <div className="flex flex-col gap-1">
                    <button onClick={() => fileInput.current?.click()} className="text-xs text-indigo-400 hover:text-indigo-300 text-left">Upload Image</button>
                    {image && <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-300 text-left">Remove</button>}
                </div>
                <input type="file" ref={fileInput} onChange={handleFile} className="hidden" accept="image/*" />
            </div>
        </div>
    );
};

// --- Main Component ---

const defaultConfig = {
    // Appearance
    backgroundColor: '#FDEEF4', // Soft Pink
    cardColor: '#FFFFFF',
    textColor: '#1F2937',
    accentColor: '#EF4444', // Red/Pink accent

    // Images (Base64)
    backgroundImage: '',
    logoImage: '',

    // Header
    headline: '[TEXT_PLACEHOLDER - MAIN HEADLINE]',
    jobTitle: '[TEXT_PLACEHOLDER - JOB TITLE]',
    description: '[TEXT_PLACEHOLDER - SHORT DESCRIPTION]',

    // Icons Grid (4 items)
    details: [
        { icon: '', label: '[TEXT_PLACEHOLDER - LABEL]' },
        { icon: '', label: '[TEXT_PLACEHOLDER - LABEL]' },
        { icon: '', label: '[TEXT_PLACEHOLDER - LABEL]' },
        { icon: '', label: '[TEXT_PLACEHOLDER - LABEL]' },
    ],

    // Two Column Section
    col1Title: '[TEXT_PLACEHOLDER - SECTION TITLE]',
    col1Content: '[TEXT_PLACEHOLDER]\n[TEXT_PLACEHOLDER]\n[TEXT_PLACEHOLDER]',
    col2Title: '[TEXT_PLACEHOLDER - SECTION TITLE]',
    col2Content: '[TEXT_PLACEHOLDER]\n[TEXT_PLACEHOLDER]\n[TEXT_PLACEHOLDER]',

    // Contact & Footer
    contactTitle: '[TEXT_PLACEHOLDER - CONTACT TITLE]',
    email1: '[TEXT_PLACEHOLDER - EMAIL 1]',
    email2: '[TEXT_PLACEHOLDER - EMAIL 2]',
    subjectLine: '[TEXT_PLACEHOLDER - SUBJECT LINE]',
    buttonText: '[BUTTON_TEXT]',
};

const JobPostTemplateGenerator: React.FC<JobPostTemplateGeneratorProps> = ({ isOpen, onClose, onSave, template, saving }) => {
    const previewRef = useRef<HTMLDivElement>(null);

    // State for the customizable config
    const [config, setConfig] = useState(defaultConfig);

    // Load initial state
    useEffect(() => {
        if (isOpen) {
            if (template) {
                 setConfig({
                    backgroundColor: template.backgroundColor || '#FDEEF4',
                    cardColor: template.cardColor || '#FFFFFF',
                    textColor: template.textColor || '#1F2937',
                    accentColor: template.accentColor || '#EF4444',
                    backgroundImage: template.backgroundImage || '',
                    logoImage: template.logoImage || '',
                    headline: template.headline || '[TEXT_PLACEHOLDER - MAIN HEADLINE]',
                    jobTitle: template.jobTitle || '[TEXT_PLACEHOLDER - JOB TITLE]',
                    description: template.description || '[TEXT_PLACEHOLDER - SHORT DESCRIPTION]',
                    details: template.details && template.details.length ? template.details : [
                        { icon: '', label: '[TEXT_PLACEHOLDER - LABEL]' },
                        { icon: '', label: '[TEXT_PLACEHOLDER - LABEL]' },
                        { icon: '', label: '[TEXT_PLACEHOLDER - LABEL]' },
                        { icon: '', label: '[TEXT_PLACEHOLDER - LABEL]' },
                    ],
                    col1Title: template.col1Title || '[TEXT_PLACEHOLDER - SECTION TITLE]',
                    col1Content: template.col1Content || '[TEXT_PLACEHOLDER]\n[TEXT_PLACEHOLDER]\n[TEXT_PLACEHOLDER]',
                    col2Title: template.col2Title || '[TEXT_PLACEHOLDER - SECTION TITLE]',
                    col2Content: template.col2Content || '[TEXT_PLACEHOLDER]\n[TEXT_PLACEHOLDER]\n[TEXT_PLACEHOLDER]',
                    contactTitle: template.contactTitle || '[TEXT_PLACEHOLDER - CONTACT TITLE]',
                    email1: template.email1 || '[TEXT_PLACEHOLDER - EMAIL 1]',
                    email2: template.email2 || '[TEXT_PLACEHOLDER - EMAIL 2]',
                    subjectLine: template.subjectLine || '[TEXT_PLACEHOLDER - SUBJECT LINE]',
                    buttonText: template.buttonText || '[BUTTON_TEXT]',
                });
            } else {
                // Reset to defaults if creating new
                setConfig({ ...defaultConfig });
            }
        }
    }, [isOpen, template]);

    const updateConfig = (key: string, value: any) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    const updateDetail = (index: number, field: 'icon' | 'label', value: any) => {
        const newDetails = [...config.details];
        newDetails[index] = { ...newDetails[index], [field]: value };
        setConfig(prev => ({ ...prev, details: newDetails }));
    };

    const handleImageUpload = (key: string, file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            updateConfig(key, reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleDetailIconUpload = (index: number, file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            updateDetail(index, 'icon', reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleDownloadImage = async () => {
        if (previewRef.current) {
            const canvas = await html2canvas(previewRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: null,
            });
            const link = document.createElement('a');
            link.download = `Job_Ad_${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        }
    };
    
    const handleSaveTemplate = () => {
        const payload: JobPostVisualTemplate = {
             id: template?.id || '', // Use existing ID if editing
             name: template?.name || 'Custom Template', // Preserve name or default
             createdBy: template?.createdBy || 'User',
             updatedAt: new Date(),
             ...config
        };
        onSave(payload);
    }


    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
            <div 
                className="w-full max-w-[95vw] flex flex-col lg:flex-row bg-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-700 relative h-full"
                style={{ maxHeight: 'calc(100vh - 2rem)' }}
            >
                
                {/* Close Button */}
                <button onClick={onClose} className="absolute top-4 right-4 z-50 p-2 bg-black/50 text-white hover:bg-black/70 rounded-full backdrop-blur-sm border border-white/10 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>

                {/* LEFT COLUMN: EDITOR */}
                <div className="w-full lg:w-2/5 flex flex-col border-r border-slate-800 bg-[#0F172A] overflow-hidden">
                    <div className="p-5 border-b border-slate-800 bg-slate-900/50 shrink-0">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="w-2 h-6 bg-indigo-500 rounded-full"></span>
                            Job Post Template Generator
                        </h2>
                        <p className="text-slate-400 text-xs mt-1 pl-4">Customize your job ad poster.</p>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                        {/* Visual Settings */}
                        <SectionHeader title="1. Visual Theme" />
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <ColorPickerInput label="Background" value={config.backgroundColor} onChange={v => updateConfig('backgroundColor', v)} />
                            <ColorPickerInput label="Card Base" value={config.cardColor} onChange={v => updateConfig('cardColor', v)} />
                            <ColorPickerInput label="Text Color" value={config.textColor} onChange={v => updateConfig('textColor', v)} />
                            <ColorPickerInput label="Accent Color" value={config.accentColor} onChange={v => updateConfig('accentColor', v)} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <ImageUploader label="Main Background Image" image={config.backgroundImage} onUpload={(f) => handleImageUpload('backgroundImage', f)} onRemove={() => updateConfig('backgroundImage', '')} />
                            <ImageUploader label="Company Logo" image={config.logoImage} onUpload={(f) => handleImageUpload('logoImage', f)} onRemove={() => updateConfig('logoImage', '')} />
                        </div>

                        {/* Header Content */}
                        <SectionHeader title="2. Header Content" />
                        <InputGroup label="Top Headline" value={config.headline} onChange={(v: string) => updateConfig('headline', v)} />
                        <InputGroup label="Big Job Title" value={config.jobTitle} onChange={(v: string) => updateConfig('jobTitle', v)} />
                        <InputGroup label="Short Description" value={config.description} onChange={(v: string) => updateConfig('description', v)} as="textarea" />

                        {/* Icons Grid */}
                        <SectionHeader title="3. Job Details Icons" />
                        <div className="grid grid-cols-2 gap-4">
                            {config.details.map((item, idx) => (
                                <div key={idx} className="p-3 border border-slate-700 rounded bg-slate-800/50">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div 
                                            className="h-8 w-8 bg-slate-700 rounded border border-dashed border-slate-500 flex items-center justify-center text-[10px] text-slate-400 overflow-hidden relative cursor-pointer"
                                        >
                                            {item.icon ? <img src={item.icon} className="w-full h-full object-cover" alt="icon"/> : <span className="text-xs text-gray-300">ICON</span>}
                                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => e.target.files?.[0] && handleDetailIconUpload(idx, e.target.files[0])} accept="image/*" />
                                        </div>
                                        <input 
                                            type="text" 
                                            value={item.label} 
                                            onChange={(e) => updateDetail(idx, 'label', e.target.value)} 
                                            className="bg-transparent border-b border-slate-600 text-xs text-white w-full focus:outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Columns */}
                        <SectionHeader title="4. Detailed Sections" />
                        <div className="space-y-4">
                            <div className="p-3 border border-slate-700 rounded bg-slate-800/30">
                                <label className="text-xs font-bold text-slate-400 mb-2 block">Left Column</label>
                                <InputGroup label="Title" value={config.col1Title} onChange={(v: string) => updateConfig('col1Title', v)} />
                                <InputGroup label="Bullet Points (One per line)" value={config.col1Content} onChange={(v: string) => updateConfig('col1Content', v)} as="textarea" />
                            </div>
                            <div className="p-3 border border-slate-700 rounded bg-slate-800/30">
                                <label className="text-xs font-bold text-slate-400 mb-2 block">Right Column</label>
                                <InputGroup label="Title" value={config.col2Title} onChange={(v: string) => updateConfig('col2Title', v)} />
                                <InputGroup label="Bullet Points (One per line)" value={config.col2Content} onChange={(v: string) => updateConfig('col2Content', v)} as="textarea" />
                            </div>
                        </div>

                        {/* Contact & CTA */}
                        <SectionHeader title="5. Contact & CTA" />
                        <InputGroup label="Contact Section Title" value={config.contactTitle} onChange={(v: string) => updateConfig('contactTitle', v)} />
                        <div className="grid grid-cols-2 gap-4">
                            <InputGroup label="Email 1" value={config.email1} onChange={(v: string) => updateConfig('email1', v)} />
                            <InputGroup label="Email 2" value={config.email2} onChange={(v: string) => updateConfig('email2', v)} />
                        </div>
                        <InputGroup label="Subject Line Format" value={config.subjectLine} onChange={(v: string) => updateConfig('subjectLine', v)} />
                        <InputGroup label="Button Text" value={config.buttonText} onChange={(v: string) => updateConfig('buttonText', v)} />

                    </div>

                    {/* Action Bar */}
                    <div className="p-5 border-t border-slate-800 bg-slate-900 flex justify-between items-center gap-4 shrink-0">
                        <div className="text-xs text-slate-500">Changes update automatically in preview.</div>
                        <div className="flex gap-2">
                            <Button variant="secondary" onClick={handleDownloadImage}>Download Image</Button>
                            <Button onClick={handleSaveTemplate} disabled={!!saving}>
                                {saving ? 'Saving...' : 'Save Template'}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: PREVIEW */}
                <div className="w-full lg:w-3/5 flex-1 bg-gray-100 relative overflow-hidden flex items-center justify-center">
                    <div className="absolute inset-0 pattern-grid-lg text-gray-200 opacity-20 pointer-events-none" />
                    
                    <div className="h-full w-full overflow-y-auto p-8 flex justify-center custom-scrollbar">
                        
                        {/* --- THE TEMPLATE CANVAS --- */}
                        <div 
                            ref={previewRef}
                            className="w-full max-w-[600px] bg-white shadow-2xl relative flex flex-col min-h-[900px] overflow-hidden shrink-0"
                            style={{ backgroundColor: config.backgroundColor, color: config.textColor }}
                        >
                            {/* Top Background Image Layer */}
                            <div className="absolute top-0 left-0 w-full h-[400px] z-0">
                                {config.backgroundImage ? (
                                    <img src={config.backgroundImage} className="w-full h-full object-cover opacity-60 mask-image-b" alt="bg" />
                                ) : (
                                    <div className="w-full h-full bg-gradient-to-b from-black/5 to-transparent flex items-center justify-center text-black/10 font-bold text-4xl uppercase tracking-widest">
                                        [BACKGROUND_IMAGE]
                                    </div>
                                )}
                            </div>

                            {/* Content Container (Card) */}
                            <div 
                                className="relative z-10 mx-6 mt-12 mb-8 rounded-2xl shadow-xl p-8 flex flex-col"
                                style={{ backgroundColor: config.cardColor }}
                            >
                                {/* 1. Logo */}
                                <div className="flex justify-center mb-6">
                                    {config.logoImage ? (
                                        <img src={config.logoImage} alt="logo" className="h-16 object-contain" />
                                    ) : (
                                        <div className="h-16 w-32 border-2 border-dashed border-gray-300 flex items-center justify-center text-[10px] text-gray-400 font-mono">
                                            [LOGO_PLACEHOLDER]
                                        </div>
                                    )}
                                </div>

                                {/* 2. Headline & Position */}
                                <div className="text-center mb-6 pb-6 border-b-2" style={{ borderColor: config.accentColor }}>
                                    <h3 className="text-lg font-bold uppercase tracking-widest mb-2 opacity-80" style={{ color: config.accentColor }}>
                                        {config.headline}
                                    </h3>
                                    <h1 className="text-4xl font-extrabold uppercase leading-none mb-4 tracking-tight">
                                        {config.jobTitle}
                                    </h1>
                                    <p className="text-sm opacity-70 leading-relaxed max-w-md mx-auto">
                                        {config.description}
                                    </p>
                                </div>

                                {/* 4. Job Details Icons */}
                                <div className="grid grid-cols-2 gap-x-4 gap-y-6 mb-8 px-4">
                                    {config.details.map((item, i) => (
                                        <div key={i} className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center shrink-0 text-2xl shadow-sm">
                                                {item.icon ? <img src={item.icon} className="w-6 h-6 object-contain" alt="icon"/> : <span className="text-xs text-gray-300">ICON</span>}
                                            </div>
                                            <span className="font-bold text-xs uppercase tracking-wide opacity-90">{item.label}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* 5. Two-Column Section */}
                                <div className="grid grid-cols-2 gap-6 mb-8 bg-gray-50 p-6 rounded-xl">
                                    {/* Left Col */}
                                    <div>
                                        <h4 className="font-extrabold uppercase text-sm mb-3 tracking-wider" style={{ color: config.accentColor }}>
                                            {config.col1Title}
                                        </h4>
                                        <ul className="space-y-2">
                                            {config.col1Content.split('\n').map((line, i) => (
                                                <li key={i} className="text-xs flex items-start gap-2 opacity-80">
                                                    <span className="mt-1 w-1 h-1 rounded-full bg-current shrink-0" style={{ color: config.accentColor }}></span>
                                                    {line}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    {/* Right Col */}
                                    <div>
                                        <h4 className="font-extrabold uppercase text-sm mb-3 tracking-wider" style={{ color: config.accentColor }}>
                                            {config.col2Title}
                                        </h4>
                                        <ul className="space-y-2">
                                            {config.col2Content.split('\n').map((line, i) => (
                                                <li key={i} className="text-xs flex items-start gap-2 opacity-80">
                                                    <span className="mt-1 w-1 h-1 rounded-full bg-current shrink-0" style={{ color: config.accentColor }}></span>
                                                    {line}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>

                                {/* 6. Contact Section */}
                                <div className="text-center mb-8 space-y-1">
                                    <h4 className="font-bold uppercase text-sm tracking-wider mb-2" style={{ color: config.accentColor }}>
                                        {config.contactTitle}
                                    </h4>
                                    <p className="font-bold text-sm">{config.email1}</p>
                                    <p className="font-bold text-sm">{config.email2}</p>
                                    <p className="text-[10px] font-mono opacity-60 pt-2">{config.subjectLine}</p>
                                </div>

                                {/* 7. Apply Button */}
                                <div className="text-center mt-auto">
                                    <button 
                                        className="px-10 py-3 rounded-full font-bold text-white shadow-lg uppercase tracking-widest text-sm transform transition-transform"
                                        style={{ 
                                            background: `linear-gradient(to right, ${config.accentColor}, ${config.accentColor}dd)`,
                                            boxShadow: `0 10px 20px -5px ${config.accentColor}50`
                                        }}
                                    >
                                        {config.buttonText}
                                    </button>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default JobPostTemplateGenerator;
