import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import Button from '../ui/Button';
import {
    cleanTemplateText,
    cloneTemplate,
    DEFAULT_JOB_POST_TEMPLATE,
    JobPostTemplateRecord,
    JobPostTemplateSection,
} from './jobPostTemplatePresets';
import html2canvas from 'html2canvas';

interface JobPostTemplateGeneratorProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (template: JobPostTemplateRecord) => void | Promise<void>;
    template?: JobPostTemplateRecord | null;
    saving?: boolean;
}

type ImageConfigKey = 'backgroundImage' | 'logoImage';
type TemplateConfig = Omit<JobPostTemplateRecord, 'id' | 'updatedAt' | 'createdBy' | 'persisted'> & {
    name: string;
    businessUnit: string;
    status: string;
    sections: JobPostTemplateSection[];
};

const ASSET_BUCKET = 'application-page-assets';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

const CONTENT_LIMITS = {
    headline: 8,
    jobTitle: 10,
    description: 35,
    detailLabel: 12,
    sectionTitle: 6,
    bullet: 22,
    maxBullets: 5,
    maxSections: 4,
    contactTitle: 8,
    buttonText: 4,
} as const;

const countWords = (value: string | undefined | null) => (value || '').trim() ? (value || '').trim().split(/\s+/).length : 0;

const serializeConfig = (value: TemplateConfig) => JSON.stringify({
    ...value,
    updatedAt: undefined,
});

const validateImageFile = (file: File): string => {
    const lowerName = file.name.toLowerCase();
    if (!IMAGE_TYPES.includes(file.type) && !IMAGE_EXTENSIONS.some(extension => lowerName.endsWith(extension))) {
        return 'Unsupported image type. Use JPG, PNG, or WebP.';
    }
    if (file.size > MAX_IMAGE_SIZE) return 'The template image must be 20 MB or smaller.';
    return '';
};

const SectionHeader = ({ title }: { title: string }) => (
    <div className="mt-6 mb-3 flex items-center gap-2 border-b border-slate-700 pb-1">
        <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">{title}</span>
    </div>
);

const ColorPickerInput = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => {
    const isValidColor = /^#[0-9a-f]{6}$/i.test(value);
    return (
        <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-400">{label}</label>
            <div className="flex items-center space-x-2 rounded-md border border-slate-700 bg-slate-800 p-1">
                <div className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded shadow-sm">
                    <input type="color" value={isValidColor ? value : '#64748b'} onChange={event => onChange(event.target.value.toUpperCase())} className="absolute -left-2 -top-2 h-12 w-12 cursor-pointer border-0 p-0" />
                </div>
                <input type="text" value={value} onChange={event => onChange(event.target.value.toUpperCase())} className="min-w-0 flex-grow border-none bg-transparent text-sm font-mono uppercase text-white focus:ring-0" maxLength={7} />
            </div>
        </div>
    );
};

const InputGroup = ({ label, value, onChange, placeholder, type = 'text', as = 'input', maxWords }: any) => {
    const wordCount = countWords(value);
    const isOverLimit = typeof maxWords === 'number' && wordCount > maxWords;
    return (
    <div className="mb-3">
        <div className="mb-1.5 flex items-center justify-between gap-3">
            <label className="block text-xs font-medium text-slate-300">{label}</label>
            {typeof maxWords === 'number' && <span className={`text-[10px] ${isOverLimit ? 'text-red-300' : 'text-slate-500'}`}>{wordCount}/{maxWords} words</span>}
        </div>
        {as === 'textarea' ? (
            <textarea value={value || ''} onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)} className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-transparent focus:ring-2 focus:ring-indigo-500" placeholder={placeholder} rows={4} />
        ) : (
            <input type={type} value={value || ''} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value)} className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-transparent focus:ring-2 focus:ring-indigo-500" placeholder={placeholder} />
        )}
        {isOverLimit && <p className="mt-1 text-[11px] text-red-300">Please shorten this to {maxWords} words or fewer.</p>}
    </div>
    );
};

