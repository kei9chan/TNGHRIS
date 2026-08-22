import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Permission } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import JobPostTemplateGenerator from '../../components/recruitment/JobPostTemplateGenerator';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import {
    cleanTemplateText,
    cloneTemplate,
    DEMO_TEMPLATE_KEY,
    JOB_POST_TEMPLATE_PRESETS,
    JobPostTemplateRecord,
} from '../../components/recruitment/jobPostTemplatePresets';

const mapRow = (row: any): JobPostTemplateRecord => ({
    id: row.id,
    name: row.name || 'Untitled template',
    createdBy: row.created_by_user_id || 'Unknown',
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
    backgroundColor: row.background_color || '#FDE7EF',
    cardColor: row.card_color || '#FFFFFF',
    textColor: row.text_color || '#1F2937',
    accentColor: row.accent_color || '#EF4444',
    backgroundImage: row.background_image || '',
    logoImage: row.logo_image || '',
    headline: cleanTemplateText(row.headline),
    jobTitle: cleanTemplateText(row.job_title),
    description: cleanTemplateText(row.description),
    details: (Array.isArray(row.details) ? row.details : []).map((item: any) => ({ icon: cleanTemplateText(item.icon), label: cleanTemplateText(item.label) })).filter((item: any) => item.icon || item.label),
    col1Title: cleanTemplateText(row.col1_title),
    col1Content: cleanTemplateText(row.col1_content),
    col2Title: cleanTemplateText(row.col2_title),
    col2Content: cleanTemplateText(row.col2_content),
    contactTitle: cleanTemplateText(row.contact_title),
    email1: cleanTemplateText(row.email1),
    email2: cleanTemplateText(row.email2),
    subjectLine: cleanTemplateText(row.subject_line),
    buttonText: cleanTemplateText(row.button_text),
    mode: row.mode || undefined,
    templateKey: row.template_key || undefined,
    businessUnit: row.business_unit || '',
    status: row.status || 'Draft',
    isStarter: row.is_starter === true,
    ctaLink: row.cta_link || '',
    brandWordmark: row.brand_wordmark || row.business_unit || '',
    sections: (Array.isArray(row.sections) ? row.sections : []).map((item: any, index: number) => ({ id: item.id || `section-${index + 1}`, title: cleanTemplateText(item.title), content: (item.content || '').split('\n').map((line: string) => cleanTemplateText(line)).filter(Boolean).join('\n') })).filter((item: any) => item.title || item.content),
    persisted: true,
});

const templatePayload = (template: JobPostTemplateRecord, userId?: string | null) => ({
    name: template.name,
    created_by_user_id: userId || null,
    background_color: template.backgroundColor,
    card_color: template.cardColor,
    text_color: template.textColor,
    accent_color: template.accentColor,
    background_image: template.backgroundImage || '',
    logo_image: template.logoImage || '',
    headline: template.headline || '',
    job_title: template.jobTitle || '',
    description: template.description || '',
    details: template.details || [],
    sections: template.sections || [],
    col1_title: template.col1Title || '',
    col1_content: template.col1Content || '',
    col2_title: template.col2Title || '',
    col2_content: template.col2Content || '',
    contact_title: template.contactTitle || '',
    email1: template.email1 || '',
    email2: template.email2 || '',
    subject_line: template.subjectLine || '',
    button_text: template.buttonText || '',
    mode: template.mode || null,
    template_key: template.templateKey || null,
    business_unit: template.businessUnit || null,
    status: template.status || 'Draft',
    is_starter: template.isStarter === true,
    cta_link: template.ctaLink || null,
    brand_wordmark: template.brandWordmark || template.businessUnit || null,
});

const asFallbackTemplate = (template: JobPostTemplateRecord): JobPostTemplateRecord => ({
    ...cloneTemplate(template),
    persisted: false,
    updatedAt: new Date(0),
});

