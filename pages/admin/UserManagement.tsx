
import React, { useEffect, useMemo, useState } from 'react';
import { User, Role, AccessScope, BusinessUnit, Permission } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import Button from '../../components/ui/Button';
import UserRoleEditModal, { RoleOption } from '../../components/admin/UserRoleEditModal';
import Input from '../../components/ui/Input';
import { supabase } from '../../services/supabaseClient';
import { formatEmployeeName } from '../../services/formatEmployeeName';
import { dispatchRbacInvalidation } from '../../services/rbac';

const ChevronUpIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
);

const InformationCircleIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const EditIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" />
    </svg>
);

const ShieldCheckIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 0 0-1.032 0 11.209 11.209 0 0 1-7.877 3.08.75.75 0 0 0-.722.515A12.74 12.74 0 0 0 2.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 0 0 .374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 0 0-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08Zm3.094 8.016a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
    </svg>
);


const UserManagement: React.FC = () => {
    const { getAccessibleBusinessUnits, can } = usePermissions();
    const canView = can('UserManagement', Permission.View);
    const canManage = can('UserManagement', Permission.Manage);
    
    const [users, setUsers] = useState<User[]>([]);
    const [page] = useState(1);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [buFilter, setBuFilter] = useState('');
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [roles, setRoles] = useState<RoleOption[]>([]);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(businessUnits), [getAccessibleBusinessUnits, businessUnits]);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);
            const [
                { data: userRows, error: userErr },
                { data: buRows, error: buErr },
                { data: deptRows, error: deptErr },
                { data: roleRows, error: roleErr },
                { data: permissionRows, error: permissionErr },
            ] = await Promise.all([
                supabase.from('hris_users').select('id, email, first_name, last_name, full_name, role, status, business_unit, department, business_unit_id, department_id, data_access_scope'),
                supabase.from('business_units').select('id, name'),
                supabase.from('departments').select('id, name'),
                supabase.from('roles').select('id, dashboard_type'),
                supabase.from('role_permissions').select('role_id, resource_id, permissions'),
            ]);
            if (userErr || buErr || deptErr || roleErr || permissionErr) {
                setError(userErr?.message || buErr?.message || deptErr?.message || roleErr?.message || permissionErr?.message || 'Failed to load users.');
                setLoading(false);
                return;
            }
            const buMap = new Map((buRows || []).map((b: any) => [b.id, b.name]));
            const deptMap = new Map((deptRows || []).map((d: any) => [d.id, d.name]));
            setBusinessUnits((buRows || []).map((b: any) => ({ id: b.id, name: b.name } as BusinessUnit)));
            const permissionsByRole: Record<string, Record<string, Permission[]>> = {};
            (permissionRows || []).forEach((row: any) => {
                if (!permissionsByRole[row.role_id]) permissionsByRole[row.role_id] = {};
                permissionsByRole[row.role_id][row.resource_id] = row.permissions || [];
            });
            setRoles((roleRows || []).map((r: any) => ({
                id: r.id,
                dashboardType: r.dashboard_type || 'employee',
                permissions: permissionsByRole[r.id] || {},
            } as RoleOption)));
            setUsers((userRows || []).map((u: any) => ({
                id: u.id,
                name: formatEmployeeName(
                  u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unknown'
                ),
                email: u.email || '',
                role: (u.role as Role) || Role.Employee,
                status: u.status || '',
                businessUnit: buMap.get(u.business_unit_id) || u.business_unit || '',
                businessUnitId: u.business_unit_id || '',
                department: deptMap.get(u.department_id) || u.department || '',
                departmentId: u.department_id || '',
                accessScope: u.data_access_scope || { type: 'HOME_ONLY' },
            } as User)));
            setLoading(false);
        };
        loadData();
    }, []);

    // Filter users based on access scope and search term
    const filteredUsers = useMemo(() => {
        // Show all users by default; if a BU filter is chosen, filter by that BU.
        const accessibleBuNames = new Set(accessibleBus.map(b => b.name));
        const lowerSearch = searchTerm.toLowerCase();

        return users.filter(user => {
            // If for some reason BU lookup failed, fall back to showing all
            if (accessibleBuNames.size > 0 && !accessibleBuNames.has(user.businessUnit)) return false;

            // UI Filters
            const matchesSearch = !searchTerm || 
                user.name.toLowerCase().includes(lowerSearch) || 
                user.email.toLowerCase().includes(lowerSearch);
            
            const matchesBu = !buFilter || user.businessUnit === buFilter;

            return matchesSearch && matchesBu;
        });
    }, [users, accessibleBus, searchTerm, buFilter]);


    // State for the edit modal
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

    // Handlers for the new modal
    const handleOpenEditModal = (userToEdit: User) => {
        setSelectedUser(userToEdit);
        setIsEditModalOpen(true);
    };

    const handleCloseEditModal = () => {
        setSelectedUser(null);
        setIsEditModalOpen(false);
    };

    const handleSaveUserConfig = async (userId: string, newRole: string, newScope: AccessScope) => {
        const targetUser = users.find(u => u.id === userId);
        if (!targetUser) throw new Error('The selected user could not be found.');
        if (!roles.some(role => role.id === newRole)) throw new Error('The selected role no longer exists.');
        if (newScope.type === 'SPECIFIC' && (!newScope.allowedBuIds || newScope.allowedBuIds.length === 0)) {
            throw new Error('Specific access requires at least one business unit.');
        }

        // Guard: warn before demoting an Admin user
        const isTargetCurrentlyAdmin = targetUser.role === Role.Admin;
        const isNewRoleDowngrade = newRole !== Role.Admin;
        if (isTargetCurrentlyAdmin && isNewRoleDowngrade) {
            const confirmed = window.confirm(
                `⚠️ Superuser Demotion Warning\n\nYou are about to remove the Admin (Superuser) role from "${targetUser.name}".\n\nThis will revoke their unrestricted access to all system functions and database records. This action cannot be undone automatically.\n\nAre you sure you want to continue?`
            );
            if (!confirmed) throw new Error('Role change cancelled.');
        }

        setError(null);
        setSuccess(null);
        const { error: saveError } = await supabase.rpc('update_user_rbac', {
            p_target_user_id: userId,
            p_role_id: newRole,
            p_data_access_scope: newScope,
        });
        if (saveError) throw new Error(saveError.message);

        const { data: refreshed, error: refreshError } = await supabase
            .from('hris_users')
            .select('role, data_access_scope')
            .eq('id', userId)
            .single();
        if (refreshError) throw new Error(refreshError.message);
        setUsers(previous => previous.map(item => item.id === userId ? {
            ...item,
            role: refreshed.role,
            roleId: refreshed.role,
            dashboardType: roles.find(role => role.id === refreshed.role)?.dashboardType,
            accessScope: refreshed.data_access_scope,
        } : item));
        dispatchRbacInvalidation();
        setSuccess(`Access updated for ${targetUser.name}.`);
        handleCloseEditModal();
    };

    const getScopeLabel = (user: User) => {
        const scope = user.accessScope;
        if (!scope || scope.type === 'HOME_ONLY') return <span className="text-gray-500">Home Unit Only</span>;
        if (scope.type === 'GLOBAL') return <span className="text-indigo-600 font-medium">Global Access</span>;
        if (scope.type === 'SPECIFIC') return <span className="text-blue-600 font-medium">{scope.allowedBuIds?.length || 0} Specific Units</span>;
        return 'Unknown';
    };

    if (!canView) {
        return (
            <div className="p-6 bg-white dark:bg-slate-800 rounded shadow text-center text-gray-600 dark:text-gray-300">
                You do not have permission to view this page.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white">User Management</h1>
            </div>
            {error && (
                <div className="p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded">{error}</div>
            )}
            {success && (
                <div className="p-3 text-sm text-green-700 bg-green-50 rounded">{success}</div>
            )}
            {loading && (
                <div className="p-3 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-slate-900/30 rounded">Loading users...</div>
            )}

            <div className="bg-white dark:bg-slate-800 shadow-lg rounded-lg overflow-hidden">
                <div className="px-4 py-5 sm:px-6 border-b border-gray-200 dark:border-slate-700 flex flex-col md:flex-row gap-4 justify-between items-end">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">System Users</h2>
                    <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                         <Input 
                            label=""
                            id="search-users" 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                            placeholder="Search Name/Email..."
                            className="w-full md:w-64"
                        />
                        <select 
                            value={buFilter} 
                            onChange={e => setBuFilter(e.target.value)}
                            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                        >
                            <option value="">All Business Units</option>
                            {businessUnits.map(bu => <option key={bu.id} value={bu.name}>{bu.name}</option>)}
                        </select>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                        <thead className="bg-gray-50 dark:bg-slate-900/40">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Name</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Email</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Role</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Access Scope</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Department</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Business Unit</th>
                                <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.map((user, userIdx) => (
                                <tr key={user.id} className={userIdx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-gray-50 dark:bg-slate-800/50'}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{user.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.email}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        <div className="flex items-center gap-1.5">
                                            {user.role === Role.Admin && (
                                                <span title="Superuser — unrestricted access">
                                                    <ShieldCheckIcon className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                                                </span>
                                            )}
                                            <span className={user.role === Role.Admin ? 'font-semibold text-indigo-600 dark:text-indigo-400' : ''}>
                                                {user.role}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {getScopeLabel(user)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.department}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.businessUnit}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {canManage && (
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => handleOpenEditModal(user)}
                                                className="!bg-slate-700 hover:!bg-slate-600 !text-slate-300"
                                                title={`Edit role and permissions for ${user.name}`}
                                            >
                                                <EditIcon />
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                             {filteredUsers.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-10 text-center text-gray-500 dark:text-gray-400">
                                        No users found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                 <div className="px-4 py-3 flex items-center justify-end border-t border-gray-200 dark:border-slate-700">
                    <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                        <InformationCircleIcon />
                        <span>{page}</span>
                        <ChevronUpIcon />
                    </div>
                </div>
            </div>
            {selectedUser && (
                <UserRoleEditModal
                   isOpen={isEditModalOpen}
                   onClose={handleCloseEditModal}
                   user={selectedUser}
                   businessUnits={businessUnits}
                   roles={roles}
                   onSave={handleSaveUserConfig}
               />
           )}
        </div>
    );
};

export default UserManagement;
