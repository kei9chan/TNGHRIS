
import React, { useEffect, useState, useCallback } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { JobPostVisualTemplate, Permission } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import JobPostTemplateGenerator from '../../components/recruitment/JobPostTemplateGenerator';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

const JobPostTemplates: React.FC = () => {
    const { can } = usePermissions();
    const { user } = useAuth();
    const canManage = can('JobPosts', Permission.Manage);
    const canView = can('JobPosts', Permission.View) || canManage;

    const [templates, setTemplates] = useState<JobPostVisualTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<JobPostVisualTemplate | null>(null);

    const mapRow = useCallback((row: any): JobPostVisualTemplate => ({
        id: row.id,
        name: row.name,
        createdBy: row.created_by_user_id || 'Unknown',
        updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
        backgroundColor: row.background_color,
        cardColor: row.card_color,
        textColor: row.text_color,
        accentColor: row.accent_color,
        backgroundImage: row.background_image || '',
        logoImage: row.logo_image || '',
        headline: row.headline,
        jobTitle: row.job_title,
        description: row.description,
        details: row.details || [],
        col1Title: row.col1_title,
        col1Content: row.col1_content,
        col2Title: row.col2_title,
        col2Content: row.col2_content,
        contactTitle: row.contact_title,
        email1: row.email1,
        email2: row.email2,
        subjectLine: row.subject_line,
        buttonText: row.button_text,
        mode: row.mode || undefined,
    }), []);

    const loadTemplates = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('job_post_templates')
                .select('*')
                .order('updated_at', { ascending: false });
            if (error) throw error;
            setTemplates((data || []).map(mapRow));
        } catch (err) {
            console.error('Failed to load job post templates', err);
            alert('Failed to load job post templates.');
        } finally {
            setIsLoading(false);
        }
    }, [mapRow]);

    useEffect(() => {
        loadTemplates();
    }, [loadTemplates]);

    const handleCreate = () => {
        setSelectedTemplate(null);
        setIsGeneratorOpen(true);
    };

    const handleEdit = (template: JobPostVisualTemplate) => {
        setSelectedTemplate(template);
        setIsGeneratorOpen(true);
    };

    const handleSave = async (template: JobPostVisualTemplate) => {
        setIsSaving(true);
        const payload = {
            name: template.name || 'Custom Template',
            created_by_user_id: user?.id || null,
            background_color: template.backgroundColor,
            card_color: template.cardColor,
            text_color: template.textColor,
            accent_color: template.accentColor,
            background_image: template.backgroundImage,
            logo_image: template.logoImage,
            headline: template.headline,
            job_title: template.jobTitle,
            description: template.description,
            details: template.details || [],
            col1_title: template.col1Title,
            col1_content: template.col1Content,
            col2_title: template.col2Title,
            col2_content: template.col2Content,
            contact_title: template.contactTitle,
            email1: template.email1,
            email2: template.email2,
            subject_line: template.subjectLine,
            button_text: template.buttonText,
            mode: template.mode || null,
        };

        try {
            if (selectedTemplate?.id) {
                const { data, error } = await supabase
                    .from('job_post_templates')
                    .update(payload)
                    .eq('id', selectedTemplate.id)
                    .select()
                    .single();
                if (error) throw error;
                const mapped = mapRow(data);
                setTemplates(prev => prev.map(t => (t.id === mapped.id ? mapped : t)));
            } else {
                const { data, error } = await supabase
                    .from('job_post_templates')
                    .insert(payload)
                    .select()
                    .single();
                if (error) throw error;
                const mapped = mapRow(data);
                setTemplates(prev => [mapped, ...prev]);
            }
            setIsGeneratorOpen(false);
        } catch (err: any) {
            console.error('Failed to save template', err);
            alert(err?.message || 'Failed to save template.');
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleDelete = async (id: string) => {
        if(!window.confirm("Are you sure you want to delete this template?")) return;
        try {
            const { error } = await supabase.from('job_post_templates').delete().eq('id', id);
            if (error) throw error;
            setTemplates(prev => prev.filter(t => t.id !== id));
        } catch (err) {
            console.error('Failed to delete template', err);
            alert('Failed to delete template.');
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Job Post Templates</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Design and manage visual templates for social media job postings.</p>
                </div>
                {canManage && <Button onClick={handleCreate}>Create Visual Template</Button>}
            </div>
            
            {!canView ? (
                <Card><div className="p-6 text-gray-600 dark:text-gray-300">You do not have permission to view job post templates.</div></Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {isLoading ? (
                        <div className="col-span-full text-center py-10 text-gray-500">Loading templates...</div>
                    ) : templates.map(template => (
                        <Card key={template.id} className="flex flex-col h-full !p-0 overflow-hidden group relative">
                             {/* Mini Preview */}
                            <div 
                                className="h-48 w-full relative p-4 flex flex-col justify-center items-center text-center text-xs select-none"
                                style={{ backgroundColor: template.backgroundColor, color: template.textColor }}
                            >
                                {template.logoImage && <img src={template.logoImage} className="h-6 mb-2 object-contain" alt="logo"/>}
                                <h3 className="font-bold uppercase" style={{ color: template.accentColor }}>{template.headline}</h3>
                                <h2 className="font-extrabold uppercase text-lg leading-tight" style={{ color: template.accentColor }}>
                                    {template.jobTitle}
                                </h2>
                                <div className="absolute bottom-2 w-3/4 h-6 rounded" style={{ backgroundColor: template.accentColor }}></div>
                            </div>
                            
                            <div className="p-4 flex-grow flex flex-col justify-between bg-white dark:bg-slate-800">
                                <div>
                                    <div className="flex justify-between items-start">
                                        <h3 className="font-bold text-lg text-gray-900 dark:text-white">{template.name}</h3>
                                    </div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        Last updated: {new Date(template.updatedAt).toLocaleDateString()}
                                    </p>
                                </div>
                                
                                {canManage && (
                                    <div className="mt-4 flex space-x-2 pt-4 border-t dark:border-slate-700">
                                        <Button size="sm" variant="secondary" className="w-full" onClick={() => handleEdit(template)}>Edit</Button>
                                        <Button size="sm" variant="danger" className="w-full" onClick={() => handleDelete(template.id)}>Delete</Button>
                                    </div>
                                )}
                            </div>
                        </Card>
                    ))}
                    {templates.length === 0 && !isLoading && (
                        <div className="col-span-full text-center py-12 text-gray-500">
                            <p>No visual templates found. Click "Create Visual Template" to start.</p>
                        </div>
                    )}
                </div>
            )}

            {isGeneratorOpen && (
                <JobPostTemplateGenerator
                    isOpen={isGeneratorOpen}
                    onClose={() => setIsGeneratorOpen(false)}
                    onSave={handleSave}
                    template={selectedTemplate}
                    saving={isSaving}
                />
            )}
        </div>
    );
};

export default JobPostTemplates;
