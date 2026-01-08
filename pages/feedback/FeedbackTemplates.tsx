import React, { useState, useEffect, useCallback } from 'react';
import { FeedbackTemplate, Permission } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { usePermissions } from '../../hooks/usePermissions';
import TemplateEditorModal from '../../components/feedback/TemplateEditorModal';
import { supabase } from '../../services/supabaseClient';

const FeedbackTemplates: React.FC = () => {
    const { can } = usePermissions();
    const canManage = can('FeedbackTemplates', Permission.Manage);
    const canView = can('FeedbackTemplates', Permission.View);

    const [templates, setTemplates] = useState<FeedbackTemplate[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<FeedbackTemplate | null>(null);
    const [loading, setLoading] = useState(false);

    const mapRowToTemplate = useCallback((row: any): FeedbackTemplate => ({
        id: row.id,
        title: row.title,
        body: row.body,
        from: row.from,
        subject: row.subject,
        cc: row.cc,
        logoUrl: row.logo_url,
        signatoryName: row.signatory_name,
        signatoryTitle: row.signatory_title,
        signatorySignatureUrl: row.signatory_signature_url || row.signatorysignatureurl || row.signatory_signature || row.signature_url,
    }), []);

    useEffect(() => {
        const loadTemplates = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('feedback_templates')
                    .select('*')
                    .order('created_at', { ascending: false });
                if (error) throw error;
                const mapped = (data || []).map(mapRowToTemplate);
                setTemplates(mapped);
            } catch (err) {
                console.error('Failed to load feedback templates', err);
                setTemplates([]);
            } finally {
                setLoading(false);
            }
        };
        loadTemplates();
    }, [mapRowToTemplate]);

    const handleOpenModal = (template: FeedbackTemplate | null) => {
        setSelectedTemplate(template);
        setIsModalOpen(true);
    };

    const handleSave = async (templateToSave: FeedbackTemplate) => {
        try {
            let saved;
            const payload = {
                title: templateToSave.title,
                body: templateToSave.body,
                from: templateToSave.from,
                subject: templateToSave.subject,
                cc: templateToSave.cc,
                logo_url: templateToSave.logoUrl,
                signatory_name: templateToSave.signatoryName,
                signatory_title: templateToSave.signatoryTitle,
                signatory_signature_url: templateToSave.signatorySignatureUrl || null,
            };
            if (templateToSave.id) {
                const { data, error } = await supabase
                    .from('feedback_templates')
                    .update(payload)
                    .eq('id', templateToSave.id)
                    .select()
                    .single();
                if (error) throw error;
                saved = data;
            } else {
                const { data, error } = await supabase
                    .from('feedback_templates')
                    .insert(payload)
                    .select()
                    .single();
                if (error) throw error;
                saved = data;
            }
            const mapped = mapRowToTemplate(saved);
            setTemplates(prev => {
                const exists = prev.find(t => t.id === mapped.id);
                if (exists) {
                    return prev.map(t => t.id === mapped.id ? mapped : t);
                }
                return [mapped, ...prev];
            });
            setIsModalOpen(false);
        } catch (err) {
            console.error('Failed to save feedback template', err);
            alert('Failed to save feedback template. Please try again.');
        }
    };
    
    if (!canView) {
        return (
            <div className="p-6">
                <Card>
                    <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                        You do not have permission to view Feedback Templates.
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Feedback Templates</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Manage reusable templates for NTEs and other formal notices.</p>
                </div>
                {canManage && <Button onClick={() => handleOpenModal(null)}>Create Template</Button>}
            </div>

            <Card>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Title</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Subject</th>
                                <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {loading && (
                                <tr>
                                    <td colSpan={3} className="px-6 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                                        Loading templates...
                                    </td>
                                </tr>
                            )}
                            {!loading && templates.map(template => (
                                <tr key={template.id}>
                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white">{template.title}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{template.subject}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <Button size="sm" onClick={() => handleOpenModal(template)}>Edit</Button>
                                    </td>
                                </tr>
                            ))}
                            {!loading && templates.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-6 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                                        No templates found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <TemplateEditorModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                template={selectedTemplate}
                onSave={handleSave}
            />
        </div>
    );
};

export default FeedbackTemplates;
