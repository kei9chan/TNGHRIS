// Phase A complete: mockDataCompat removed from COETemplates
import React, { useState, useMemo, useEffect } from 'react';
import { BusinessUnit, COETemplate, Permission } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import COETemplateModal from '../../components/admin/COETemplateModal';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../services/supabaseClient';
import { archiveCoeTemplate, fetchAllCoeTemplates, saveCoeTemplate } from '../../services/coeService';

const COETemplates: React.FC = () => {
    const { can, getAccessibleBusinessUnits } = usePermissions();
    const canManage = can('COE', Permission.Manage);

    const [templates, setTemplates] = useState<COETemplate[]>([]);
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<COETemplate | null>(null);
    const [businessUnitFilter, setBusinessUnitFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'Draft' | 'Published' | 'Archived'>('all');
    const [pageError, setPageError] = useState<string | null>(null);

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(businessUnits), [getAccessibleBusinessUnits, businessUnits]);
    const accessibleBuIds = useMemo(() => new Set(accessibleBus.map(b => b.id)), [accessibleBus]);

    useEffect(() => {
        let active = true;
        const loadTemplates = async () => {
            try {
                const rows = await fetchAllCoeTemplates();
                if (active) setTemplates(rows);
            } catch (err) {
                console.error('Failed to load COE templates', err);
                if (active) setTemplates([]);
                if (active) setPageError((err as Error)?.message || 'COE templates could not be loaded.');
            }
        };
        loadTemplates();
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        let active = true;
        const loadBusinessUnits = async () => {
            try {
                const { data, error } = await supabase.from('business_units').select('*').order('name');
                if (error) throw error;
                const mapped = (data || []).map((row: any) => ({
                    id: row.id,
                    name: row.name,
                    color: row.color || undefined,
                    code: row.code || undefined,
                    address: row.address || undefined,
                })) as BusinessUnit[];
                if (active) setBusinessUnits(mapped);
            } catch (err) {
                console.error('Failed to load business units', err);
            }
        };
        loadBusinessUnits();
        return () => {
            active = false;
        };
    }, []);

    const filteredTemplates = useMemo(() => {
        return templates.filter(template => {
            if (accessibleBuIds.size > 0 && !accessibleBuIds.has(template.businessUnitId)) return false;
            if (businessUnitFilter !== 'all' && template.businessUnitId !== businessUnitFilter) return false;
            if (statusFilter !== 'all' && template.status !== statusFilter) return false;
            return true;
        });
    }, [templates, accessibleBuIds, businessUnitFilter, statusFilter]);

    const handleOpenModal = (template: COETemplate | null) => {
        setSelectedTemplate(template);
        setIsModalOpen(true);
    };

    const handleSave = async (template: COETemplate) => {
        try {
            const saved = await saveCoeTemplate(template);
            setTemplates(previous => {
                const exists = previous.some(item => item.id === saved.id);
                const next = exists
                    ? previous.map(item => item.id === saved.id ? saved : item)
                    : [saved, ...previous];
                return next.map(item => item.businessUnitId === saved.businessUnitId && item.id !== saved.id && saved.isActive
                    ? { ...item, isActive: false }
                    : item);
            });
            setPageError(null);
            setIsModalOpen(false);
        } catch (err) {
            console.error('Failed to save COE template', err);
            setPageError((err as Error)?.message || 'Failed to save COE template.');
        }
    };

    const handleArchive = async (template: COETemplate) => {
        if (!window.confirm(`Archive “${template.name || 'this template'}”? Historical COEs will remain unchanged.`)) return;
        try {
            const archived = await archiveCoeTemplate(template.id);
            setTemplates(previous => previous.map(item => item.id === archived.id ? archived : item));
            setPageError(null);
        } catch (err) {
            console.error('Failed to archive COE template', err);
            setPageError((err as Error)?.message || 'Failed to archive COE template.');
        }
    };

    const handleDuplicate = (template: COETemplate) => {
        handleOpenModal({
            ...template,
            id: '',
            name: `${template.name || 'COE Template'} Copy`,
            description: `Duplicated from ${template.name || 'an existing template'}.`,
            status: 'Draft',
            isActive: false,
            isPreset: false,
            presetKey: undefined,
            createdFromTemplateId: template.id,
            version: 1,
        });
    };

    const getBuName = (buId: string) => businessUnits.find(b => b.id === buId)?.name || 'Unknown BU';

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

            {pageError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200" role="alert">
                    <div className="flex justify-between gap-4"><span>{pageError}</span><button className="font-semibold underline" onClick={() => setPageError(null)}>Dismiss</button></div>
                </div>
            )}

            <Card>
                <div className="grid gap-4 p-4 sm:grid-cols-2">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                        <select value={businessUnitFilter} onChange={event => setBusinessUnitFilter(event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-8 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white">
                            <option value="all">All accessible business units</option>
                            {accessibleBus.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-8 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white">
                            <option value="all">All statuses</option>
                            <option value="Published">Published</option>
                            <option value="Draft">Draft</option>
                            <option value="Archived">Archived</option>
                        </select>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTemplates.map(template => (
                    <Card key={template.id} className="flex flex-col h-full">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                                    {getBuName(template.businessUnitId)}
                                </span>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white mt-1">
                                    {template.name || 'Certificate of Employment'}
                                </h3>
                            </div>
                            {template.logoUrl && <img src={template.logoUrl} alt="Logo" className="h-10 object-contain" />}
                        </div>
                        
                        <div className="flex-grow text-sm text-gray-600 dark:text-gray-400 space-y-2">
                            <div className="flex flex-wrap gap-2">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${template.isActive ? 'bg-green-100 text-green-800' : template.status === 'Archived' ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-800'}`}>
                                    {template.isActive ? 'Active' : template.status || 'Draft'}
                                </span>
                                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{template.styleKey?.replace(/-/g, ' ') || 'classic'}</span>
                                {template.isPreset && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">Preset</span>}
                            </div>
                            <p><strong>Signatory:</strong> {template.signatoryName} ({template.signatoryPosition})</p>
                            <p className="truncate"><strong>Address:</strong> {template.address}</p>
                            <p><strong>Version:</strong> {template.version || 1}</p>
                        </div>

                        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t pt-4 dark:border-gray-700">
                            <Button variant="secondary" size="sm" onClick={() => handleDuplicate(template)}>Duplicate</Button>
                            {template.status !== 'Archived' && <Button variant="secondary" size="sm" onClick={() => handleOpenModal(template)}>Edit / Preview</Button>}
                            {template.status !== 'Archived' && <Button variant="danger" size="sm" onClick={() => handleArchive(template)}>Archive</Button>}
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
                businessUnits={accessibleBus}
                brandTemplates={templates}
            />
        </div>
    );
};

export default COETemplates;
