


import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ApplicantPageTheme, OpenRolesBenefit, OpenRolesConfig, WorkplaceGalleryPhoto } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import CareerPagePreview from './CareerPagePreview';
import FileUploader from '../ui/FileUploader';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { getOpenRolesConfig } from '../../services/publicCareersService';

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

const getImageExtension = (file: File): string => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    return extension && HERO_IMAGE_EXTENSIONS.includes(`.${extension}`) ? extension : 'jpg';
};

const getStorageOwnerId = (user: any): string | null => user?.authUserId || user?.id || null;

const ApplicantPageEditor: React.FC<ApplicantPageEditorProps> = ({ isOpen, onClose, onSave, theme, businessUnits }) => {
    const { user } = useAuth();
    const [config, setConfig] = useState<Partial<ApplicantPageTheme>>({});
    const [activeTab, setActiveTab] = useState<'general' | 'hero' | 'openRoles' | 'benefits' | 'workplace' | 'preview'>('general');
    const [isUploadingHero, setIsUploadingHero] = useState(false);
    const [heroUploadError, setHeroUploadError] = useState<string | null>(null);
    const [heroPreviewUrl, setHeroPreviewUrl] = useState<string | null>(null);
    const [uploadedHeroImagePath, setUploadedHeroImagePath] = useState<string | null>(null);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
    const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
    const [uploadedLogoImagePath, setUploadedLogoImagePath] = useState<string | null>(null);
    const [isUploadingOpenRoles, setIsUploadingOpenRoles] = useState(false);
    const [openRolesUploadError, setOpenRolesUploadError] = useState<string | null>(null);
    const [openRolesPreviewUrl, setOpenRolesPreviewUrl] = useState<string | null>(null);
    const [uploadedOpenRolesImagePath, setUploadedOpenRolesImagePath] = useState<string | null>(null);
    const [isUploadingGallery, setIsUploadingGallery] = useState(false);
    const [galleryUploadError, setGalleryUploadError] = useState<string | null>(null);
    const [draggingGalleryIndex, setDraggingGalleryIndex] = useState<number | null>(null);
    const newGalleryPathsRef = useRef<Set<string>>(new Set());
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
        logoImage: '',
        contactEmail: '',
        ctaText: 'View Open Roles',
        ctaLink: '/open-roles',
        benefits: [
            { id: 'b1', title: 'Great Culture', description: 'Work with amazing people', icon: 'smile' },
            { id: 'b2', title: 'Competitive Pay', description: 'We reward performance', icon: 'wallet' },
        ],
        testimonials: [],
        workplaceGallery: [],
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
            setLogoPreviewUrl(null);
            setUploadedLogoImagePath(null);
            setLogoUploadError(null);
            setOpenRolesUploadError(null);
            setOpenRolesPreviewUrl(null);
            setUploadedOpenRolesImagePath(null);
            setGalleryUploadError(null);
            newGalleryPathsRef.current = new Set();
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

        // `user.id` is the HRIS profile primary key, while Storage RLS scopes
        // uploads to the authenticated Supabase user UUID. Use the latter for
        // the object prefix so the insert policy can authorize the upload.
        const storageOwnerId = user?.authUserId || user?.id;
        if (!storageOwnerId) {
            setHeroUploadError('You must be signed in to upload a hero image.');
            return;
        }

        const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `hero/${storageOwnerId}/${crypto.randomUUID()}.${extension}`;
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

    const handleLogoImageUpload = async (file: File) => {
        setLogoUploadError(null);
        setSaveError(null);

        const storageOwnerId = getStorageOwnerId(user);
        if (!storageOwnerId) {
            setLogoUploadError('You must be signed in to upload a business unit logo.');
            return;
        }

        const path = `hero/${storageOwnerId}/logo-${crypto.randomUUID()}.${getImageExtension(file)}`;
        const localPreviewUrl = URL.createObjectURL(file);
        setLogoPreviewUrl(localPreviewUrl);
        setIsUploadingLogo(true);

        try {
            const { data, error } = await supabase.storage
                .from(HERO_ASSET_BUCKET)
                .upload(path, file, {
                    cacheControl: '31536000',
                    contentType: file.type,
                    upsert: false,
                });

            if (error) throw error;
            if (!data?.path) throw new Error('The logo upload completed without a storage path.');

            const { data: publicUrlData } = supabase.storage
                .from(HERO_ASSET_BUCKET)
                .getPublicUrl(data.path);

            if (!publicUrlData?.publicUrl) {
                throw new Error('The logo uploaded, but a public image URL could not be generated.');
            }

            handleChange('logoImage', publicUrlData.publicUrl);
            setUploadedLogoImagePath(data.path);
        } catch (error: any) {
            setLogoUploadError(error?.message || 'Logo upload failed. Please try again.');
        } finally {
            URL.revokeObjectURL(localPreviewUrl);
            setLogoPreviewUrl(null);
            setIsUploadingLogo(false);
        }
    };

    const updateOpenRoles = (updates: Partial<OpenRolesConfig>) => {
        setConfig(prev => ({
            ...prev,
            sections: {
                ...(prev.sections || {}),
                openRoles: {
                    ...(prev.sections?.openRoles || {}),
                    ...updates,
                },
            },
        }));
    };

    const handleOpenRolesImageUpload = async (file: File) => {
        setOpenRolesUploadError(null);
        setSaveError(null);

        const storageOwnerId = user?.authUserId || user?.id;
        if (!storageOwnerId) {
            setOpenRolesUploadError('You must be signed in to upload an Open Roles image.');
            return;
        }

        const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        // Keep the existing storage policy compatible by using the hero/<user>
        // owner prefix for all application-page assets.
        const path = `hero/${storageOwnerId}/open-roles-${crypto.randomUUID()}.${extension}`;
        const localPreviewUrl = URL.createObjectURL(file);
        setOpenRolesPreviewUrl(localPreviewUrl);
        setIsUploadingOpenRoles(true);

        try {
            const { data, error } = await supabase.storage
                .from(HERO_ASSET_BUCKET)
                .upload(path, file, {
                    cacheControl: '31536000',
                    contentType: file.type,
                    upsert: false,
                });
            if (error) throw error;
            if (!data?.path) throw new Error('The Open Roles image upload completed without a storage path.');

            const { data: publicUrlData } = supabase.storage.from(HERO_ASSET_BUCKET).getPublicUrl(data.path);
            if (!publicUrlData?.publicUrl) throw new Error('The Open Roles image uploaded, but a public URL could not be generated.');

            updateOpenRoles({ heroImage: publicUrlData.publicUrl });
            URL.revokeObjectURL(localPreviewUrl);
            setOpenRolesPreviewUrl(null);
            setUploadedOpenRolesImagePath(data.path);
        } catch (error: any) {
            URL.revokeObjectURL(localPreviewUrl);
            setOpenRolesPreviewUrl(null);
            setOpenRolesUploadError(error?.message || 'Open Roles image upload failed. Please try again.');
        } finally {
            setIsUploadingOpenRoles(false);
        }
    };

    const validateGalleryFile = (file: File): string | null => {
        if (file.size > HERO_IMAGE_MAX_SIZE) {
            return `${file.name}: image must be 20 MB or smaller.`;
        }

        const extensionAllowed = HERO_IMAGE_EXTENSIONS.some(extension => file.name.toLowerCase().endsWith(extension));
        if (!HERO_IMAGE_MIME_TYPES.includes(file.type) && !(file.type === '' && extensionAllowed)) {
            return `${file.name}: only JPG, PNG, and WebP images are supported.`;
        }

        return null;
    };

    const uploadGalleryFiles = async (files: File[]) => {
        if (!files.length) return;

        setGalleryUploadError(null);
        setSaveError(null);
        const storageOwnerId = getStorageOwnerId(user);
        if (!storageOwnerId) {
            setGalleryUploadError('You must be signed in to upload workplace photos.');
            return;
        }

        const errors = files.map(validateGalleryFile).filter(Boolean) as string[];
        const validFiles = files.filter(file => !validateGalleryFile(file));
        if (!validFiles.length) {
            setGalleryUploadError(errors.join(' '));
            return;
        }

        setIsUploadingGallery(true);
        const uploaded: WorkplaceGalleryPhoto[] = [];
        try {
            for (const file of validFiles) {
                const id = crypto.randomUUID();
                const path = `hero/${storageOwnerId}/gallery-${id}.${getImageExtension(file)}`;
                const { data, error } = await supabase.storage
                    .from(HERO_ASSET_BUCKET)
                    .upload(path, file, {
                        cacheControl: '31536000',
                        contentType: file.type,
                        upsert: false,
                    });

                if (error) throw error;
                if (!data?.path) throw new Error(`${file.name}: upload completed without a storage path.`);

                const { data: publicUrlData } = supabase.storage
                    .from(HERO_ASSET_BUCKET)
                    .getPublicUrl(data.path);
                if (!publicUrlData?.publicUrl) throw new Error(`${file.name}: public image URL could not be generated.`);

                newGalleryPathsRef.current.add(data.path);
                uploaded.push({
                    id,
                    url: publicUrlData.publicUrl,
                    caption: '',
                    isFeatured: (config.workplaceGallery || []).length === 0 && uploaded.length === 0,
                    isActive: true,
                    storagePath: data.path,
                });
            }

            setConfig(prev => ({
                ...prev,
                workplaceGallery: [...(prev.workplaceGallery || []), ...uploaded],
            }));
            if (errors.length) setGalleryUploadError(errors.join(' '));
        } catch (error: any) {
            setGalleryUploadError(error?.message || 'Workplace photo upload failed. Please try again.');
        } finally {
            setIsUploadingGallery(false);
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

    const handleOpenRolesBenefitChange = (index: number, field: keyof OpenRolesBenefit, value: string) => {
        const current = getOpenRolesConfig(config as ApplicantPageTheme);
        const benefits = [...current.benefits];
        benefits[index] = { ...benefits[index], [field]: value } as OpenRolesBenefit;
        updateOpenRoles({ benefits });
    };

    const handleAddOpenRolesBenefit = () => {
        const current = getOpenRolesConfig(config as ApplicantPageTheme);
        updateOpenRoles({
            benefits: [...current.benefits, { id: `open-role-benefit-${Date.now()}`, title: 'New Highlight', description: 'Describe this benefit.', icon: 'star' }],
        });
    };

    const handleRemoveOpenRolesBenefit = (index: number) => {
        const current = getOpenRolesConfig(config as ApplicantPageTheme);
        updateOpenRoles({ benefits: current.benefits.filter((_, benefitIndex) => benefitIndex !== index) });
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

    const handleRemoveLogoImage = async () => {
        const pathToRemove = uploadedLogoImagePath;
        setLogoPreviewUrl(null);
        setUploadedLogoImagePath(null);
        handleChange('logoImage', '');
        if (pathToRemove) {
            const { error } = await supabase.storage.from(HERO_ASSET_BUCKET).remove([pathToRemove]);
            if (error) console.warn('Failed to remove temporary logo', error);
        }
    };

    const handleRemoveOpenRolesImage = async () => {
        const pathToRemove = uploadedOpenRolesImagePath;
        setOpenRolesPreviewUrl(null);
        setUploadedOpenRolesImagePath(null);
        updateOpenRoles({ heroImage: '' });
        if (pathToRemove) {
            const { error } = await supabase.storage.from(HERO_ASSET_BUCKET).remove([pathToRemove]);
            if (error) console.warn('Failed to remove temporary Open Roles image', error);
        }
    };

    const updateGalleryPhoto = (index: number, updates: Partial<WorkplaceGalleryPhoto>) => {
        setConfig(prev => {
            const gallery = [...(prev.workplaceGallery || [])];
            if (!gallery[index]) return prev;

            gallery[index] = { ...gallery[index], ...updates };
            if (updates.isFeatured) {
                return {
                    ...prev,
                    workplaceGallery: gallery.map((photo, photoIndex) => ({
                        ...photo,
                        isFeatured: photoIndex === index,
                    })),
                };
            }
            return { ...prev, workplaceGallery: gallery };
        });
    };

    const moveGalleryPhoto = (index: number, direction: -1 | 1) => {
        setConfig(prev => {
            const gallery = [...(prev.workplaceGallery || [])];
            const target = index + direction;
            if (target < 0 || target >= gallery.length) return prev;
            [gallery[index], gallery[target]] = [gallery[target], gallery[index]];
            return { ...prev, workplaceGallery: gallery };
        });
    };

    const reorderGalleryPhoto = (fromIndex: number, toIndex: number) => {
        setConfig(prev => {
            const gallery = [...(prev.workplaceGallery || [])];
            if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= gallery.length || toIndex >= gallery.length) return prev;
            const [photo] = gallery.splice(fromIndex, 1);
            gallery.splice(toIndex, 0, photo);
            return { ...prev, workplaceGallery: gallery };
        });
    };

    const handleRemoveGalleryPhoto = async (index: number) => {
        const photo = config.workplaceGallery?.[index];
        if (!photo) return;

        setConfig(prev => ({
            ...prev,
            workplaceGallery: prev.workplaceGallery?.filter((_, photoIndex) => photoIndex !== index),
        }));

        if (photo.storagePath && newGalleryPathsRef.current.has(photo.storagePath)) {
            newGalleryPathsRef.current.delete(photo.storagePath);
            const { error } = await supabase.storage.from(HERO_ASSET_BUCKET).remove([photo.storagePath]);
            if (error) console.warn('Failed to remove temporary workplace photo', error);
        }
    };

    const busy = isUploadingHero || isUploadingLogo || isUploadingOpenRoles || isUploadingGallery || isSaving;

    const handleSave = async () => {
        if (!config.name?.trim() || !config.slug?.trim() || !config.businessUnitId) {
            setSaveError('Name, slug, and Business Unit are required.');
            return;
        }
        if (busy) {
            setSaveError('Please wait for uploads to finish.');
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
    const openRolesConfig = getOpenRolesConfig(config as ApplicantPageTheme);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={theme ? 'Edit Application Page' : 'Create Application Page'}
            size="4xl"
            footer={
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between w-full">
                    <div className="text-sm" role="status">
                        {saveError && <span className="text-red-600">{saveError}</span>}
                    </div>
                    <div className="flex justify-end space-x-2">
                        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
                        <Button onClick={handleSave} disabled={busy}>{isSaving ? 'Saving…' : 'Save Page'}</Button>
                    </div>
                </div>
            }
        >
            <div className="flex space-x-2 mb-4 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
                <button type="button" onClick={() => setActiveTab('general')} className={tabClass('general')}>General</button>
                <button type="button" onClick={() => setActiveTab('hero')} className={tabClass('hero')}>Hero & Colors</button>
                <button type="button" onClick={() => setActiveTab('openRoles')} className={tabClass('openRoles')}>Open Roles</button>
                <button type="button" onClick={() => setActiveTab('benefits')} className={tabClass('benefits')}>Why Join Us</button>
                <button type="button" onClick={() => setActiveTab('workplace')} className={tabClass('workplace')}>Workplace Album</button>
                <button type="button" onClick={() => setActiveTab('preview')} className={tabClass('preview')}>Live Preview</button>
            </div>

            <div className="min-h-[400px]">
                {activeTab === 'general' && (
                    <div className="space-y-4 max-w-2xl">
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input label="CTA Text" value={config.ctaText || ''} onChange={e => handleChange('ctaText', e.target.value)} />
                            <Input label="CTA Destination" value={config.ctaLink || ''} onChange={e => handleChange('ctaLink', e.target.value)} placeholder="/careers/your-slug/open-roles" />
                        </div>
                    </div>
                )}

                {activeTab === 'hero' && (
                    <div className="space-y-4">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Business Unit Logo</label>
                            <FileUploader
                                onFileUpload={handleLogoImageUpload}
                                maxSize={HERO_IMAGE_MAX_SIZE}
                                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                                allowedMimeTypes={HERO_IMAGE_MIME_TYPES}
                                allowedExtensions={HERO_IMAGE_EXTENSIONS}
                                inputId="application-page-logo-upload"
                                disabled={isUploadingLogo || isSaving}
                            />
                            {logoUploadError && <p className="mt-2 text-sm text-red-600" role="alert">{logoUploadError}</p>}
                            {(logoPreviewUrl || config.logoImage) && (
                                <div className="mt-2 relative h-28 rounded-md overflow-hidden border border-gray-300 dark:border-gray-600 bg-white">
                                    <img src={logoPreviewUrl || config.logoImage} alt="Business unit logo preview" className="w-full h-full object-contain p-3" />
                                    <button type="button" onClick={handleRemoveLogoImage} disabled={busy} className="absolute top-2 right-2 bg-red-600 text-white px-2 py-1 text-xs rounded shadow-md hover:bg-red-700 disabled:opacity-50">Remove</button>
                                </div>
                            )}
                        </div>
                        
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

                {activeTab === 'openRoles' && (
                    <div className="space-y-5">
                        <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
                            <p className="text-sm text-indigo-800 dark:text-indigo-200">Configure the connected Open Roles page. It automatically reads published job posts from Recruitment → Job Posts.</p>
                        </div>

                        <div className="flex flex-wrap gap-6">
                            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                <input type="checkbox" checked={openRolesConfig.enabled} onChange={e => updateOpenRoles({ enabled: e.target.checked })} className="h-4 w-4 text-indigo-600 rounded" />
                                Show Open Roles page
                            </label>
                            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                <input type="checkbox" checked={openRolesConfig.published} onChange={e => updateOpenRoles({ published: e.target.checked })} className="h-4 w-4 text-indigo-600 rounded" />
                                Published
                            </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input label="Open Roles Page Name" value={openRolesConfig.pageName} onChange={e => updateOpenRoles({ pageName: e.target.value })} />
                            <Input label="Open Roles URL Slug" value={openRolesConfig.pageSlug} onChange={e => updateOpenRoles({ pageSlug: e.target.value.toLowerCase().trim().replace(/\s+/g, '-') })} />
                            <Input label="Navigation Label" value={openRolesConfig.navigationLabel} onChange={e => updateOpenRoles({ navigationLabel: e.target.value })} />
                            <Input label="Display Order" type="number" value={openRolesConfig.displayOrder} onChange={e => updateOpenRoles({ displayOrder: Number(e.target.value) || 0 })} />
                        </div>

                        <Input label="Open Roles Hero Heading" value={openRolesConfig.heroHeadline} onChange={e => updateOpenRoles({ heroHeadline: e.target.value })} />
                        <Textarea label="Open Roles Hero Description" value={openRolesConfig.heroDescription} onChange={e => updateOpenRoles({ heroDescription: e.target.value })} rows={3} />

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Open Roles Hero Image</label>
                            <FileUploader
                                onFileUpload={handleOpenRolesImageUpload}
                                maxSize={HERO_IMAGE_MAX_SIZE}
                                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                                allowedMimeTypes={HERO_IMAGE_MIME_TYPES}
                                allowedExtensions={HERO_IMAGE_EXTENSIONS}
                                inputId="application-page-open-roles-upload"
                                disabled={isUploadingOpenRoles || isSaving}
                            />
                            {openRolesUploadError && <p className="mt-2 text-sm text-red-600" role="alert">{openRolesUploadError}</p>}
                            {(openRolesPreviewUrl || openRolesConfig.heroImage) && (
                                <div className="mt-2 relative h-40 w-full rounded-md overflow-hidden border border-gray-300 dark:border-gray-600">
                                    <img src={openRolesPreviewUrl || openRolesConfig.heroImage} alt="Open Roles hero preview" className="w-full h-full object-cover" />
                                    <button onClick={handleRemoveOpenRolesImage} disabled={isUploadingOpenRoles || isSaving} className="absolute top-2 right-2 bg-red-600 text-white px-2 py-1 text-xs rounded shadow-md hover:bg-red-700 transition-colors disabled:opacity-50">Remove Image</button>
                                </div>
                            )}
                        </div>

                        <div className="space-y-3">
                            <div><h3 className="text-sm font-semibold text-gray-900 dark:text-white">Benefits / Highlights</h3><p className="text-xs text-gray-500">These appear above the role list.</p></div>
                            {openRolesConfig.benefits.map((benefit, index) => (
                                <div key={benefit.id} className="flex items-start space-x-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-md border dark:border-gray-700">
                                    <div className="flex-shrink-0"><label className="block text-xs font-medium text-gray-500 mb-1">Icon</label><select value={benefit.icon} onChange={e => handleOpenRolesBenefitChange(index, 'icon', e.target.value)} className="block w-24 pl-2 pr-8 py-1 text-sm border-gray-300 rounded-md dark:bg-gray-700">{icons.map(icon => <option key={icon} value={icon}>{icon}</option>)}</select></div>
                                    <div className="flex-grow space-y-2"><Input label="Title" value={benefit.title} onChange={e => handleOpenRolesBenefitChange(index, 'title', e.target.value)} /><Input label="Description" value={benefit.description} onChange={e => handleOpenRolesBenefitChange(index, 'description', e.target.value)} /></div>
                                    <Button variant="danger" size="sm" onClick={() => handleRemoveOpenRolesBenefit(index)} className="mt-6">X</Button>
                                </div>
                            ))}
                            <Button variant="secondary" onClick={handleAddOpenRolesBenefit}>+ Add Highlight</Button>
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

                {activeTab === 'workplace' && (
                    <div className="space-y-5">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Workplace Album</h3>
                            <p className="text-sm text-gray-500">Upload multiple photos, choose a featured image, and arrange the album using the existing application-page asset storage.</p>
                        </div>
                        <label
                            className={`block rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${isUploadingGallery ? 'opacity-60 cursor-wait' : 'border-indigo-300 hover:border-indigo-500'}`}
                            onDragOver={event => event.preventDefault()}
                            onDrop={event => {
                                event.preventDefault();
                                if (!busy) void uploadGalleryFiles(Array.from(event.dataTransfer.files));
                            }}
                        >
                            <input
                                type="file"
                                className="sr-only"
                                multiple
                                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                                disabled={busy}
                                onChange={event => {
                                    void uploadGalleryFiles(Array.from(event.target.files || []));
                                    event.currentTarget.value = '';
                                }}
                            />
                            <span className="text-sm font-medium text-indigo-600">{isUploadingGallery ? 'Uploading photos…' : 'Upload photos or drag and drop here'}</span>
                            <span className="block mt-1 text-xs text-gray-500">JPG, PNG, or WebP · up to 20 MB each</span>
                        </label>
                        {galleryUploadError && <p className="text-sm text-red-600" role="alert">{galleryUploadError}</p>}
                        {(config.workplaceGallery || []).length === 0 ? (
                            <p className="text-sm text-gray-500">No workplace photos uploaded yet. The public album stays hidden until photos are added.</p>
                        ) : (
                            <div className="space-y-3">
                                {(config.workplaceGallery || []).map((photo, index) => (
                                    <div key={photo.id} draggable onDragStart={() => setDraggingGalleryIndex(index)} onDragOver={event => event.preventDefault()} onDrop={() => { if (draggingGalleryIndex !== null) reorderGalleryPhoto(draggingGalleryIndex, index); setDraggingGalleryIndex(null); }} onDragEnd={() => setDraggingGalleryIndex(null)} className="flex flex-col md:flex-row gap-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3 cursor-grab active:cursor-grabbing">
                                        <img src={photo.url} alt={photo.caption || `Workplace photo ${index + 1}`} className="h-28 w-full md:w-40 rounded-md object-cover bg-gray-100" />
                                        <div className="flex-1 space-y-2">
                                            <Input label="Caption (optional)" value={photo.caption || ''} onChange={event => updateGalleryPhoto(index, { caption: event.target.value })} />
                                            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
                                                <label className="flex items-center gap-2"><input type="checkbox" checked={photo.isFeatured === true} onChange={event => updateGalleryPhoto(index, { isFeatured: event.target.checked })} />Featured</label>
                                                <label className="flex items-center gap-2"><input type="checkbox" checked={photo.isActive !== false} onChange={event => updateGalleryPhoto(index, { isActive: event.target.checked })} />Active</label>
                                                <button type="button" onClick={() => moveGalleryPhoto(index, -1)} disabled={index === 0} className="text-indigo-600 disabled:text-gray-400">Move up</button>
                                                <button type="button" onClick={() => moveGalleryPhoto(index, 1)} disabled={index === (config.workplaceGallery || []).length - 1} className="text-indigo-600 disabled:text-gray-400">Move down</button>
                                                <button type="button" onClick={() => void handleRemoveGalleryPhoto(index)} className="text-red-600">Remove</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
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
