
import React, { useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { JobPostVisualTemplate, Permission } from '../../types';
import { mockJobPostVisualTemplates } from '../../services/mockData';
import { usePermissions } from '../../hooks/usePermissions';
import JobPostTemplateGenerator from '../../components/recruitment/JobPostTemplateGenerator';

const JobPostTemplates: React.FC = () => {
    const { can } = usePermissions();
    const canManage = can('JobPosts', Permission.Manage);

    const [templates, setTemplates] = useState<JobPostVisualTemplate[]>(mockJobPostVisualTemplates);
    const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<JobPostVisualTemplate | null>(null);

    const handleCreate = () => {
        setSelectedTemplate(null);
        setIsGeneratorOpen(true);
    };

    const handleEdit = (template: JobPostVisualTemplate) => {
        setSelectedTemplate(template);
        setIsGeneratorOpen(true);
    };

    const handleSave = (template: JobPostVisualTemplate) => {
        if (selectedTemplate) {
            // Update
            setTemplates(prev => prev.map(t => t.id === template.id ? template : t));
            const idx = mockJobPostVisualTemplates.findIndex(t => t.id === template.id);
            if (idx > -1) mockJobPostVisualTemplates[idx] = template;
        } else {
            // Create
            setTemplates(prev => [...prev, template]);
            mockJobPostVisualTemplates.push(template);
        }
        setIsGeneratorOpen(false);
    };
    
    const handleDelete = (id: string) => {
        if(window.confirm("Are you sure you want to delete this template?")) {
            setTemplates(prev => prev.filter(t => t.id !== id));
            const idx = mockJobPostVisualTemplates.findIndex(t => t.id === id);
            if (idx > -1) mockJobPostVisualTemplates.splice(idx, 1);
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
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map(template => (
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
                                    <Button size="sm" variant="danger" onClick={() => handleDelete(template.id)}>Delete</Button>
                                </div>
                            )}
                        </div>
                    </Card>
                ))}
                {templates.length === 0 && (
                    <div className="col-span-full text-center py-12 text-gray-500">
                        <p>No visual templates created yet. Click "Create Visual Template" to start.</p>
                    </div>
                )}
            </div>

            {isGeneratorOpen && (
                <JobPostTemplateGenerator
                    isOpen={isGeneratorOpen}
                    onClose={() => setIsGeneratorOpen(false)}
                    onSave={handleSave}
                    template={selectedTemplate}
                />
            )}
        </div>
    );
};

export default JobPostTemplates;