const ImageUploader = ({ label, image, onUpload, onRemove, loading }: { label: string; image: string; onUpload: (file: File) => void; onRemove: () => void; loading?: boolean }) => {
    const fileInput = useRef<HTMLInputElement>(null);
    const selectFile = (file?: File) => file && onUpload(file);
    return (
        <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-slate-300">{label}</label>
            <div onClick={() => fileInput.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); selectFile(event.dataTransfer.files?.[0]); }} className="group flex min-h-[84px] cursor-pointer items-center gap-3 rounded-md border border-dashed border-slate-500 bg-slate-800 px-3 py-2 transition-colors hover:bg-slate-700">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-700">{image ? <img src={image} alt="Asset preview" className="h-full w-full object-cover" /> : <span className="text-2xl text-slate-400">+</span>}</div>
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-indigo-300">{loading ? 'Uploading…' : image ? 'Replace image' : 'Upload image'}</p>
                    <p className="mt-1 text-[11px] text-slate-500">JPG, PNG, or WebP · max 20 MB · drag and drop supported</p>
                    {image && !loading && <button type="button" onClick={event => { event.stopPropagation(); onRemove(); }} className="mt-1 text-[11px] text-red-400 hover:text-red-300">Remove image</button>}
                </div>
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => { selectFile(event.target.files?.[0]); event.currentTarget.value = ''; }} />
            </div>
        </div>
    );
};

const isImageValue = (value: string) => /^(data:|https?:\/\/)/i.test(value);
const splitBullets = (content: string) => content.split('\n').map(line => cleanTemplateText(line)).filter(Boolean);

const normalizeSections = (template?: JobPostTemplateRecord | null): JobPostTemplateSection[] => {
    if (Array.isArray(template?.sections) && template.sections.length > 0) {
        return template.sections.map((item, index) => ({ id: item.id || `section-${index + 1}`, title: cleanTemplateText(item.title), content: splitBullets(item.content || '').join('\n') })).filter(item => item.title || item.content);
    }
    return [
        { id: 'section-1', title: cleanTemplateText(template?.col1Title), content: splitBullets(template?.col1Content || '').join('\n') },
        { id: 'section-2', title: cleanTemplateText(template?.col2Title), content: splitBullets(template?.col2Content || '').join('\n') },
    ].filter(item => item.title || item.content);
};

const buildConfig = (template?: JobPostTemplateRecord | null): TemplateConfig => {
    const source = template ? cloneTemplate(template) : cloneTemplate(DEFAULT_JOB_POST_TEMPLATE);
    const isNew = !template;
    const details = (source.details || []).map(item => ({ icon: cleanTemplateText(item.icon), label: cleanTemplateText(item.label) })).filter(item => item.label || item.icon);
    return {
        name: cleanTemplateText(source.name) || (isNew ? DEFAULT_JOB_POST_TEMPLATE.name : 'Custom Job Post Template'),
        businessUnit: cleanTemplateText(source.businessUnit) || (isNew ? DEFAULT_JOB_POST_TEMPLATE.businessUnit || '' : ''),
        status: source.status || 'Draft',
        templateKey: source.templateKey,
        isStarter: source.isStarter,
        ctaLink: cleanTemplateText(source.ctaLink),
        brandWordmark: cleanTemplateText(source.brandWordmark) || cleanTemplateText(source.businessUnit) || 'TNG HRIS',
        backgroundColor: source.backgroundColor || '#FDE7EF',
        cardColor: source.cardColor || '#FFFFFF',
        textColor: source.textColor || '#1F2937',
        accentColor: source.accentColor || '#EF4444',
        backgroundImage: source.backgroundImage || '',
        logoImage: source.logoImage || '',
        headline: cleanTemplateText(source.headline),
        jobTitle: cleanTemplateText(source.jobTitle),
        description: cleanTemplateText(source.description),
        details: details.length > 0 || !isNew ? details : (DEFAULT_JOB_POST_TEMPLATE.details || []).map(item => ({ ...item })),
        sections: normalizeSections(source),
        col1Title: cleanTemplateText(source.col1Title),
        col1Content: cleanTemplateText(source.col1Content),
        col2Title: cleanTemplateText(source.col2Title),
        col2Content: cleanTemplateText(source.col2Content),
        contactTitle: cleanTemplateText(source.contactTitle),
        email1: cleanTemplateText(source.email1),
        email2: cleanTemplateText(source.email2),
        subjectLine: cleanTemplateText(source.subjectLine),
        buttonText: cleanTemplateText(source.buttonText),
    };
};

