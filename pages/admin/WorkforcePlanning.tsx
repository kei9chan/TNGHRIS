import React, { useState, useMemo, useEffect } from 'react';
import { ServiceArea, DemandTypeConfig, StaffingRequirement, DayTypeTier, User, Permission } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../services/supabaseClient';

const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;

const mapDbTierToUi = (tier: string): DayTypeTier => {
    const val = tier?.toLowerCase() || '';
    if (val.includes('super')) return DayTypeTier.SuperPeak;
    if (val.includes('peak')) return DayTypeTier.Peak;
    return DayTypeTier.OffPeak;
};

const mapUiTierToDb = (tier?: DayTypeTier) => {
    switch (tier) {
        case DayTypeTier.Peak:
            return 'Peak';
        case DayTypeTier.SuperPeak:
            return 'Super Peak';
        case DayTypeTier.OffPeak:
        default:
            return 'Off-Peak';
    }
};

const WorkforcePlanning: React.FC = () => {
    const { user } = useAuth();
    const { can } = usePermissions();
    const canView = can('WorkforcePlanning', Permission.View);
    const canManage = can('WorkforcePlanning', Permission.Manage);
    const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string }[]>([]);
    const accessibleBus = businessUnits; // Adjust if you want to reapply scope filtering later

    const [selectedBuId, setSelectedBuId] = useState<string>('');
    const [activeTab, setActiveTab] = useState<'areas' | 'demand' | 'matrix'>('areas');

    useEffect(() => {
        const loadBus = async () => {
            const { data, error } = await supabase.from('business_units').select('id, name').order('name');
            if (!error && data) {
                setBusinessUnits(data.map((d: any) => ({ id: d.id, name: d.name })));
            } else {
                setBusinessUnits([]);
            }
        };
        loadBus();
    }, []);

    useEffect(() => {
        if (accessibleBus.length > 0 && !selectedBuId) {
            setSelectedBuId(accessibleBus[0].id);
        }
    }, [accessibleBus, selectedBuId]);

    const [areas, setAreas] = useState<ServiceArea[]>([]);
    const [demands, setDemands] = useState<DemandTypeConfig[]>([]);
    const [requirements, setRequirements] = useState<StaffingRequirement[]>([]);

    // Modals
    const [isAreaModalOpen, setIsAreaModalOpen] = useState(false);
    const [isDemandModalOpen, setIsDemandModalOpen] = useState(false);
    const [areaForm, setAreaForm] = useState<Partial<ServiceArea>>({});
    const [demandForm, setDemandForm] = useState<Partial<DemandTypeConfig>>({});

    // Filtered Data
    const currentAreas = useMemo(() => areas.filter(a => a.businessUnitId === selectedBuId), [areas, selectedBuId]);
    const currentDemands = useMemo(() => demands.filter(d => d.businessUnitId === selectedBuId), [demands, selectedBuId]);
    
    // Handlers - Area
    const loadData = async (buId: string) => {
        if (!buId) return;
        // Load areas
        const { data: areaData, error: areaError } = await supabase
            .from('service_areas')
            .select('*')
            .eq('business_unit_id', buId)
            .order('name');
        setAreas(areaData?.map((a: any) => ({
            id: a.id,
            businessUnitId: a.business_unit_id,
            name: a.name,
            capacity: a.capacity,
            description: a.description,
        })) || []);

        // Load demand types
        const { data: demandData, error: demandError } = await supabase
            .from('demand_types')
            .select('*')
            .eq('business_unit_id', buId)
            .order('label');
        if (demandError) {
            console.error('Failed to load demand types', demandError);
        }
        setDemands(demandData?.map((d: any) => ({
            id: d.id,
            businessUnitId: d.business_unit_id,
            tier: mapDbTierToUi(d.tier),
            label: d.label,
            color: d.color,
            description: d.description,
        })) || []);

        // Load requirements for areas in this BU
        const areaIds = (areaData || []).map((a: any) => a.id);
        if (areaIds.length) {
            const { data: reqData } = await supabase
                .from('staffing_requirements')
                .select('*')
                .in('area_id', areaIds);
            setRequirements(reqData?.map((r: any) => ({
                id: r.id,
                areaId: r.area_id,
                role: r.role,
                dayTypeTier: mapDbTierToUi(r.day_type_tier),
                minCount: r.min_count,
            })) || []);
        } else {
            setRequirements([]);
        }
    };

    useEffect(() => {
        if (selectedBuId && canView) loadData(selectedBuId);
    }, [selectedBuId, canView]);

    if (!canView) {
        return (
            <div className="p-6">
                <Card>
                    <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                        You do not have permission to view Workforce Planning.
                    </div>
                </Card>
            </div>
        );
    }

    const handleSaveArea = async () => {
        if (!canManage) {
            alert('You do not have permission to modify areas.');
            return;
        }
        if (!areaForm.name) return;
        const payload = {
            business_unit_id: selectedBuId,
            name: areaForm.name,
            capacity: areaForm.capacity || null,
            description: areaForm.description || null,
        };
        if (areaForm.id) {
            const { error } = await supabase.from('service_areas').update(payload).eq('id', areaForm.id);
            if (error) {
                alert('Failed to save area');
                return;
            }
        } else {
            const { error } = await supabase.from('service_areas').insert(payload);
            if (error) {
                alert('Failed to add area');
                return;
            }
        }
        await loadData(selectedBuId);
        setIsAreaModalOpen(false);
    };

    const handleDeleteArea = async (id: string) => {
        if (!canManage) {
            alert('You do not have permission to delete areas.');
            return;
        }
        if(window.confirm('Delete this area? Requirements linked to it will also be removed.')) {
            const { error } = await supabase.from('service_areas').delete().eq('id', id);
            if (error) {
                alert('Failed to delete area');
                return;
            }
            await loadData(selectedBuId);
        }
    };

    // Handlers - Demand
    const handleSaveDemand = async () => {
         if (!canManage) {
            alert('You do not have permission to modify demand types.');
            return;
         }
         if (!demandForm.label || !demandForm.tier) return;
         const payload = {
             business_unit_id: selectedBuId,
             tier: mapUiTierToDb(demandForm.tier),
             label: demandForm.label,
             color: demandForm.color || 'bg-gray-100 text-gray-800',
             description: demandForm.description || null,
         };
         if (demandForm.id) {
             const { error } = await supabase.from('demand_types').update(payload).eq('id', demandForm.id);
             if (error) {
                 alert(`Failed to save demand type: ${error.message}`);
                 return;
             }
         } else {
             const { error } = await supabase.from('demand_types').insert(payload);
             if (error) {
                 alert(`Failed to add demand type: ${error.message}`);
                 return;
             }
         }
         await loadData(selectedBuId);
         setIsDemandModalOpen(false);
    };

    // Handlers - Matrix
    const handleRequirementChange = async (areaId: string, role: string, tier: DayTypeTier, countStr: string) => {
        if (!canManage) {
            alert('You do not have permission to modify requirements.');
            return;
        }
        const parsed = Number(countStr);
        const count = isNaN(parsed) ? 0 : parsed;
        // Optimistic local update
        setRequirements(prev => {
            const existingIndex = prev.findIndex(r => r.areaId === areaId && r.role === role && r.dayTypeTier === tier);
            if (existingIndex > -1) {
                if (count === 0) {
                    return prev.filter((_, idx) => idx !== existingIndex);
                }
                const updated = [...prev];
                updated[existingIndex] = { ...updated[existingIndex], minCount: count };
                return updated;
            } else {
                if (count === 0) return prev;
                return [...prev, {
                    id: `REQ-${Date.now()}-${Math.random()}`,
                    areaId,
                    role,
                    dayTypeTier: tier,
                    minCount: count
                }];
            }
        });

        // Persist change
        const dbTier = mapUiTierToDb(tier);
        if (count === 0) {
            const { error } = await supabase
                .from('staffing_requirements')
                .delete()
                .eq('area_id', areaId)
                .eq('role', role)
                .eq('day_type_tier', dbTier)
                .eq('business_unit_id', selectedBuId);
            if (error) {
                alert(`Failed to delete requirement: ${error.message}`);
                await loadData(selectedBuId);
            }
        } else {
            // Delete any existing row then insert fresh to avoid unique conflict issues
            const { error: delError } = await supabase
                .from('staffing_requirements')
                .delete()
                .eq('area_id', areaId)
                .eq('role', role)
                .eq('day_type_tier', dbTier)
                .eq('business_unit_id', selectedBuId);
            if (delError) {
                alert(`Failed to save requirement: ${delError.message}`);
                await loadData(selectedBuId);
                return;
            }
            const { error: insError } = await supabase
                .from('staffing_requirements')
                .insert({
                    area_id: areaId,
                    business_unit_id: selectedBuId,
                    role,
                    day_type_tier: dbTier,
                    min_count: count,
                });
            if (insError) {
                alert(`Failed to save requirement: ${insError.message}`);
                await loadData(selectedBuId);
            }
        }
        await loadData(selectedBuId);
    };

    const getRequirement = (areaId: string, role: string, tier: DayTypeTier) => {
        return requirements.find(r => r.areaId === areaId && r.role === role && r.dayTypeTier === tier)?.minCount || '';
    };
    
    // Helper to get roles used in an area
    const getRolesInArea = (areaId: string) => {
        const roles = new Set(requirements.filter(r => r.areaId === areaId).map(r => r.role));
        // Ensure we have at least one empty row for adding new roles if needed, 
        // though for MVP we might just list all available system roles or have an "Add Role" button.
        // Let's use a specific list of added roles per area state to allow adding new rows.
        return Array.from(roles);
    };

    // Local state for "rows" in the matrix table (Roles present in that area)
    const [areaRoles, setAreaRoles] = useState<Record<string, string[]>>({}); 

    // Initialize rows based on existing requirements
    useEffect(() => {
        const initial: Record<string, Set<string>> = {};
        currentAreas.forEach(a => initial[a.id] = new Set());
        requirements.filter(r => currentAreas.some(a => a.id === r.areaId)).forEach(r => {
            initial[r.areaId].add(r.role);
        });
        const final: Record<string, string[]> = {};
        Object.keys(initial).forEach(k => final[k] = Array.from(initial[k]));
        setAreaRoles(final);
    }, [requirements, currentAreas]);

    const addRoleToArea = async (areaId: string) => {
        if (!canManage) {
            alert('You do not have permission to add roles.');
            return;
        }
        const role = prompt("Enter Job Title / Role Name:");
        if (!role) return;
        setAreaRoles(prev => ({
            ...prev,
            [areaId]: [...(prev[areaId] || []), role]
        }));

        // Persist a baseline requirement row per existing demand tier (or default Off-Peak)
        const tiers = currentDemands.length ? currentDemands.map(d => d.tier) : [DayTypeTier.OffPeak];
        const rows = tiers.map(tier => ({
            area_id: areaId,
            role,
            day_type_tier: mapUiTierToDb(tier),
            min_count: 0,
        }));
        await supabase
            .from('staffing_requirements')
            .delete()
            .eq('area_id', areaId)
            .eq('role', role)
            .eq('business_unit_id', selectedBuId);

        const rowsWithBu = rows.map(row => ({
            ...row,
            business_unit_id: selectedBuId,
        }));
        const { error } = await supabase.from('staffing_requirements').insert(rowsWithBu);
        if (error) {
            alert('Failed to add role requirement. Please try again.');
            return;
        }
        await loadData(selectedBuId);
    };


    const tabClass = (tab: string) => `px-4 py-2 font-medium text-sm rounded-md transition-colors ${activeTab === tab ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Workforce Planning</h1>
                    <p className="text-gray-600 dark:text-gray-400">Configure service areas, demand types, and staffing requirements.</p>
                </div>
                <div>
                    <select 
                        value={selectedBuId} 
                        onChange={e => setSelectedBuId(e.target.value)}
                        className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                    >
                        {accessibleBus.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                    </select>
                </div>
            </div>

            <div className="flex space-x-2 border-b border-gray-200 dark:border-gray-700 pb-2">
                <button onClick={() => setActiveTab('areas')} className={tabClass('areas')}>Service Areas</button>
                <button onClick={() => setActiveTab('demand')} className={tabClass('demand')}>Demand Settings</button>
                <button onClick={() => setActiveTab('matrix')} className={tabClass('matrix')}>Staffing Matrix</button>
            </div>

            {activeTab === 'areas' && (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <Button onClick={() => { setAreaForm({}); setIsAreaModalOpen(true); }}>
                            <PlusIcon /> Add Area
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {currentAreas.map(area => (
                            <Card key={area.id} className="relative group">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-bold text-lg">{area.name}</h3>
                                        <p className="text-sm text-gray-500">Capacity: {area.capacity || 'N/A'}</p>
                                        <p className="text-sm text-gray-600 mt-2">{area.description}</p>
                                    </div>
                                    <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button size="sm" variant="secondary" onClick={() => { setAreaForm(area); setIsAreaModalOpen(true); }}>Edit</Button>
                                        <Button size="sm" variant="danger" onClick={() => handleDeleteArea(area.id)}><TrashIcon /></Button>
                                    </div>
                                </div>
                            </Card>
                        ))}
                         {currentAreas.length === 0 && (
                            <div className="col-span-full text-center py-10 text-gray-500 border-2 border-dashed rounded-lg border-gray-300 dark:border-gray-700">
                                No service areas defined for this Business Unit.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'demand' && (
                <div className="space-y-4">
                     <div className="flex justify-end">
                        <Button onClick={() => { setDemandForm({ color: 'bg-gray-100 text-gray-800', tier: DayTypeTier.OffPeak }); setIsDemandModalOpen(true); }}>
                            <PlusIcon /> Add Demand Type
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {currentDemands.map(demand => (
                            <Card key={demand.id}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${demand.color}`}>{demand.label}</span>
                                    <Button size="sm" variant="secondary" onClick={() => { setDemandForm(demand); setIsDemandModalOpen(true); }}>Edit</Button>
                                </div>
                                <p className="text-sm font-medium">Maps to: {demand.tier}</p>
                                <p className="text-sm text-gray-500">{demand.description}</p>
                            </Card>
                        ))}
                         {currentDemands.length === 0 && (
                            <div className="col-span-full text-center py-10 text-gray-500 border-2 border-dashed rounded-lg border-gray-300 dark:border-gray-700">
                                No demand types configured. Defaulting to standard rules.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'matrix' && (
                <div className="space-y-8">
                    {currentAreas.map(area => (
                        <Card key={area.id} title={area.name}>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-800">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-1/4">Role / Job Title</th>
                                            {currentDemands.map(d => (
                                                <th key={d.id} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                                                    <span className={`px-2 py-1 rounded-full ${d.color}`}>{d.label}</span>
                                                </th>
                                            ))}
                                            {currentDemands.length === 0 && (
                                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Default</th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {(areaRoles[area.id] || []).map(role => (
                                            <tr key={role}>
                                                <td className="px-4 py-3 font-medium text-sm">{role}</td>
                                                {currentDemands.map(d => (
                                                    <td key={d.id} className="px-4 py-3 text-center">
                                                        <input 
                                                            type="number" 
                                                            min="0"
                                                            className="w-16 p-1 text-center border rounded dark:bg-gray-700 dark:border-gray-600"
                                                            value={getRequirement(area.id, role, d.tier)}
                                                            onChange={e => handleRequirementChange(area.id, role, d.tier, e.target.value)}
                                                        />
                                                    </td>
                                                ))}
                                                {currentDemands.length === 0 && (
                                                    <td className="px-4 py-3 text-center text-sm text-gray-500 italic">
                                                        Configure demand types first
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                        {(!areaRoles[area.id] || areaRoles[area.id].length === 0) && (
                                             <tr>
                                                <td colSpan={currentDemands.length + 1} className="px-4 py-6 text-center text-sm text-gray-500">
                                                    No roles configured for this area yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-4">
                                <Button variant="secondary" size="sm" onClick={() => addRoleToArea(area.id)}>+ Add Role Requirement</Button>
                            </div>
                        </Card>
                    ))}
                    {currentAreas.length === 0 && (
                         <div className="text-center py-10 text-gray-500">
                            Please add Service Areas in the "Service Areas" tab first.
                        </div>
                    )}
                </div>
            )}

            {/* Area Modal */}
            <Modal isOpen={isAreaModalOpen} onClose={() => setIsAreaModalOpen(false)} title={areaForm.id ? "Edit Area" : "Add Service Area"} 
                footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setIsAreaModalOpen(false)}>Cancel</Button><Button onClick={handleSaveArea}>Save</Button></div>}>
                <div className="space-y-4">
                    <Input label="Area Name" value={areaForm.name || ''} onChange={e => setAreaForm({...areaForm, name: e.target.value})} placeholder="e.g. Lobby, Kitchen" />
                    <Input label="Capacity (Pax)" type="number" value={areaForm.capacity || ''} onChange={e => setAreaForm({...areaForm, capacity: parseInt(e.target.value)})} />
                    <Input label="Description" value={areaForm.description || ''} onChange={e => setAreaForm({...areaForm, description: e.target.value})} />
                </div>
            </Modal>

            {/* Demand Modal */}
            <Modal isOpen={isDemandModalOpen} onClose={() => setIsDemandModalOpen(false)} title={demandForm.id ? "Edit Demand Type" : "Add Demand Type"}
                footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setIsDemandModalOpen(false)}>Cancel</Button><Button onClick={handleSaveDemand}>Save</Button></div>}>
                <div className="space-y-4">
                    <Input label="Label" value={demandForm.label || ''} onChange={e => setDemandForm({...demandForm, label: e.target.value})} placeholder="e.g. Super Peak" />
                    <div>
                        <label className="block text-sm font-medium mb-1">Maps To System Tier</label>
                        <select value={demandForm.tier || DayTypeTier.OffPeak} onChange={e => setDemandForm({...demandForm, tier: e.target.value as DayTypeTier})} className="w-full p-2 border rounded dark:bg-gray-700">
                            {Object.values(DayTypeTier).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                         <label className="block text-sm font-medium mb-1">Color Style</label>
                         <select value={demandForm.color} onChange={e => setDemandForm({...demandForm, color: e.target.value})} className="w-full p-2 border rounded dark:bg-gray-700">
                            <option value="bg-blue-100 text-blue-800">Blue</option>
                            <option value="bg-green-100 text-green-800">Green</option>
                            <option value="bg-yellow-100 text-yellow-800">Yellow</option>
                            <option value="bg-red-100 text-red-800">Red</option>
                            <option value="bg-purple-100 text-purple-800">Purple</option>
                        </select>
                    </div>
                    <Input label="Description" value={demandForm.description || ''} onChange={e => setDemandForm({...demandForm, description: e.target.value})} />
                </div>
            </Modal>

        </div>
    );
};

export default WorkforcePlanning;
