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
import AccountLifecycleModal from '../../components/admin/AccountLifecycleModal';

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
    const [accountFilter, setAccountFilter] = useState<'active' | 'inactive' | 'duplicate' | 'all'>('active');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [lifecycleUser, setLifecycleUser] = useState<User | null>(null);
    const currentRoles = useMemo(() => new Set(currentUser?.roles?.length ? currentUser.roles : currentUser ? [currentUser.role] : []), [currentUser]);
    const canManageLifecycle = currentRoles.has(Role.Admin);

    const loadData = async () => {
        setLoading(true); setError(null);
        const [userResult, buResult, roleResult, assignmentResult, featureResult, sensitiveResult, workflowResult] = await Promise.all([
            supabase.rpc('get_accessible_hris_users'),
            supabase.from('business_units').select('id,name').order('name'),
            supabase.from('roles').select('id').eq('is_active', true).order('display_name'),
            supabase.from('user_roles').select('user_id,role_id,is_primary,scope_type,allowed_business_unit_ids,dashboard_type,is_active').eq('is_active', true),
            supabase.from('role_permissions').select('role_id,resource_id,permissions'),
            supabase.from('role_sensitive_permissions').select('role_id,field_key,permissions'),
            supabase.from('role_workflow_permissions').select('role_id,workflow_key,actions'),
        ]);
        const loadError = userResult.error || buResult.error || roleResult.error || assignmentResult.error || featureResult.error || sensitiveResult.error || workflowResult.error;
        if (loadError) { setError(loadError.message); setLoading(false); return; }
        const units = (buResult.data || []).map((row: any) => ({ id: row.id, name: row.name } as BusinessUnit));
        setBusinessUnits(units); setRoles((roleResult.data || []).map((row: any) => row.id));
        const unitMap = new Map(units.map(unit => [unit.id, unit.name]));
        const assignments = assignmentResult.data || [];
        const featureRows = featureResult.data || [];
        const sensitiveRows = sensitiveResult.data || [];
        const workflowRows = workflowResult.data || [];
        const actorNames = new Map((userResult.data || []).map((row: any) => [
            row.id,
            formatEmployeeName(row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim()) || row.email || row.id,
        ]));
        setUsers((userResult.data || []).map((row: any) => {
            const assigned = assignments.filter((assignment: any) => assignment.user_id === row.id);
            const primary = assigned.find((assignment: any) => assignment.is_primary) || assigned[0];
            const roleIds = assigned.map((assignment: any) => assignment.role_id as Role);
            const sensitive: Record<string, Permission[]> = {};
            const workflows: Record<string, Permission[]> = {};
            const features: Record<string, Permission[]> = {};
            featureRows.filter((item: any) => roleIds.includes(item.role_id)).forEach((item: any) => {
                features[item.resource_id] = [...new Set([...(features[item.resource_id] || []), ...(item.permissions || [])])];
            });
            sensitiveRows.filter((item: any) => roleIds.includes(item.role_id)).forEach((item: any) => { sensitive[item.field_key] = item.permissions; });
            workflowRows.filter((item: any) => roleIds.includes(item.role_id)).forEach((item: any) => { workflows[item.workflow_key] = item.actions; });
            return {
                id: row.id,
                employeeId: row.employee_id || undefined,
                name: formatEmployeeName(row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim()),
                email: row.email || '',
                role: (primary?.role_id || row.role) as Role,
                roles: roleIds,
                status: row.status,
                isDuplicate: Boolean(row.is_duplicate),
                accountLifecycleReason: row.account_lifecycle_reason || undefined,
                accountInactivatedAt: row.account_inactivated_at ? new Date(row.account_inactivated_at) : undefined,
                accountInactivatedBy: row.account_inactivated_by || undefined,
                accountReactivatedAt: row.account_reactivated_at ? new Date(row.account_reactivated_at) : undefined,
                accountReactivatedBy: row.account_reactivated_by || undefined,
                businessUnit: unitMap.get(row.business_unit_id) || row.business_unit || '',
                businessUnitId: row.business_unit_id,
                department: row.department || '',
                departmentId: row.department_id,
                accessScope: primary ? { type: primary.scope_type, allowedBuIds: primary.allowed_business_unit_ids } : row.data_access_scope,
                dashboardType: primary?.dashboard_type || row.dashboard_type,
                sensitivePermissions: sensitive,
                workflowPermissions: workflows,
                effectiveFeaturePermissions: features,
                permissionUpdatedAt: row.permission_updated_at ? new Date(row.permission_updated_at) : undefined,
                permissionUpdatedBy: row.permission_updated_by,
                permissionUpdatedByName: row.permission_updated_by ? actorNames.get(row.permission_updated_by) : undefined,
                dateHired: new Date(), isPhotoEnrolled: false,
            } as User;
        }));
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const filteredUsers = useMemo(() => users.filter(user => {
        const needle = search.trim().toLowerCase();
        const accountMatches = accountFilter === 'all'
            || (accountFilter === 'active' && user.status === 'Active' && !user.isDuplicate)
            || (accountFilter === 'inactive' && user.status === 'Inactive')
            || (accountFilter === 'duplicate' && user.isDuplicate);
        return (!needle || user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle))
            && (!businessUnitFilter || user.businessUnitId === businessUnitFilter)
            && accountMatches;
    }), [users, search, businessUnitFilter, accountFilter]);

    const scopeSummary = (user: User) => {
        const scope = user.accessScope?.type || 'SELF';
        if (scope === 'GLOBAL') return 'All business units';
        if (scope === 'HOME_ONLY') return user.businessUnit || 'Home business unit';
        if (scope !== 'SPECIFIC') return scope.replaceAll('_', ' ');
        const allowed = new Set(user.accessScope?.allowedBuIds || []);
        const names = businessUnits.filter(unit => allowed.has(unit.id)).map(unit => unit.name);
        return names.length ? names.join(', ') : 'No business units selected';
    };

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

    const saveLifecycle = async (reason: string, markDuplicate: boolean) => {
        if (!lifecycleUser) return;
        setSaving(true); setError(null);
        const action = lifecycleUser.status === 'Inactive' ? 'reactivate' : 'inactivate';
        const { error: lifecycleError } = await supabase.rpc('admin_set_account_lifecycle', {
            p_target_user_id: lifecycleUser.id,
            p_action: action,
            p_reason: reason,
            p_mark_duplicate: markDuplicate,
        });
        if (lifecycleError) {
            setError(lifecycleError.message);
            setSaving(false);
            return;
        }
        setLifecycleUser(null);
        await loadData();
        setSaving(false);
    };

    if (!canView) return <div className="rounded-lg bg-white p-6 text-center">You do not have permission to view User Management.</div>;

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">User Management</h1>
                <p className="mt-1 text-sm text-gray-500">Server-resolved roles, scope, sensitive access, workflow authority, and audit metadata.</p>
            </header>
            {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"><span><strong>User Management could not be loaded.</strong> {error}</span><Button size="sm" variant="secondary" onClick={loadData}>Retry</Button></div>}
            <div className="rounded-lg border border-gray-200 bg-white shadow dark:border-slate-700 dark:bg-slate-800">
                <div className="grid gap-3 border-b p-4 md:grid-cols-3">
                    <Input label="" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or email…" className="md:w-72" />
                    <select value={businessUnitFilter} onChange={event => setBusinessUnitFilter(event.target.value)} className="rounded-md border-gray-300 p-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white">
                        <option value="">All business units</option>
                        {businessUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                    </select>
                    <select aria-label="Account filter" value={accountFilter} onChange={event => setAccountFilter(event.target.value as typeof accountFilter)} className="rounded-md border-gray-300 p-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white">
                        <option value="active">Active accounts</option>
                        <option value="inactive">Inactive accounts</option>
                        <option value="duplicate">Duplicate accounts</option>
                        <option value="all">All accounts</option>
                    </select>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-slate-700 dark:text-slate-300"><tr>
                            <th className="px-4 py-3">User</th><th className="px-4 py-3">Account</th><th className="px-4 py-3">Roles</th><th className="px-4 py-3">Dashboard</th>
                            <th className="px-4 py-3">Data scope</th><th className="px-4 py-3">Sensitive / workflows</th><th className="px-4 py-3">Last update</th><th className="px-4 py-3"></th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-100 text-gray-900 dark:divide-slate-700 dark:text-white">
                            {filteredUsers.map(user => <tr key={user.id}>
                                <td className="px-4 py-3"><p className="font-medium">{user.name}</p><p className="text-xs text-gray-500">{user.email}<br />{user.businessUnit} · {user.department}</p></td>
                                <td className="px-4 py-3 text-sm"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${user.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>{user.status}</span>{user.isDuplicate && <span className="ml-1 inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Duplicate</span>}{user.accountLifecycleReason && <p className="mt-1 max-w-48 text-xs text-gray-500" title={user.accountLifecycleReason}>{user.accountLifecycleReason}</p>}</td>
                                <td className="px-4 py-3 text-sm">{(user.roles || [user.role]).map(role => <span key={role} className="mr-1 inline-flex rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700">{role === Role.GeneralManager ? 'General Manager' : role}</span>)}</td>
                                <td className="px-4 py-3 text-sm">{user.dashboardType || 'employee'}</td>
                                <td className="px-4 py-3 text-sm"><span className="font-medium">{user.accessScope?.type || 'SELF'}</span><br /><span className="text-xs text-gray-500">{scopeSummary(user)}</span></td>
                                <td className="px-4 py-3 text-xs text-gray-600">{Object.keys(user.effectiveFeaturePermissions || {}).length} feature resources<br />{Object.keys(user.sensitivePermissions || {}).length} sensitive · {Object.keys(user.workflowPermissions || {}).length} workflows</td>
                                <td className="px-4 py-3 text-xs text-gray-500">{user.permissionUpdatedAt?.toLocaleString() || 'Legacy assignment'}<br />{user.permissionUpdatedByName ? `by ${user.permissionUpdatedByName}` : user.permissionUpdatedBy ? `by ${user.permissionUpdatedBy}` : 'by system / legacy migration'}</td>
                                <td className="px-4 py-3 text-right"><div className="flex justify-end gap-2">{canManage && <Button size="sm" variant="secondary" disabled={saving || user.id === currentUser?.id} onClick={() => setSelectedUser(user)}>{user.id === currentUser?.id ? 'Self change blocked' : 'Edit access'}</Button>}{canManageLifecycle && user.id !== currentUser?.id && <Button size="sm" variant="secondary" disabled={saving} onClick={() => setLifecycleUser(user)}>{user.status === 'Inactive' ? 'Reactivate' : 'Inactivate'}</Button>}</div></td>
                            </tr>)}
                            {!loading && !error && filteredUsers.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-gray-500">No users found for the selected filters.</td></tr>}
                        </tbody>
                    </table>
                    {loading && <div className="p-10 text-center text-gray-500">Loading effective access…</div>}
                </div>
            </div>
            {selectedUser && <UserRoleEditModal isOpen onClose={() => setSelectedUser(null)} user={selectedUser} businessUnits={businessUnits} roles={roles} onSave={saveAccess} />}
            {lifecycleUser && <AccountLifecycleModal isOpen user={lifecycleUser} saving={saving} onClose={() => setLifecycleUser(null)} onConfirm={saveLifecycle} />}
        </div>
    );
};

export default UserManagement;
