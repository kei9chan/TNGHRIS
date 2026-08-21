


import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ApplicantPageTheme } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import CareerPagePreview from './CareerPagePreview';
import FileUploader from '../ui/FileUploader';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

interface ApplicantPageEditorProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (theme: ApplicantPageTheme) => void | Promise<void>;
    theme: ApplicantPageTheme | null;
    businessUnits: { id: string; name: string }[];
}

const icons = ['rocket', 'smile', 'wallet', 'heart', 'star'];
const HERO_ASSET_BUCKET = 'application-page-assets';
const HERO_IMAGE_MAX_SIZE = 20 * 1024 * 1024;
const HERO_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const HERO_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

const ApplicantPageEditor: React.FC<ApplicantPageEditorProps> = ({ isOpen, onClose, onSave, theme, businessUnits }) => {
    const { user } = useAuth();
    const [config, setConfig] = useState<Partial<ApplicantPageTheme>>({});
    const [activeTab, setActiveTab] = useState<'general' | 'hero' | 'benefits' | 'preview'>('general');
    const [isUploadingHero, setIsUploadingHero] = useState(false);
    const [heroUploadError, setHeroUploadError] = useState<string | null>(null);
    const [heroPreviewUrl, setHeroPreviewUrl] = useState<string | null>(null);
    const [uploadedHeroImagePath, setUploadedHeroImagePath] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const wasOpen = useRef(false);

    const defaultConfig = useMemo<ApplicantPageTheme>(() => ({
        id: '',
        businessUnitId: businessUnits[0]?.id || '',
        name: 'New Career Page',
        slug: '',
        isActive: true,
        pageTitle: 'Join Our Team',
        heroHeadline: 'Build Your Career With Us',
        heroDescription: 'We are looking for talented individuals to join our growing family.',
        heroOverlayColor: 'rgba(0,0,0,0.5)',
        primaryColor: '#4F46E5',
        backgroundColor: '#F3F4F6',
        heroImage: '',
        contactEmail: '',
        benefits: [
            { id: 'b1', title: 'Great Culture', description: 'Work with amazing people', icon: 'smile' },
            { id: 'b2', title: 'Competitive Pay', description: 'We reward performance', icon: 'wallet' },
        ],
        testimonials: [],
    } as ApplicantPageTheme), [businessUnits]);

    // Initialize form once each time the modal opens. This keeps an in-progress
    // new page intact while the business-unit list finishes loading.
    useEffect(() => {
        if (!isOpen) {
            wasOpen.current = false;
            return;
        }
        if (!wasOpen.current) {
            wasOpen.current = true;
            setConfig(theme || { ...defaultConfig, businessUnitId: businessUnits[0]?.id || '' });
            setActiveTab('general');
            setHeroPreviewUrl(null);
            setUploadedHeroImagePath(null);
            setHeroUploadError(null);
            setSaveError(null);
        }
    }, [isOpen, theme, defaultConfig, businessUnits]);

    // Backfill BU once options finish loading without nuking user input
    useEffect(() => {
        if (!isOpen) return;
        setConfig(prev => (prev.businessUnitId || !businessUnits.length) ? prev : { ...prev, businessUnitId: businessUnits[0]?.id || '' });
    }, [businessUnits, isOpen]);

    const handleChange = (field: keyof ApplicantPageTheme, value: any) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };
    
    const handleHeroImageUpload = async (file: File) => {
        setHeroUploadError(null);
        setSaveError(null);

        if (!user?.id) {
            setHeroUploadError('You must be signed in to upload a hero image.');
            return;
        }

        const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `hero/${user.id}/${crypto.randomUUID()}.${extension}`;
        const localPreviewUrl = URL.createObjectURL(file);
        setHeroPreviewUrl(localPreviewUrl);
        setIsUploadingHero(true);

        try {
            const { data, error } = await supabase.storage
                .from(HERO_ASSET_BUCKET)
                .upload(path, file, {
                    cacheControl: '31536000',
                    contentType: file.type,
                    upsert: false,
                });

            if (error) throw error;
            if (!data?.path) throw new Error('The image upload completed without a storage path.');

            const { data: publicUrlData } = supabase.storage
                .from(HERO_ASSET_BUCKET)
                .getPublicUrl(data.path);

            if (!publicUrlData?.publicUrl) {
                throw new Error('The image uploaded, but a public image URL could not be generated.');
            }

            handleChange('heroImage', publicUrlData.publicUrl);
            URL.revokeObjectURL(localPreviewUrl);
            setHeroPreviewUrl(null);
            setUploadedHeroImagePath(data.path);
        } catch (error: any) {
            URL.revokeObjectURL(localPreviewUrl);
            setHeroPreviewUrl(null);
            setHeroUploadError(error?.message || 'Hero image upload failed. Please try again.');
        } finally {
            setIsUploadingHero(false);
        }
    };
    
    const handleBenefitChange = (index: number, field: string, value: string) => {
        const newBenefits = [...(config.benefits || [])];
        (newBenefits[index] as any)[field] = value;
        setConfig(prev => ({ ...prev, benefits: newBenefits }));
    };

    const handleAddBenefit = () => {
        const newBenefit = { id: `b-${Date.now()}`, title: 'New Benefit', description: 'Description', icon: 'star' as const };
        setConfig(prev => ({ ...prev, benefits: [...(prev.benefits || []), newBenefit] }));
    };
    
    const handleRemoveBenefit = (index: number) => {
        setConfig(prev => ({ ...prev, benefits: prev.benefits?.filter((_, i) => i !== index) }));
    };

    const handleRemoveHeroImage = async () => {
        const pathToRemove = uploadedHeroImagePath;
        setHeroPreviewUrl(null);
        setUploadedHeroImagePath(null);
        handleChange('heroImage', '');

        // A newly uploaded but not-yet-saved replacement is safe to remove
        // immediately. Existing saved assets are retained until a successful
        // page save so a failed replacement never destroys the old image.
        if (pathToRemove) {
            const { error } = await supabase.storage.from(HERO_ASSET_BUCKET).remove([pathToRemove]);
            if (error) console.warn('Failed to remove temporary hero image', error);
        }
    };

    const handleSave = async () => {
        if (!config.name?.trim() || !config.slug?.trim() || !config.businessUnitId) {
            setSaveError('Name, slug, and Business Unit are required.');
            return;
        }
        if (isUploadingHero) {
            setSaveError('Please wait for the hero image to finish uploading.');
            return;
        }

        setSaveError(null);
        setIsSaving(true);
        try {
            await onSave(config as ApplicantPageTheme);
        } catch (error: any) {
            setSaveError(error?.message || 'Failed to save page. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };
    
    const tabClass = (tab: string) => `px-4 py-2 text-sm font-medium border-b-2 ${activeTab === tab ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={theme ? 'Edit Application Page' : 'Create Application Page'}
            size="4xl"
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose} disabled={isUploadingHero || isSaving}>Cancel</Button>
                    <Button onClick={handleSave} disabled={isUploadingHero || isSaving}>{isSaving ? 'Saving…' : 'Save Page'}</Button>
                </div>
            }
        >
            <div className="flex space-x-2 mb-4 border-b border-gray-200 dark:border-gray-700">
                <button onClick={() => setActiveTab('general')} className={tabClass('general')}>General</button>
                <button onClick={() => setActiveTab('hero')} className={tabClass('hero')}>Hero & Colors</button>
                <button onClick={() => setActiveTab('benefits')} className={tabClass('benefits')}>Benefits</button>
                <button onClick={() => setActiveTab('preview')} className={tabClass('preview')}>Live Preview</button>
            </div>

            <div className="min-h-[400px]">
                {activeTab === 'general' && (
                    <div className="space-y-4 max-w-lg">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                            <select 
                                value={config.businessUnitId || businessUnits[0]?.id || ''} 
                                onChange={e => handleChange('businessUnitId', e.target.value)}
                                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            >
                                {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                            </select>
                        </div>
                        <Input label="Page Name" value={config.name || ''} onChange={e => handleChange('name', e.target.value)} required />
                        <Input label="URL Slug (e.g., inflatable-island)" value={config.slug || ''} onChange={e => handleChange('slug', e.target.value)} required />
                        <Input label="Page Title" value={config.pageTitle || ''} onChange={e => handleChange('pageTitle', e.target.value)} />
                        <Input label="Contact Email" value={config.contactEmail || ''} onChange={e => handleChange('contactEmail', e.target.value)} />
                    </div>
                )}

                {activeTab === 'hero' && (
                    <div className="space-y-4">
                         <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Primary Color</label>
                                <div className="flex items-center mt-1">
                                    <input type="color" value={config.primaryColor || '#4F46E5'} onChange={e => handleChange('primaryColor', e.target.value)} className="h-10 w-10 border-0 p-0 rounded shadow-sm cursor-pointer" />
                                    <input type="text" value={config.primaryColor || '#4F46E5'} onChange={e => handleChange('primaryColor', e.target.value)} className="ml-2 block w-full pl-3 pr-3 py-2 border-gray-300 rounded-md sm:text-sm" />
                                </div>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Background Color</label>
                                <div className="flex items-center mt-1">
                                    <input type="color" value={config.backgroundColor || '#F3F4F6'} onChange={e => handleChange('backgroundColor', e.target.value)} className="h-10 w-10 border-0 p-0 rounded shadow-sm cursor-pointer" />
                                    <input type="text" value={config.backgroundColor || '#F3F4F6'} onChange={e => handleChange('backgroundColor', e.target.value)} className="ml-2 block w-full pl-3 pr-3 py-2 border-gray-300 rounded-md sm:text-sm" />
                                </div>
                            </div>
                        </div>
                        <Input label="Hero Headline" value={config.heroHeadline || ''} onChange={e => handleChange('heroHeadline', e.target.value)} />
                        <Textarea label="Hero Description" value={config.heroDescription || ''} onChange={e => handleChange('heroDescription', e.target.value)} rows={3} />
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hero Image</label>
                            <FileUploader
                                onFileUpload={handleHeroImageUpload}
                                maxSize={HERO_IMAGE_MAX_SIZE}
                                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                                allowedMimeTypes={HERO_IMAGE_MIME_TYPES}
                                allowedExtensions={HERO_IMAGE_EXTENSIONS}
                                inputId="application-page-hero-upload"
                                disabled={isUploadingHero || isSaving}
                            />
                            {heroUploadError && (
                                <p className="mt-2 text-sm text-red-600" role="alert">{heroUploadError}</p>
                            )}
                            {heroPreviewUrl || config.heroImage ? (
                                <div className="mt-2 relative h-40 w-full rounded-md overflow-hidden border border-gray-300 dark:border-gray-600">
                                    <img src={heroPreviewUrl || config.heroImage} alt="Hero Preview" className="w-full h-full object-cover" />
                                    <button 
                                        onClick={handleRemoveHeroImage}
                                        disabled={isUploadingHero || isSaving}
                                        className="absolute top-2 right-2 bg-red-600 text-white px-2 py-1 text-xs rounded shadow-md hover:bg-red-700 transition-colors disabled:opacity-50"
                                        title="Remove Image"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                        </svg>
                                        Remove Image
                                    </button>
                                </div>
                            ) : null}
                            {saveError && (
                                <p className="mt-2 text-sm text-red-600" role="alert">{saveError}</p>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'benefits' && (
                    <div className="space-y-4">
                        {config.benefits?.map((benefit, index) => (
                            <div key={benefit.id} className="flex items-start space-x-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-md border dark:border-gray-700">
                                <div className="flex-shrink-0">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Icon</label>
                                    <select 
                                        value={benefit.icon} 
                                        onChange={e => handleBenefitChange(index, 'icon', e.target.value)}
                                        className="block w-24 pl-2 pr-8 py-1 text-sm border-gray-300 rounded-md dark:bg-gray-700"
                                    >
                                        {icons.map(i => <option key={i} value={i}>{i}</option>)}
                                    </select>
                                </div>
                                <div className="flex-grow space-y-2">
                                    <Input label="Title" value={benefit.title} onChange={e => handleBenefitChange(index, 'title', e.target.value)} />
                                    <Input label="Description" value={benefit.description} onChange={e => handleBenefitChange(index, 'description', e.target.value)} />
                                </div>
                                <Button variant="danger" size="sm" onClick={() => handleRemoveBenefit(index)} className="mt-6">X</Button>
                            </div>
                        ))}
                        <Button variant="secondary" onClick={handleAddBenefit}>+ Add Benefit</Button>
                    </div>
                )}

                {activeTab === 'preview' && (
                    <div className="border rounded-lg overflow-hidden h-[500px] overflow-y-auto bg-white">
                        <CareerPagePreview theme={config as ApplicantPageTheme} isPreview={true} />
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default ApplicantPageEditor;
