import React, { useEffect, useMemo, useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { Role, Permission, Resource, PermissionsMatrix, BusinessUnit } from '../../types';
import PermissionsMatrixTable from '../../components/admin/PermissionsMatrix';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../hooks/useAuth';
import BusinessUnitModal from '../../components/admin/BusinessUnitModal';
import { supabase } from '../../services/supabaseClient';


const roleDescriptions: Record<Role, string> = {
    [Role.Admin]: 'Full system access. Can manage all settings, users, and data.',
    [Role.HRManager]: 'Manages all HR functions, employees, payroll, and feedback systems.',
    [Role.HRStaff]: 'Assists with day-to-day HR tasks like employee data and incident reports.',
    [Role.BOD]: 'Board of Directors. High-level, view-only access to key reports.',
    [Role.GeneralManager]: 'Overall management view of key business and employee metrics.',
    [Role.OperationsDirector]: 'Oversees operational departments, manages teams, and approves requests.',
    [Role.BusinessUnitManager]: 'Manages a specific business unit, its employees, and related approvals.',
    [Role.Manager]: 'Manages a team of direct reports, handles approvals for OT and exceptions.',
    [Role.Employee]: 'Standard user. Can view their own data and submit requests.',
    [Role.FinanceStaff]: 'Manages financial aspects of payroll, including staging and final pay.',
    [Role.Auditor]: 'View-only access to sensitive logs and reports for auditing purposes.',
    [Role.Recruiter]: 'Manages recruitment processes, including requisitions, job posts, and candidates.',
};

const RolesPermissions: React.FC = () => {
    const { user } = useAuth();
    const { can } = usePermissions();
    const canView = can('RolesPermissions', Permission.View);
    const canManage = can('RolesPermissions', Permission.Manage);
    const [permissions, setPermissions] = useState<PermissionsMatrix>({});
    const [showSuccess, setShowSuccess] = useState(false);
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [isBuModalOpen, setIsBuModalOpen] = useState(false);
    const [selectedBu, setSelectedBu] = useState<BusinessUnit | null>(null);
    const [roles, setRoles] = useState<{ id: string; description?: string | null }[]>([]);
    const [resources, setResources] = useState<{ id: string; group_name?: string | null }[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [newRoleId, setNewRoleId] = useState('');
    const [newRoleDescription, setNewRoleDescription] = useState('');
    const [savingMatrix, setSavingMatrix] = useState<boolean>(false);
    const [editingRoleId, setEditingRoleId] = useState<string | null>(null);

    const allRoles = useMemo(() => roles.map(r => r.id), [roles]);
    const resourceGroups = useMemo(() => {
        const groups: Record<string, Resource[]> = {};
        resources.forEach(r => {
            const g = r.group_name || 'General';
            if (!groups[g]) groups[g] = [];
            groups[g].push(r.id as Resource);
        });
        return groups;
    }, [resources]);
    const allResources = useMemo(() => resources.map(r => r.id as Resource), [resources]);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        const [{ data: roleRows, error: roleErr }, { data: resourceRows, error: resErr }, { data: permRows, error: permErr }, { data: buRows, error: buErr }] =
            await Promise.all([
                supabase.from('roles').select('id, description').order('id'),
                supabase.from('resources').select('id, group_name').order('group_name'),
                supabase.from('role_permissions').select('role_id, resource_id, permissions'),
                supabase.from('business_units').select('id, name').order('name')
            ]);
        if (roleErr || resErr || permErr || buErr) {
            setError(roleErr?.message || resErr?.message || permErr?.message || buErr?.message || 'Failed to load data.');
            setLoading(false);
            return;
        }
        setRoles(roleRows || []);
        setResources(resourceRows || []);
        setBusinessUnits((buRows || []).map((b: any) => ({ id: b.id, name: b.name } as BusinessUnit)));

        const matrix: PermissionsMatrix = {};
        (permRows || []).forEach((row: any) => {
            if (!matrix[row.role_id]) matrix[row.role_id] = {};
            (matrix[row.role_id] as any)[row.resource_id] = row.permissions || [];
        });
        setPermissions(matrix);
        setLoading(false);
    };

    useEffect(() => {
        loadData();
    }, []);

    const isBuInUse = async (buId: string) => {
        const { count, error: cntErr } = await supabase
            .from('hris_users')
            .select('id', { count: 'exact', head: true })
            .eq('business_unit_id', buId);
        if (cntErr) return false;
        return (count || 0) > 0;
    };

    const handleOpenBuModal = (bu: BusinessUnit | null) => {
        setSelectedBu(bu);
        setIsBuModalOpen(true);
    };

    const handleCloseBuModal = () => {
        setIsBuModalOpen(false);
        setSelectedBu(null);
    };

    const handleSaveBu = async (buToSave: { id?: string; name: string }) => {
        if (!buToSave.name.trim()) return;
        if (buToSave.id) {
            const { error: err } = await supabase.from('business_units').update({ name: buToSave.name }).eq('id', buToSave.id);
            if (err) {
                alert(err.message);
                return;
            }
        } else {
            const { data, error: err } = await supabase.from('business_units').insert({ name: buToSave.name }).select('id, name').single();
            if (err) {
                alert(err.message);
                return;
            }
            if (data) {
                setBusinessUnits(prev => [...prev, { id: data.id, name: data.name } as BusinessUnit]);
            }
        }
        await loadData();
        handleCloseBuModal();
    };

    const handleDeleteBu = async (buToDelete: BusinessUnit) => {
        if (await isBuInUse(buToDelete.id)) {
            alert(`Cannot delete "${buToDelete.name}" as it is currently assigned to one or more users.`);
            return;
        }
        if (window.confirm(`Are you sure you want to delete the Business Unit "${buToDelete.name}"?`)) {
            const { error: err } = await supabase.from('business_units').delete().eq('id', buToDelete.id);
            if (err) {
                alert(err.message);
                return;
            }
            setBusinessUnits(prev => prev.filter(b => b.id !== buToDelete.id));
        }
    };

    const handleSubmitRole = async () => {
        const roleId = newRoleId.trim();
        if (!roleId) return;

        // Prevent duplicate ids
        if (!editingRoleId && roles.some(r => r.id.toLowerCase() === roleId.toLowerCase())) {
            alert('Role already exists.');
            return;
        }

        if (editingRoleId) {
            const isRename = editingRoleId !== roleId;
            // Prepare updated matrix with rename if needed
            const updatedMatrix: PermissionsMatrix = JSON.parse(JSON.stringify(permissions));
            if (isRename) {
                if (roles.some(r => r.id === roleId)) {
                    alert('Another role already uses that id.');
                    return;
                }
                (updatedMatrix as any)[roleId] = updatedMatrix[editingRoleId] || {};
                delete (updatedMatrix as any)[editingRoleId];
            }
            // Upsert roles table
            if (isRename) {
                const { error: insErr } = await supabase.from('roles').insert({ id: roleId, description: newRoleDescription || null });
                if (insErr) {
                    alert(insErr.message);
                    return;
                }
            } else {
                const { error: updErr } = await supabase.from('roles').update({ description: newRoleDescription || null }).eq('id', roleId);
                if (updErr) {
                    alert(updErr.message);
                    return;
                }
            }
            // Persist permissions with new id mapping
            await persistMatrix(updatedMatrix);
            // Remove old role if renamed
            if (isRename) {
                await supabase.from('roles').delete().eq('id', editingRoleId);
            }
            setPermissions(updatedMatrix);
            setRoles(prev => {
                const filtered = prev.filter(r => r.id !== editingRoleId);
                return [...filtered, { id: roleId, description: newRoleDescription || null }].sort((a, b) => a.id.localeCompare(b.id));
            });
        } else {
            const { data, error: err } = await supabase.from('roles').insert({ id: roleId, description: newRoleDescription || null }).select('id, description').single();
            if (err) {
                alert(err.message);
                return;
            }
            setRoles(prev => [...prev, { id: data.id, description: data.description }]);
        }

        setNewRoleId('');
        setNewRoleDescription('');
        setEditingRoleId(null);
    };

    const handleEditRole = (roleId: string, description?: string | null) => {
        setEditingRoleId(roleId);
        setNewRoleId(roleId);
        setNewRoleDescription(description || '');
    };


    const persistMatrix = async (matrix: PermissionsMatrix) => {
        setSavingMatrix(true);
        const rows: { role_id: string; resource_id: string; permissions: Permission[] }[] = [];
        allRoles.forEach(role => {
            allResources.forEach(resource => {
                const perms = (matrix[role]?.[resource] as Permission[]) || [];
                if (perms.length > 0) {
                    rows.push({ role_id: role, resource_id: resource, permissions: perms });
                }
            });
        });
        const { error: delErr } = await supabase.from('role_permissions').delete().neq('role_id', '');
        if (delErr) {
            setError(delErr.message);
            setSavingMatrix(false);
            return;
        }
        if (rows.length > 0) {
            const { error: insErr } = await supabase.from('role_permissions').insert(rows);
            if (insErr) {
                setError(insErr.message);
                setSavingMatrix(false);
                return;
            }
        }
        setSavingMatrix(false);
    };

    const handlePermissionChange = (role: Role, resource: Resource, permission: Permission, checked: boolean) => {
        setPermissions(prev => {
            const newMatrix: PermissionsMatrix = JSON.parse(JSON.stringify(prev));
            const rolePermissions = (newMatrix[role] as Partial<Record<Resource, Permission[]>>)?.[resource] || [];

            let updatedPermissions: Permission[];

            if (checked) {
                updatedPermissions = [...new Set([...rolePermissions, permission])];
                if (permission === Permission.Manage) {
                    updatedPermissions = Object.values(Permission);
                }
                if (permission !== Permission.View) {
                    updatedPermissions.push(Permission.View);
                    updatedPermissions = [...new Set(updatedPermissions)];
                }
            } else {
                updatedPermissions = rolePermissions.filter((p: Permission) => p !== permission);
                if (permission === Permission.Manage) {
                    updatedPermissions = [];
                }
                if (permission === Permission.View) {
                    updatedPermissions = updatedPermissions.filter(p => p === Permission.Manage);
                }
            }
            
            if (!newMatrix[role]) {
                newMatrix[role] = {};
            }
            (newMatrix[role] as Partial<Record<Resource, Permission[]>>)[resource] = updatedPermissions;
            // Persist immediately
            persistMatrix(newMatrix);
            return newMatrix;
        });
    };
    
    const handleSave = async () => {
        await persistMatrix(permissions);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
    };

    if (!canView) {
        return (
            <Card>
                <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                    You do not have permission to view Roles & Permissions.
                </div>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Roles & Permissions</h1>
                {canManage && (
                    <Button onClick={handleSave} isLoading={showSuccess || savingMatrix} disabled={savingMatrix}>
                        {savingMatrix ? 'Saving...' : showSuccess ? 'Saved Successfully!' : 'Save Changes'}
                    </Button>
                )}
            </div>

            {error && (
                <Card>
                    <div className="p-4 text-sm text-red-600 dark:text-red-400">{error}</div>
                </Card>
            )}
            {loading && (
                <Card>
                    <div className="p-4 text-sm text-gray-600 dark:text-gray-300">Loading roles and permissions...</div>
                </Card>
            )}
            
            <Card title="Roles Catalog">
                {canManage && (
                    <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-end">
                        <div className="flex-1">
                            <Input label="Role ID" value={newRoleId} onChange={(e) => setNewRoleId(e.target.value)} placeholder="e.g., Compliance Officer" disabled={!!editingRoleId} />
                        </div>
                        <div className="flex-1">
                            <Input label="Description" value={newRoleDescription} onChange={(e) => setNewRoleDescription(e.target.value)} placeholder="Short description" />
                        </div>
                        <Button onClick={handleSubmitRole} disabled={!newRoleId.trim()}>
                            {editingRoleId ? 'Save Role' : 'Add Role'}
                        </Button>
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {roles.map(role => (
                        <div key={role.id} className="p-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                            <h3 className="font-semibold text-gray-900 dark:text-white">{role.id}</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{role.description || roleDescriptions[role.id as Role] || ''}</p>
                            {canManage && (
                                <div className="mt-2">
                                    <Button size="sm" variant="secondary" onClick={() => handleEditRole(role.id, role.description || '')}>Edit</Button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </Card>

            <Card title="Business Units">
                <div className="flex justify-end mb-4">
                    {canManage && <Button onClick={() => handleOpenBuModal(null)}>Add New Business Unit</Button>}
                </div>
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {businessUnits.map(bu => (
                        <li key={bu.id} className="py-3 flex justify-between items-center">
                            <span className="text-gray-900 dark:text-white">{bu.name}</span>
                            <div className="flex space-x-2">
                                {canManage && (
                                    <>
                                        <Button size="sm" variant="secondary" onClick={() => handleOpenBuModal(bu)}>Edit</Button>
                                        <Button 
                                            size="sm" 
                                            variant="danger" 
                                            onClick={() => handleDeleteBu(bu)}
                                        >
                                            Delete
                                        </Button>
                                    </>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            </Card>

            <Card title="Permissions Matrix">
               <PermissionsMatrixTable 
                    roles={allRoles}
                    resourceGroups={resourceGroups}
                    permissionsMatrix={permissions}
                    onPermissionChange={canManage ? handlePermissionChange : undefined}
               />
            </Card>

            <BusinessUnitModal
                isOpen={isBuModalOpen}
                onClose={handleCloseBuModal}
                onSave={handleSaveBu}
                bu={selectedBu}
            />
        </div>
    );
};

export default RolesPermissions;