const JobPostTemplateGenerator: React.FC<JobPostTemplateGeneratorProps> = ({ isOpen, onClose, onSave, template, saving }) => {
    const { user } = useAuth();
    const previewRef = useRef<HTMLDivElement>(null);
    const initialConfigRef = useRef('');
    const [config, setConfig] = useState<TemplateConfig>(() => buildConfig(template));
    const [uploadingAsset, setUploadingAsset] = useState<string | null>(null);
    const [assetError, setAssetError] = useState('');

    useEffect(() => {
        if (isOpen) {
            const nextConfig = buildConfig(template);
            setConfig(nextConfig);
            initialConfigRef.current = serializeConfig(nextConfig);
            setUploadingAsset(null);
            setAssetError('');
        }
    }, [isOpen, template]);

    const updateConfig = <K extends keyof TemplateConfig>(key: K, value: TemplateConfig[K]) => setConfig(previous => ({ ...previous, [key]: value }));

    const uploadAsset = async (file: File, assetKind: string): Promise<string> => {
        const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
        const authUserId = user?.authUserId || user?.id;
        if (!authUserId) throw new Error('You must be signed in to upload a template image.');
        const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const path = `hero/${authUserId}/job-post-templates/${randomPart}-${assetKind}.${extension}`;
        const { data, error } = await supabase.storage.from(ASSET_BUCKET).upload(path, file, { cacheControl: '31536000', contentType: file.type, upsert: false });
        if (error) throw new Error(error.message || 'Template image upload failed.');
        const storedPath = data?.path || path;
        const { data: publicUrlData } = supabase.storage.from(ASSET_BUCKET).getPublicUrl(storedPath);
        if (!publicUrlData?.publicUrl) throw new Error('The image uploaded, but a public URL could not be generated.');
        return publicUrlData.publicUrl;
    };

    const handleImageUpload = async (key: ImageConfigKey, file: File) => {
        setAssetError('');
        const validationError = validateImageFile(file);
        if (validationError) return setAssetError(validationError);
        const previousValue = config[key];
        const localPreview = URL.createObjectURL(file);
        updateConfig(key, localPreview);
        setUploadingAsset(key);
        try {
            updateConfig(key, await uploadAsset(file, key));
        } catch (error: any) {
            updateConfig(key, previousValue);
            setAssetError(error?.message || 'Template image upload failed. Please try again.');
        } finally {
            URL.revokeObjectURL(localPreview);
            setUploadingAsset(null);
        }
    };

    const handleDetailIconUpload = async (index: number, file: File) => {
        setAssetError('');
        const validationError = validateImageFile(file);
        if (validationError) return setAssetError(validationError);
        const localPreview = URL.createObjectURL(file);
        const previous = config.details[index]?.icon || '';
        const nextDetails = [...config.details];
        nextDetails[index] = { ...nextDetails[index], icon: localPreview };
        updateConfig('details', nextDetails);
        setUploadingAsset(`detail-${index}`);
        try {
            const publicUrl = await uploadAsset(file, `detail-${index}`);
            const uploadedDetails = [...config.details];
            uploadedDetails[index] = { ...uploadedDetails[index], icon: publicUrl };
            updateConfig('details', uploadedDetails);
        } catch (error: any) {
            const restoredDetails = [...config.details];
            restoredDetails[index] = { ...restoredDetails[index], icon: previous };
            updateConfig('details', restoredDetails);
            setAssetError(error?.message || 'Detail icon upload failed.');
        } finally {
            URL.revokeObjectURL(localPreview);
            setUploadingAsset(null);
        }
    };

    const updateDetail = (index: number, field: 'icon' | 'label', value: string) => {
        const details = [...config.details];
        details[index] = { ...details[index], [field]: value };
        updateConfig('details', details);
    };
    const addDetail = () => updateConfig('details', [...config.details, { icon: '✦', label: '' }]);
    const removeDetail = (index: number) => updateConfig('details', config.details.filter((_, itemIndex) => itemIndex !== index));
    const updateSection = (index: number, updates: Partial<JobPostTemplateSection>) => {
        const sections = [...config.sections];
        sections[index] = { ...sections[index], ...updates };
        updateConfig('sections', sections);
    };
    const addSection = () => {
        if (config.sections.length >= CONTENT_LIMITS.maxSections) {
            setAssetError(`Use no more than ${CONTENT_LIMITS.maxSections} content sections.`);
            return;
        }
        updateConfig('sections', [...config.sections, { id: `section-${Date.now()}`, title: '', content: '' }]);
    };
    const removeSection = (index: number) => updateConfig('sections', config.sections.filter((_, itemIndex) => itemIndex !== index));

    const hasUnsavedChanges = Boolean(initialConfigRef.current) && serializeConfig(config) !== initialConfigRef.current;
    const requestClose = () => {
        if (hasUnsavedChanges && !window.confirm('You have unsaved changes. Close the editor and discard them?')) return;
        onClose();
    };

    useEffect(() => {
        if (!isOpen) return;
        const previousOverflow = document.body.style.overflow;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                requestClose();
            }
        };
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, hasUnsavedChanges]);

    const contentValidationMessages = useMemo(() => {
        const messages: string[] = [];
        const check = (label: string, value: string, limit: number) => {
            if (countWords(value) > limit) messages.push(`${label} must be ${limit} words or fewer.`);
        };
        check('Top headline', config.headline, CONTENT_LIMITS.headline);
        check('Job title', config.jobTitle, CONTENT_LIMITS.jobTitle);
        check('Short description', config.description, CONTENT_LIMITS.description);
        check('Contact title', config.contactTitle, CONTENT_LIMITS.contactTitle);
        check('CTA button text', config.buttonText, CONTENT_LIMITS.buttonText);
        config.details.forEach((item, index) => check(`Job detail ${index + 1}`, item.label, CONTENT_LIMITS.detailLabel));
        if (config.sections.length > CONTENT_LIMITS.maxSections) messages.push(`Use no more than ${CONTENT_LIMITS.maxSections} content sections.`);
        config.sections.forEach((item, index) => {
            check(`Section ${index + 1} title`, item.title, CONTENT_LIMITS.sectionTitle);
            const bullets = splitBullets(item.content);
            if (bullets.length > CONTENT_LIMITS.maxBullets) messages.push(`Section ${index + 1} can have no more than ${CONTENT_LIMITS.maxBullets} bullet points.`);
            bullets.forEach((bullet, bulletIndex) => check(`Section ${index + 1}, bullet ${bulletIndex + 1}`, bullet, CONTENT_LIMITS.bullet));
        });
        return messages;
    }, [config]);

    const handleDownloadImage = async () => {
        if (!previewRef.current) return;
        let exportNode: HTMLElement | null = null;
        try {
            setAssetError('Preparing the full template image…');
            if (document.fonts?.ready) await document.fonts.ready;
            const source = previewRef.current;
            const images = Array.from(source.querySelectorAll('img')) as HTMLImageElement[];
            await Promise.all(images.map(image => image.complete ? Promise.resolve() : new Promise<void>(resolve => {
                image.addEventListener('load', () => resolve(), { once: true });
                image.addEventListener('error', () => resolve(), { once: true });
            })));

            exportNode = source.cloneNode(true) as HTMLElement;
            exportNode.style.position = 'absolute';
            exportNode.style.left = '-100000px';
            exportNode.style.top = '0';
            exportNode.style.width = `${Math.max(source.scrollWidth, Math.ceil(source.getBoundingClientRect().width))}px`;
            exportNode.style.height = 'auto';
            exportNode.style.minHeight = '0';
            exportNode.style.maxHeight = 'none';
            exportNode.style.overflow = 'visible';
            exportNode.style.transform = 'none';
            exportNode.style.margin = '0';
            document.body.appendChild(exportNode);

            const exportWidth = Math.ceil(exportNode.scrollWidth || source.scrollWidth);
            const exportHeight = Math.ceil(exportNode.scrollHeight || source.scrollHeight);
            if (!exportWidth || !exportHeight) throw new Error('The preview has no exportable content.');
            if (exportHeight * 2 > 32000 || exportWidth * 2 > 16000) {
                throw new Error('This template is too tall to export as one image. Shorten the content and try again.');
            }

            const canvas = await html2canvas(exportNode, {
                scale: 2,
                useCORS: true,
                backgroundColor: null,
                width: exportWidth,
                height: exportHeight,
                windowWidth: exportWidth,
                windowHeight: exportHeight,
                scrollX: 0,
                scrollY: 0,
            });
            const link = document.createElement('a');
            link.download = `Job_Ad_${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            setAssetError('');
        } catch (error) {
            console.error('Failed to download job post image', error);
            setAssetError(error instanceof Error ? error.message : 'The full preview could not be downloaded. Please try again.');
        } finally {
            exportNode?.remove();
        }
    };

    const handleSaveTemplate = () => {
        if (uploadingAsset) return setAssetError('Please wait for the image upload to finish before saving.');
        if (!config.name.trim() || !config.jobTitle.trim()) return setAssetError('Template name and job title are required.');
        if (contentValidationMessages.length > 0) return setAssetError(`${contentValidationMessages[0]} Please shorten the content before saving.`);
        const visibleSections = config.sections.map(item => ({ ...item, title: cleanTemplateText(item.title), content: splitBullets(item.content).join('\n') })).filter(item => item.title || item.content);
        const payload: JobPostTemplateRecord = {
            id: template?.persisted ? template.id : '',
            name: config.name.trim(),
            businessUnit: config.businessUnit.trim(),
            status: config.status || 'Draft',
            templateKey: config.templateKey,
            isStarter: config.isStarter,
            ctaLink: config.ctaLink?.trim() || '',
            brandWordmark: config.brandWordmark?.trim() || config.businessUnit.trim() || 'TNG HRIS',
            updatedAt: new Date(),
            createdBy: template?.createdBy || 'User',
            backgroundColor: config.backgroundColor,
            cardColor: config.cardColor,
            textColor: config.textColor,
            accentColor: config.accentColor,
            backgroundImage: config.backgroundImage,
            logoImage: config.logoImage,
            headline: config.headline.trim(),
            jobTitle: config.jobTitle.trim(),
            description: config.description.trim(),
            details: config.details.filter(item => cleanTemplateText(item.label) || cleanTemplateText(item.icon)),
            sections: visibleSections,
            col1Title: visibleSections[0]?.title || '',
            col1Content: visibleSections[0]?.content || '',
            col2Title: visibleSections[1]?.title || '',
            col2Content: visibleSections[1]?.content || '',
            contactTitle: config.contactTitle.trim(),
            email1: config.email1.trim(),
            email2: config.email2.trim(),
            subjectLine: config.subjectLine.trim(),
            buttonText: config.buttonText.trim(),
            persisted: template?.persisted,
        };
        onSave(payload);
    };

    const visibleDetails = useMemo(() => config.details.filter(item => cleanTemplateText(item.label)), [config.details]);
    const visibleSections = useMemo(() => config.sections.map(item => ({ ...item, bullets: splitBullets(item.content) })).filter(item => item.bullets.length > 0), [config.sections]);
    const brandWordmark = config.brandWordmark || config.businessUnit || 'TNG HRIS';
    if (!isOpen) return null;

    const modal = (
        <div className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-black/90 p-2 backdrop-blur-sm sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}>
            <div role="dialog" aria-modal="true" aria-labelledby="job-post-template-generator-title" className="relative flex w-full max-w-[1600px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl" style={{ height: 'calc(100dvh - 2rem)', maxHeight: 'calc(100dvh - 2rem)' }}>
                <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-700 bg-slate-950 px-4 py-3 sm:px-6">
                    <div className="min-w-0"><h2 id="job-post-template-generator-title" className="truncate text-base font-bold text-white sm:text-lg">Job Post Template Generator</h2><p className="hidden text-xs text-slate-400 sm:block">Edit the template, review the complete preview, then save or download it.</p></div>
                    <div className="flex shrink-0 items-center gap-2">
                        <button type="button" onClick={requestClose} className="inline-flex rounded-md border border-slate-600 px-2 py-2 text-[11px] font-semibold text-slate-200 transition-colors hover:bg-slate-800 sm:px-3 sm:text-xs">Back to Job Post Templates</button>
                        <button type="button" onClick={requestClose} className="rounded-full border border-white/10 bg-slate-800 p-2 text-white transition-colors hover:bg-slate-700" aria-label="Close editor"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l8 8M14 6l-8 8" /></svg></button>
                    </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">

                <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden border-r border-slate-800 bg-[#0F172A] lg:w-2/5">
                    <div className="shrink-0 border-b border-slate-800 bg-slate-900/50 p-5"><h2 className="flex items-center gap-2 text-lg font-bold text-white"><span className="h-6 w-2 rounded-full bg-indigo-500" />Job Post Template Generator</h2><p className="mt-1 pl-4 text-xs text-slate-400">Design reusable job-post content and brand themes.</p><div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400"><span className="rounded-full bg-slate-800 px-2 py-1">{config.status || 'Draft'}</span>{config.isStarter && <span className="rounded-full bg-indigo-500/20 px-2 py-1 text-indigo-300">Reusable starter</span>}</div></div>
                    <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5 pb-10">
                        <SectionHeader title="Template details" />
                        <InputGroup label="Template name" value={config.name} onChange={(value: string) => updateConfig('name', value)} />
                        <InputGroup label="Business unit" value={config.businessUnit} onChange={(value: string) => updateConfig('businessUnit', value)} placeholder="e.g., The Dessert Museum" />
                        <SectionHeader title="1. Visual theme" />
                        <div className="mb-4 grid grid-cols-2 gap-4"><ColorPickerInput label="Background" value={config.backgroundColor} onChange={value => updateConfig('backgroundColor', value)} /><ColorPickerInput label="Card base" value={config.cardColor} onChange={value => updateConfig('cardColor', value)} /><ColorPickerInput label="Text color" value={config.textColor} onChange={value => updateConfig('textColor', value)} /><ColorPickerInput label="Accent color" value={config.accentColor} onChange={value => updateConfig('accentColor', value)} /></div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><ImageUploader label="Main background image" image={config.backgroundImage} loading={uploadingAsset === 'backgroundImage'} onUpload={file => handleImageUpload('backgroundImage', file)} onRemove={() => updateConfig('backgroundImage', '')} /><ImageUploader label="Company logo" image={config.logoImage} loading={uploadingAsset === 'logoImage'} onUpload={file => handleImageUpload('logoImage', file)} onRemove={() => updateConfig('logoImage', '')} /></div>
                        <SectionHeader title="2. Header content" />
                        <InputGroup label="Top headline" value={config.headline} onChange={(value: string) => updateConfig('headline', value)} maxWords={CONTENT_LIMITS.headline} /><InputGroup label="Big job title" value={config.jobTitle} onChange={(value: string) => updateConfig('jobTitle', value)} maxWords={CONTENT_LIMITS.jobTitle} /><InputGroup label="Short description" value={config.description} onChange={(value: string) => updateConfig('description', value)} as="textarea" maxWords={CONTENT_LIMITS.description} />
                        <SectionHeader title="3. Job details icons" />
                        <div className="space-y-3">{config.details.map((item, index) => <div key={item.label + index} className="rounded border border-slate-700 bg-slate-800/50 p-3"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-slate-400">Detail {index + 1}</span><button type="button" onClick={() => removeDetail(index)} className="text-xs text-red-400 hover:text-red-300">Remove</button></div><div className="grid grid-cols-[70px_1fr] gap-2"><div><label className="mb-1 block text-[10px] uppercase text-slate-500">Icon</label><div className="relative flex h-9 items-center justify-center overflow-hidden rounded border border-dashed border-slate-500 bg-slate-700 text-lg">{item.icon && isImageValue(item.icon) ? <img src={item.icon} alt="Detail icon" className="h-full w-full object-contain" /> : <span>{item.icon || '✦'}</span>}<input type="file" accept="image/jpeg,image/png,image/webp" className="absolute inset-0 cursor-pointer opacity-0" onChange={event => event.target.files?.[0] && handleDetailIconUpload(index, event.target.files[0])} /></div>{uploadingAsset === `detail-${index}` && <p className="mt-1 text-[10px] text-indigo-300">Uploading…</p>}</div><InputGroup label="Label" value={item.label} onChange={(value: string) => updateDetail(index, 'label', value)} placeholder="Location, schedule, or employment type" maxWords={CONTENT_LIMITS.detailLabel} /></div><InputGroup label="Icon character or URL (optional)" value={isImageValue(item.icon) ? '' : item.icon} onChange={(value: string) => updateDetail(index, 'icon', value)} placeholder="📍" /></div>)}<Button type="button" size="sm" variant="secondary" onClick={addDetail}>Add job detail</Button></div>
                        <SectionHeader title="4. Repeatable sections" />
                        <div className="space-y-4">{config.sections.map((item, index) => <div key={item.id} className="rounded border border-slate-700 bg-slate-800/30 p-3"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-slate-400">Section {index + 1}</span><button type="button" onClick={() => removeSection(index)} className="text-xs text-red-400 hover:text-red-300">Remove</button></div><InputGroup label="Section title" value={item.title} onChange={(value: string) => updateSection(index, { title: value })} placeholder="WHAT YOU’LL DO" maxWords={CONTENT_LIMITS.sectionTitle} /><InputGroup label="Bullet points (one per line)" value={item.content} onChange={(value: string) => updateSection(index, { content: value })} as="textarea" placeholder={`Maximum ${CONTENT_LIMITS.maxBullets} bullets; ${CONTENT_LIMITS.bullet} words per bullet`} /></div>)}<Button type="button" size="sm" variant="secondary" onClick={addSection} disabled={config.sections.length >= CONTENT_LIMITS.maxSections}>Add section</Button></div>
                        <SectionHeader title="5. Contact & call to action" />
                        <InputGroup label="Contact title" value={config.contactTitle} onChange={(value: string) => updateConfig('contactTitle', value)} maxWords={CONTENT_LIMITS.contactTitle} /><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><InputGroup label="Email 1" value={config.email1} onChange={(value: string) => updateConfig('email1', value)} /><InputGroup label="Email 2" value={config.email2} onChange={(value: string) => updateConfig('email2', value)} /></div><InputGroup label="Email subject" value={config.subjectLine} onChange={(value: string) => updateConfig('subjectLine', value)} /><InputGroup label="CTA button text" value={config.buttonText} onChange={(value: string) => updateConfig('buttonText', value)} maxWords={CONTENT_LIMITS.buttonText} /><InputGroup label="CTA link" value={config.ctaLink} onChange={(value: string) => updateConfig('ctaLink', value)} placeholder="/careers or https://…" />
                    </div>
                    <div className="shrink-0 border-t border-slate-800 bg-slate-900 p-4 sm:p-5">{assetError && <p className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{assetError}</p>}{contentValidationMessages.length > 0 && <p className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">Some content is longer than the recommended limits. Nothing has been truncated. Shorten the highlighted fields before saving.</p>}<div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center"><div className="text-xs text-slate-500">Preview updates as you edit. Close with X or Escape.</div><div className="flex gap-2"><Button type="button" variant="secondary" onClick={handleDownloadImage} disabled={!!uploadingAsset}>Download Image</Button><Button type="button" onClick={handleSaveTemplate} disabled={!!saving || !!uploadingAsset}>{saving ? 'Saving…' : 'Save Template'}</Button></div></div></div>
                </div>

                <div className="relative flex min-h-0 w-full min-w-0 flex-1 items-start justify-center overflow-hidden bg-gray-100 lg:w-3/5"><div className="custom-scrollbar flex min-h-0 h-full w-full items-start justify-center overflow-y-auto p-4 sm:p-8"><div ref={previewRef} className="relative flex h-auto min-h-[900px] w-full max-w-[640px] shrink-0 flex-col overflow-visible shadow-2xl" style={{ backgroundColor: config.backgroundColor, color: config.textColor }}>
                    <div className="absolute left-0 top-0 z-0 h-[360px] w-full overflow-hidden" style={{ background: `linear-gradient(135deg, ${config.accentColor}, ${config.backgroundColor})` }}>{config.backgroundImage ? <img src={config.backgroundImage} alt="" className="h-full w-full object-cover opacity-60" /> : <div className="flex h-full items-center justify-center px-10 text-center text-4xl font-black uppercase tracking-[0.15em] opacity-20">{brandWordmark}</div>}</div>
                    <div className="relative z-10 mx-4 mt-10 mb-8 flex flex-col rounded-2xl p-6 shadow-xl sm:mx-8 sm:p-9" style={{ backgroundColor: config.cardColor }}>
                        <div className="mb-6 flex justify-center">{config.logoImage ? <img src={config.logoImage} alt={brandWordmark} className="h-16 max-w-[230px] object-contain" /> : <span className="text-center text-lg font-black uppercase tracking-[0.16em]" style={{ color: config.accentColor }}>{brandWordmark}</span>}</div>
                        {(config.headline || config.jobTitle || config.description) && <div className="mb-6 border-b-2 pb-6 text-center" style={{ borderColor: config.accentColor }}>{config.headline && <h3 className="mb-2 text-base font-bold uppercase tracking-widest" style={{ color: config.accentColor }}>{config.headline}</h3>}{config.jobTitle && <h1 className="mb-4 text-3xl font-extrabold uppercase leading-none tracking-tight sm:text-4xl">{config.jobTitle}</h1>}{config.description && <p className="mx-auto max-w-md text-sm leading-relaxed opacity-75">{config.description}</p>}</div>}
                        {visibleDetails.length > 0 && <div className="mb-8 grid grid-cols-1 gap-4 px-1 sm:grid-cols-2">{visibleDetails.map((item, index) => <div key={item.label + index} className="flex items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-xl shadow-sm">{item.icon && isImageValue(item.icon) ? <img src={item.icon} alt="" className="h-6 w-6 object-contain" /> : <span>{item.icon || '✦'}</span>}</div><span className="text-xs font-bold uppercase tracking-wide opacity-90">{item.label}</span></div>)}</div>}
                        {visibleSections.length > 0 && <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2">{visibleSections.map((item, index) => <div key={item.id + index} className="rounded-xl border p-5" style={{ borderColor: `${config.accentColor}55`, backgroundColor: `${config.accentColor}0D` }}><h4 className="mb-3 text-sm font-extrabold uppercase tracking-wider" style={{ color: config.accentColor }}>{item.title || 'Highlights'}</h4><ul className="space-y-2">{item.bullets.map((bullet, bulletIndex) => <li key={bullet + bulletIndex} className="flex items-start gap-2 text-xs leading-relaxed opacity-85"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: config.accentColor }} />{bullet}</li>)}</ul></div>)}</div>}
                        {(config.contactTitle || config.email1 || config.email2 || config.subjectLine) && <div className="mb-8 space-y-1 text-center">{config.contactTitle && <h4 className="mb-2 text-sm font-bold uppercase tracking-wider" style={{ color: config.accentColor }}>{config.contactTitle}</h4>}{config.email1 && <p className="break-all text-sm font-bold">{config.email1}</p>}{config.email2 && <p className="break-all text-sm font-bold">{config.email2}</p>}{config.subjectLine && <p className="break-words pt-2 text-[10px] font-mono opacity-60">{config.subjectLine}</p>}</div>}
                        {config.buttonText && <div className="mt-auto text-center">{config.ctaLink ? <a href={config.ctaLink} className="inline-flex rounded-full px-10 py-3 text-sm font-bold uppercase tracking-widest text-white shadow-lg transition-transform hover:scale-[1.02]" style={{ background: `linear-gradient(to right, ${config.accentColor}, ${config.accentColor}dd)`, boxShadow: `0 10px 20px -5px ${config.accentColor}50` }}>{config.buttonText}</a> : <button type="button" className="rounded-full px-10 py-3 text-sm font-bold uppercase tracking-widest text-white shadow-lg" style={{ background: config.accentColor }}>{config.buttonText}</button>}</div>}
                    </div>
                </div></div>
            </div>
            </div>
            </div>
        </div>
    );

    // This editor is rendered from inside the routed page, which also contains
    // sticky HRIS navigation bars. Portaling it to body prevents those bars
    // from creating a higher stacking context that hides the modal header and
    // its close controls.
    return createPortal(modal, document.body);
};

export default JobPostTemplateGenerator;
