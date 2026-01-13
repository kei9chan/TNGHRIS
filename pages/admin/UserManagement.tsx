
import React, { useEffect, useMemo, useState } from 'react';
import { User, Role, AccessScope, BusinessUnit, Permission } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import Button from '../../components/ui/Button';
import UserRoleEditModal from '../../components/admin/UserRoleEditModal';
import Input from '../../components/ui/Input';
import { supabase } from '../../services/supabaseClient';

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


const UserManagement: React.FC = () => {
    const { user: currentUser } = useAuth();
    const { getAccessibleBusinessUnits, can } = usePermissions();
    const canView = can('UserManagement', Permission.View);
    const canManage = can('UserManagement', Permission.Manage);
    
    const [users, setUsers] = useState<User[]>([]);
    const [page] = useState(1);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [buFilter, setBuFilter] = useState('');
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [roles, setRoles] = useState<string[]>([]);
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
            ] = await Promise.all([
                supabase.from('hris_users').select('id, email, first_name, last_name, full_name, role, status, business_unit, department, business_unit_id, department_id, data_access_scope'),
                supabase.from('business_units').select('id, name'),
                supabase.from('departments').select('id, name'),
                supabase.from('roles').select('id'),
            ]);
            if (userErr || buErr || deptErr || roleErr) {
                setError(userErr?.message || buErr?.message || deptErr?.message || roleErr?.message || 'Failed to load users.');
                setLoading(false);
                return;
            }
            const buMap = new Map((buRows || []).map((b: any) => [b.id, b.name]));
            const deptMap = new Map((deptRows || []).map((d: any) => [d.id, d.name]));
            setBusinessUnits((buRows || []).map((b: any) => ({ id: b.id, name: b.name } as BusinessUnit)));
            setRoles((roleRows || []).map((r: any) => r.id as string));
            setUsers((userRows || []).map((u: any) => ({
                id: u.id,
                name: u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unknown',
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
        const accessibleBuNames = new Set(businessUnits.map(b => b.name));
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

    const handleSaveUserConfig = (userId: string, newRole: string, newScope: AccessScope) => {
        const targetUser = users.find(u => u.id === userId);
        if (!targetUser) return;

        // Persist to Supabase
        supabase.from('hris_users').update({ role: newRole, data_access_scope: newScope }).eq('id', userId).then(({ error: err }) => {
            if (err) {
                alert(err.message);
                return;
            }
            const updatedUsers = users.map(u => u.id === userId ? { ...u, role: newRole as Role, accessScope: newScope } : u);
            setUsers(updatedUsers);
            handleCloseEditModal();
        });
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
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.role}</td>
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
                                                // Only allow Admin/HR to change roles, or manager if implemented
                                                disabled={currentUser?.role === Role.Manager && user.role === Role.Manager}
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
