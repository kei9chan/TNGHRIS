import React, { useEffect, useMemo, useState } from 'react';
import { User, Role, BusinessUnit, Permission, AccessScope } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import Button from '../../components/ui/Button';
import UserRoleEditModal from '../../components/admin/UserRoleEditModal';
import Input from '../../components/ui/Input';
import { supabase } from '../../services/supabaseClient';
import { formatEmployeeName } from '../../services/formatEmployeeName';
import { usePermissionsContext } from '../../context/PermissionsContext';

const UserManagement: React.FC = () => {
    const { user: currentUser } = useAuth();
    const { can } = usePermissions();
    const { refreshPermissions } = usePermissionsContext();
    const canView = can('UserManagement', Permission.View);
    const canManage = can('UserManagement', Permission.Manage);
    const [users, setUsers] = useState<User[]>([]);
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [roles, setRoles] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [businessUnitFilter, setBusinessUnitFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

    const loadData = async () => {
        setLoading(true); setError(null);
        const [userResult, buResult, roleResult, assignmentResult, sensitiveResult, workflowResult] = await Promise.all([
            supabase.from('hris_users').select('id,email,first_name,last_name,full_name,role,status,business_unit,department,business_unit_id,department_id,data_access_scope,dashboard_type,permission_updated_at,permission_updated_by'),
            supabase.from('business_units').select('id,name').order('name'),
            supabase.from('roles').select('id').eq('is_active', true).order('display_name'),
            supabase.from('user_roles').select('user_id,role_id,is_primary,scope_type,allowed_business_unit_ids,dashboard_type,is_active').eq('is_active', true),
            supabase.from('role_sensitive_permissions').select('role_id,field_key,permissions'),
            supabase.from('role_workflow_permissions').select('role_id,workflow_key,actions'),
        ]);
        const loadError = userResult.error || buResult.error || roleResult.error || assignmentResult.error || sensitiveResult.error || workflowResult.error;
        if (loadError) { setError(loadError.message); setLoading(false); return; }
        const units = (buResult.data || []).map((row: any) => ({ id: row.id, name: row.name } as BusinessUnit));
        setBusinessUnits(units); setRoles((roleResult.data || []).map((row: any) => row.id));
        const unitMap = new Map(units.map(unit => [unit.id, unit.name]));
        const assignments = assignmentResult.data || [];
        const sensitiveRows = sensitiveResult.data || [];
        const workflowRows = workflowResult.data || [];
        setUsers((userResult.data || []).map((row: any) => {
            const assigned = assignments.filter((assignment: any) => assignment.user_id === row.id);
            const primary = assigned.find((assignment: any) => assignment.is_primary) || assigned[0];
            const roleIds = assigned.map((assignment: any) => assignment.role_id as Role);
            const sensitive: Record<string, Permission[]> = {};
            const workflows: Record<string, Permission[]> = {};
            sensitiveRows.filter((item: any) => roleIds.includes(item.role_id)).forEach((item: any) => { sensitive[item.field_key] = item.permissions; });
            workflowRows.filter((item: any) => roleIds.includes(item.role_id)).forEach((item: any) => { workflows[item.workflow_key] = item.actions; });
            return {
                id: row.id,
                name: formatEmployeeName(row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim()),
                email: row.email || '',
                role: (primary?.role_id || row.role) as Role,
                roles: roleIds,
                status: row.status,
                businessUnit: unitMap.get(row.business_unit_id) || row.business_unit || '',
                businessUnitId: row.business_unit_id,
                department: row.department || '',
                departmentId: row.department_id,
                accessScope: primary ? { type: primary.scope_type, allowedBuIds: primary.allowed_business_unit_ids } : row.data_access_scope,
                dashboardType: primary?.dashboard_type || row.dashboard_type,
                sensitivePermissions: sensitive,
                workflowPermissions: workflows,
                permissionUpdatedAt: row.permission_updated_at ? new Date(row.permission_updated_at) : undefined,
                permissionUpdatedBy: row.permission_updated_by,
                dateHired: new Date(), isPhotoEnrolled: false,
            } as User;
        }));
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const filteredUsers = useMemo(() => users.filter(user => {
        const needle = search.trim().toLowerCase();
        return (!needle || user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle))
            && (!businessUnitFilter || user.businessUnitId === businessUnitFilter);
    }), [users, search, businessUnitFilter]);

    const saveAccess = async (configuration: {
        userId: string; roleIds: string[]; primaryRole: string;
        accessScope: AccessScope; dashboardType: string;
    }) => {
        setSaving(true); setError(null);
        const { error: saveError } = await supabase.rpc('admin_set_user_roles', {
            p_target_user_id: configuration.userId,
            p_role_ids: configuration.roleIds,
            p_primary_role: configuration.primaryRole,
            p_scope_type: configuration.accessScope.type,
            p_allowed_business_unit_ids: configuration.accessScope.allowedBuIds || [],
            p_dashboard_type: configuration.dashboardType,
        });
        if (saveError) { setError(saveError.message); setSaving(false); return; }
        setSelectedUser(null);
        await loadData();
        if (configuration.userId === currentUser?.id) await refreshPermissions();
        setSaving(false);
    };

    if (!canView) return <div className="rounded-lg bg-white p-6 text-center">You do not have permission to view User Management.</div>;

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">User Management</h1>
                <p className="mt-1 text-sm text-gray-500">Server-resolved roles, scope, sensitive access, workflow authority, and audit metadata.</p>
            </header>
            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
            <div className="rounded-lg border border-gray-200 bg-white shadow">
                <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
                    <Input label="" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or email…" className="md:w-72" />
                    <select value={businessUnitFilter} onChange={event => setBusinessUnitFilter(event.target.value)} className="rounded-md border-gray-300 p-2">
                        <option value="">All business units</option>
                        {businessUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                    </select>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr>
                            <th className="px-4 py-3">User</th><th className="px-4 py-3">Roles</th><th className="px-4 py-3">Dashboard</th>
                            <th className="px-4 py-3">Data scope</th><th className="px-4 py-3">Sensitive / workflows</th><th className="px-4 py-3">Last update</th><th className="px-4 py-3"></th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredUsers.map(user => <tr key={user.id}>
                                <td className="px-4 py-3"><p className="font-medium">{user.name}</p><p className="text-xs text-gray-500">{user.email}<br />{user.businessUnit} · {user.department}</p></td>
                                <td className="px-4 py-3 text-sm">{(user.roles || [user.role]).map(role => <span key={role} className="mr-1 inline-flex rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700">{role === Role.GeneralManager ? 'General Manager' : role}</span>)}</td>
                                <td className="px-4 py-3 text-sm">{user.dashboardType || 'employee'}</td>
                                <td className="px-4 py-3 text-sm">{user.accessScope?.type || 'SELF'}{user.accessScope?.allowedBuIds?.length ? ` (${user.accessScope.allowedBuIds.length})` : ''}</td>
                                <td className="px-4 py-3 text-xs text-gray-600">{Object.keys(user.sensitivePermissions || {}).length} sensitive<br />{Object.keys(user.workflowPermissions || {}).length} workflows</td>
                                <td className="px-4 py-3 text-xs text-gray-500">{user.permissionUpdatedAt?.toLocaleString() || 'Legacy assignment'}</td>
                                <td className="px-4 py-3 text-right">{canManage && <Button size="sm" variant="secondary" disabled={saving || user.id === currentUser?.id} onClick={() => setSelectedUser(user)}>{user.id === currentUser?.id ? 'Self change blocked' : 'Edit access'}</Button>}</td>
                            </tr>)}
                            {!loading && filteredUsers.length === 0 && <tr><td colSpan={7} className="p-10 text-center text-gray-500">No users found.</td></tr>}
                        </tbody>
                    </table>
                    {loading && <div className="p-10 text-center text-gray-500">Loading effective access…</div>}
                </div>
            </div>
            {selectedUser && <UserRoleEditModal isOpen onClose={() => setSelectedUser(null)} user={selectedUser} businessUnits={businessUnits} roles={roles} onSave={saveAccess} />}
        </div>
    );
};

export default UserManagement;