const JobPostTemplates: React.FC = () => {
    const { can } = usePermissions();
    const { user } = useAuth();
    const canManage = can('JobPosts', Permission.Manage);
    const canView = can('JobPosts', Permission.View) || canManage;
    const [templates, setTemplates] = useState<JobPostTemplateRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<JobPostTemplateRecord | null>(null);
    const [loadError, setLoadError] = useState('');
    const [saveError, setSaveError] = useState('');
    const [hasAutoOpenedDemo, setHasAutoOpenedDemo] = useState(false);

    const sortTemplates = useCallback((items: JobPostTemplateRecord[]) => [...items].sort((left, right) => {
        if (left.templateKey === DEMO_TEMPLATE_KEY) return -1;
        if (right.templateKey === DEMO_TEMPLATE_KEY) return 1;
        if (left.isStarter !== right.isStarter) return left.isStarter ? -1 : 1;
        return left.name.localeCompare(right.name);
    }), []);

    const loadTemplates = useCallback(async () => {
        if (!canView) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setLoadError('');
        try {
            const { data, error } = await supabase.from('job_post_templates').select('*').order('updated_at', { ascending: false });
            if (error) throw error;
            const loaded = (data || []).map(mapRow);
            const existingKeys = new Set(loaded.map(template => template.templateKey).filter(Boolean));
            const existingNames = new Set(loaded.map(template => template.name));
            const missing = JOB_POST_TEMPLATE_PRESETS.filter(template => !existingKeys.has(template.templateKey) && !existingNames.has(template.name));
            let seeded: JobPostTemplateRecord[] = [];

            if (canManage && missing.length > 0) {
                const { data: inserted, error: seedError } = await supabase.from('job_post_templates').insert(missing.map(template => templatePayload(template, user?.id))).select('*');
                if (seedError) {
                    console.error('Starter template seed failed', seedError);
                    setLoadError('Starter templates could not be saved yet. The populated previews are available while the database migration is applied.');
                    seeded = missing.map(asFallbackTemplate);
                } else {
                    seeded = (inserted || []).map(mapRow);
                }
            } else if (missing.length > 0) {
                seeded = missing.map(asFallbackTemplate);
            }
            setTemplates(sortTemplates([...loaded, ...seeded]));
        } catch (error: any) {
            console.error('Failed to load job post templates', error);
            setLoadError(error?.message || 'Failed to load job post templates.');
            setTemplates(sortTemplates(JOB_POST_TEMPLATE_PRESETS.map(asFallbackTemplate)));
        } finally {
            setIsLoading(false);
        }
    }, [canManage, canView, sortTemplates, user?.id]);

    useEffect(() => { loadTemplates(); }, [loadTemplates]);

    useEffect(() => {
        if (!isLoading && canManage && !hasAutoOpenedDemo && templates.length > 0) {
            const demo = templates.find(template => template.templateKey === DEMO_TEMPLATE_KEY) || templates[0];
            if (demo) {
                setSelectedTemplate(demo);
                setIsGeneratorOpen(true);
            }
            setHasAutoOpenedDemo(true);
        }
    }, [canManage, hasAutoOpenedDemo, isLoading, templates]);

    const handleCreate = () => {
        setSaveError('');
        setSelectedTemplate(null);
        setIsGeneratorOpen(true);
    };

    const handleEdit = (template: JobPostTemplateRecord) => {
        setSaveError('');
        setSelectedTemplate(template);
        setIsGeneratorOpen(true);
    };

    const handleSave = async (template: JobPostTemplateRecord) => {
        setIsSaving(true);
        setSaveError('');
        try {
            const payload = templatePayload(template, user?.id);
            if (selectedTemplate?.persisted && selectedTemplate.id) {
                const { data, error } = await supabase.from('job_post_templates').update(payload).eq('id', selectedTemplate.id).select('*').single();
                if (error) throw error;
                const mapped = mapRow(data);
                setTemplates(previous => sortTemplates(previous.map(item => item.id === mapped.id ? mapped : item)));
                setSelectedTemplate(mapped);
            } else {
                const { data, error } = await supabase.from('job_post_templates').insert(payload).select('*').single();
                if (error) throw error;
                const mapped = mapRow(data);
                setTemplates(previous => sortTemplates([...previous.filter(item => item.templateKey !== mapped.templateKey), mapped]));
                setSelectedTemplate(mapped);
            }
            setIsGeneratorOpen(false);
        } catch (error: any) {
            console.error('Failed to save template', error);
            setSaveError(error?.message || 'Failed to save template.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (template: JobPostTemplateRecord) => {
        if (template.isStarter) return;
        if (!window.confirm('Are you sure you want to delete this template?')) return;
        if (!template.persisted) {
            setTemplates(previous => previous.filter(item => item.id !== template.id));
            return;
        }
        try {
            const { error } = await supabase.from('job_post_templates').delete().eq('id', template.id);
            if (error) throw error;
            setTemplates(previous => previous.filter(item => item.id !== template.id));
        } catch (error: any) {
            console.error('Failed to delete template', error);
            setSaveError(error?.message || 'Failed to delete template.');
        }
    };

    const demo = useMemo(() => templates.find(template => template.templateKey === DEMO_TEMPLATE_KEY), [templates]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div><h1 className="text-3xl font-bold text-gray-900 dark:text-white">Job Post Templates</h1><p className="mt-1 text-gray-600 dark:text-gray-400">Reusable, on-brand job post layouts for every business unit.</p></div>
                {canManage && <Button onClick={handleCreate}>Create Visual Template</Button>}
            </div>
            {loadError && <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{loadError}</div>}
            {saveError && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">{saveError}</div>}

            {!canView ? <Card><div className="p-6 text-gray-600 dark:text-gray-300">You do not have permission to view job post templates.</div></Card> : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {isLoading ? <div className="col-span-full py-10 text-center text-gray-500">Loading populated templates…</div> : templates.map(template => {
                        const wordmark = template.brandWordmark || template.businessUnit || 'TNG HRIS';
                        return <Card key={template.id} className="group relative flex h-full flex-col overflow-hidden !p-0">
                            <div className="relative flex h-52 w-full flex-col items-center justify-center overflow-hidden p-5 text-center select-none" style={{ backgroundColor: template.backgroundColor, color: template.textColor }}>
                                {template.backgroundImage && <img src={template.backgroundImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />}
                                <div className="relative z-10"><div className="mb-3 text-xs font-black uppercase tracking-[0.18em]" style={{ color: template.accentColor }}>{wordmark}</div><h3 className="line-clamp-2 text-sm font-bold uppercase" style={{ color: template.accentColor }}>{template.headline}</h3><h2 className="mt-2 line-clamp-2 text-xl font-extrabold uppercase leading-tight" style={{ color: template.textColor }}>{template.jobTitle}</h2><div className="mx-auto mt-5 h-2 w-32 rounded-full" style={{ backgroundColor: template.accentColor }} /></div>
                            </div>
                            <div className="flex flex-grow flex-col justify-between bg-white p-4 dark:bg-slate-800"><div><div className="flex items-start justify-between gap-3"><h3 className="font-bold text-gray-900 dark:text-white">{template.name}</h3>{template.isStarter && <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">Starter</span>}</div><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{template.businessUnit || 'Custom template'} · {template.status || 'Draft'}</p></div>{canManage && <div className="mt-4 flex gap-2 border-t border-gray-200 pt-4 dark:border-slate-700"><Button size="sm" variant="secondary" className="w-full" onClick={() => handleEdit(template)}>Edit</Button>{!template.isStarter && <Button size="sm" variant="danger" className="w-full" onClick={() => handleDelete(template)}>Delete</Button>}</div>}</div>
                        </Card>;
                    })}
                    {!isLoading && templates.length === 0 && <div className="col-span-full py-12 text-center text-gray-500">No templates found.</div>}
                </div>
            )}

            {demo && <span className="sr-only">Demo template loaded: {demo.name}</span>}
            {isGeneratorOpen && <JobPostTemplateGenerator isOpen={isGeneratorOpen} onClose={() => setIsGeneratorOpen(false)} onSave={handleSave} template={selectedTemplate} saving={isSaving} />}
        </div>
    );
};

export default JobPostTemplates;
