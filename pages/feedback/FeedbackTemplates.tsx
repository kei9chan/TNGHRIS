import React, { useState } from 'react';
import { FeedbackTemplate, Permission } from '../../types';
// FIX: Added mockFeedbackTemplates to the import.
import { mockFeedbackTemplates } from '../../services/mockData';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { usePermissions } from '../../hooks/usePermissions';
import TemplateEditorModal from '../../components/feedback/TemplateEditorModal';

const FeedbackTemplates: React.FC = () => {
    const { can } = usePermissions();
    const canManage = can('Feedback', Permission.Manage);

    const [templates, setTemplates] = useState<FeedbackTemplate[]>(mockFeedbackTemplates);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<FeedbackTemplate | null>(null);

    const handleOpenModal = (template: FeedbackTemplate | null) => {
        setSelectedTemplate(template);
        setIsModalOpen(true);
    };

    const handleSave = (templateToSave: FeedbackTemplate) => {
        if (templateToSave.id) {
            setTemplates(prev => prev.map(t => t.id === templateToSave.id ? templateToSave : t));
        } else {
            const newTemplate = { ...templateToSave, id: `FBTPL-${Date.now()}` };
            setTemplates(prev => [...prev, newTemplate]);
        }
        setIsModalOpen(false);
    };
    
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
                            {templates.map(template => (
                                <tr key={template.id}>
                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white">{template.title}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{template.subject}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <Button size="sm" onClick={() => handleOpenModal(template)}>Edit</Button>
                                    </td>
                                </tr>
                            ))}
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