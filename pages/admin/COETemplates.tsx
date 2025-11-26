
import React, { useState, useMemo } from 'react';
import { COETemplate, Permission } from '../../types';
import { mockCOETemplates, mockBusinessUnits } from '../../services/mockData';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import COETemplateModal from '../../components/admin/COETemplateModal';
import { usePermissions } from '../../hooks/usePermissions';

const COETemplates: React.FC = () => {
    const { can, getAccessibleBusinessUnits } = usePermissions();
    const canManage = can('COE', Permission.Manage);

    const [templates, setTemplates] = useState<COETemplate[]>(mockCOETemplates);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<COETemplate | null>(null);

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);
    const accessibleBuIds = useMemo(() => new Set(accessibleBus.map(b => b.id)), [accessibleBus]);

    const filteredTemplates = useMemo(() => {
        return templates.filter(t => accessibleBuIds.has(t.businessUnitId));
    }, [templates, accessibleBuIds]);

    const handleOpenModal = (template: COETemplate | null) => {
        setSelectedTemplate(template);
        setIsModalOpen(true);
    };

    const handleSave = (template: COETemplate) => {
        if (template.id) {
            const updatedTemplates = templates.map(t => t.id === template.id ? template : t);
            setTemplates(updatedTemplates);
            // Update mock data
            const index = mockCOETemplates.findIndex(t => t.id === template.id);
            if (index > -1) mockCOETemplates[index] = template;
        } else {
            const newTemplate = { ...template, id: `COE-TPL-${Date.now()}` };
            setTemplates([...templates, newTemplate]);
            mockCOETemplates.push(newTemplate);
        }
        setIsModalOpen(false);
    };

    const handleDelete = (id: string) => {
        if (window.confirm("Are you sure you want to delete this template?")) {
            setTemplates(prev => prev.filter(t => t.id !== id));
             const index = mockCOETemplates.findIndex(t => t.id === id);
            if (index > -1) mockCOETemplates.splice(index, 1);
        }
    };

    const getBuName = (buId: string) => mockBusinessUnits.find(b => b.id === buId)?.name || 'Unknown BU';

    if (!canManage) {
        return <div className="p-6 text-center text-gray-500">You do not have permission to manage COE templates.</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">COE Templates</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Manage Certificate of Employment templates for each Business Unit.</p>
                </div>
                <Button onClick={() => handleOpenModal(null)}>Create Template</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTemplates.map(template => (
                    <Card key={template.id} className="flex flex-col h-full">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                                    {getBuName(template.businessUnitId)}
                                </span>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white mt-1">
                                    {template.isActive ? 'Active Template' : 'Inactive Template'}
                                </h3>
                            </div>
                            {template.logoUrl && <img src={template.logoUrl} alt="Logo" className="h-10 object-contain" />}
                        </div>
                        
                        <div className="flex-grow text-sm text-gray-600 dark:text-gray-400 space-y-2">
                            <p><strong>Signatory:</strong> {template.signatoryName} ({template.signatoryPosition})</p>
                            <p className="truncate"><strong>Address:</strong> {template.address}</p>
                        </div>

                        <div className="mt-6 pt-4 border-t dark:border-gray-700 flex justify-end space-x-2">
                            <Button variant="secondary" size="sm" onClick={() => handleOpenModal(template)}>Edit</Button>
                            <Button variant="danger" size="sm" onClick={() => handleDelete(template.id)}>Delete</Button>
                        </div>
                    </Card>
                ))}
                {filteredTemplates.length === 0 && (
                    <div className="col-span-full text-center py-12 text-gray-500 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                        <p>No COE templates found. Click "Create Template" to get started.</p>
                    </div>
                )}
            </div>

            <COETemplateModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                template={selectedTemplate}
            />
        </div>
    );
};

export default COETemplates;
