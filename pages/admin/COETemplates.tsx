// Phase A complete: mockDataCompat removed from COETemplates
import React, { useState, useMemo, useEffect } from 'react';
import { BusinessUnit, COETemplate, Permission } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import COETemplateModal from '../../components/admin/COETemplateModal';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

const COETemplates: React.FC = () => {
    const { can, getAccessibleBusinessUnits } = usePermissions();
    const { user } = useAuth();
    const canManage = can('COE', Permission.Manage);

    const [templates, setTemplates] = useState<COETemplate[]>([]);
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<COETemplate | null>(null);

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(businessUnits), [getAccessibleBusinessUnits, businessUnits]);
    const accessibleBuIds = useMemo(() => new Set(accessibleBus.map(b => b.id)), [accessibleBus]);

    useEffect(() => {
        let active = true;
        const loadTemplates = async () => {
            try {
                const { data, error } = await supabase
                    .from('coe_templates')
                    .select('*')
                    .order('updated_at', { ascending: false });
                if (error) throw error;
                const mapped = (data || []).map((row: any) => ({
                    id: row.id,
                    businessUnitId: row.business_unit_id,
                    logoUrl: row.logo_url || undefined,
                    address: row.address || '',
                    body: row.body,
                    signatoryName: row.signatory_name,
                    signatoryPosition: row.signatory_position,
                    isActive: !!row.is_active,
                })) as COETemplate[];
                if (active) setTemplates(mapped);
            } catch (err) {
                console.error('Failed to load COE templates', err);
                if (active) setTemplates([]);
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
        if (accessibleBuIds.size === 0) return templates;
        return templates.filter(t => accessibleBuIds.has(t.businessUnitId));
    }, [templates, accessibleBuIds]);

    const handleOpenModal = (template: COETemplate | null) => {
        setSelectedTemplate(template);
        setIsModalOpen(true);
    };

    const handleSave = async (template: COETemplate) => {
        try {
            if (template.id) {
                const { data, error } = await supabase
                    .from('coe_templates')
                    .update({
                        business_unit_id: template.businessUnitId,
                        logo_url: template.logoUrl || null,
                        address: template.address || null,
                        body: template.body,
                        signatory_name: template.signatoryName,
                        signatory_position: template.signatoryPosition,
                        is_active: template.isActive,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', template.id)
                    .select('*')
                    .maybeSingle();
                if (error) throw error;
                const updated = data
                    ? {
                          id: data.id,
                          businessUnitId: data.business_unit_id,
                          logoUrl: data.logo_url || undefined,
                          address: data.address || '',
                          body: data.body,
                          signatoryName: data.signatory_name,
                          signatoryPosition: data.signatory_position,
                          isActive: !!data.is_active,
                      }
                    : template;
                setTemplates(prev => prev.map(t => (t.id === template.id ? updated : t)));
            } else {
                const { data, error } = await supabase
                    .from('coe_templates')
                    .insert({
                        business_unit_id: template.businessUnitId,
                        logo_url: template.logoUrl || null,
                        address: template.address || null,
                        body: template.body,
                        signatory_name: template.signatoryName,
                        signatory_position: template.signatoryPosition,
                        is_active: template.isActive ?? true,
                        created_by: user?.id || null,
                    })
                    .select('*')
                    .maybeSingle();
                if (error) throw error;
                const created = data
                    ? {
                          id: data.id,
                          businessUnitId: data.business_unit_id,
                          logoUrl: data.logo_url || undefined,
                          address: data.address || '',
                          body: data.body,
                          signatoryName: data.signatory_name,
                          signatoryPosition: data.signatory_position,
                          isActive: !!data.is_active,
                      }
                    : template;
                setTemplates(prev => [created, ...prev]);
            }
            setIsModalOpen(false);
        } catch (err) {
            console.error('Failed to save COE template', err);
            alert('Failed to save COE template. Please try again.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this template?")) return;
        try {
            const { error } = await supabase.from('coe_templates').delete().eq('id', id);
            if (error) throw error;
            setTemplates(prev => prev.filter(t => t.id !== id));
        } catch (err) {
            console.error('Failed to delete COE template', err);
            alert('Failed to delete COE template. Please try again.');
        }
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
                businessUnits={accessibleBus}
            />
        </div>
    );
};

export default COETemplates;
