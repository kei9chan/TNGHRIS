
import React, { useState, useMemo, useEffect } from 'react';
import Card from '../../components/ui/Card';
import OrgChartNode from '../../components/helpdesk/OrgChartNode';
import { User, BusinessUnit, Role, Permission } from '../../types';
import EmployeeEditModal from '../../components/helpdesk/EmployeeEditModal';
import { logActivity } from '../../services/auditService';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../services/supabaseClient';

const OrgChart: React.FC = () => {
    const { user: currentUser } = useAuth();
    const { getAccessibleBusinessUnits, can } = usePermissions();
    const canView = can('OrgChart', Permission.View);
    const canManage = can('OrgChart', Permission.Manage)
        && !!currentUser
        && [Role.Admin, Role.HRManager, Role.HRStaff].includes(currentUser.role);
    const [users, setUsers] = useState<User[]>([]);
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [selectedBu, setSelectedBu] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<User | null>(null);
    const [newEmployeeManagerId, setNewEmployeeManagerId] = useState<string | null>(null);

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(businessUnits), [getAccessibleBusinessUnits, businessUnits]);

    const loadData = async () => {
        setError(null);
        const [{ data: buData, error: buErr }, { data: userData, error: userErr }] = await Promise.all([
            supabase.from('business_units').select('id, name, color, code').order('name'),
            supabase.from('hris_users').select('id, full_name, email, role, status, business_unit, business_unit_id, department, department_id, position, date_hired, birth_date'),
        ]);
        if (buErr || userErr) {
            setError(buErr?.message || userErr?.message || 'Failed to load org chart data.');
            setBusinessUnits([]);
            setUsers([]);
            return;
        }
        setBusinessUnits((buData || []).map((b: any) => ({
            id: b.id,
            name: b.name,
            color: b.color,
            code: b.code,
        })));

        setUsers((userData || []).map((u: any) => ({
            id: u.id,
            name: u.full_name || 'Unknown',
            email: u.email || '',
            role: (u.role as Role) || Role.Employee,
            department: u.department || '',
            businessUnit: u.business_unit || '',
            departmentId: u.department_id || undefined,
            businessUnitId: u.business_unit_id || undefined,
            status: (u.status as any) || 'Active',
            employmentStatus: undefined,
            isPhotoEnrolled: false,
            dateHired: u.date_hired ? new Date(u.date_hired) : new Date(),
            birthDate: u.birth_date ? new Date(u.birth_date) : undefined,
            position: u.position || '',
            managerId: undefined, // manager column not present in selection
        })));
    };

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        // Keep default unset; if you want auto-select, uncomment next line
        // if (accessibleBus.length > 0 && !selectedBu) setSelectedBu(accessibleBus[0].id);
    }, [accessibleBus, selectedBu]);

    const { rootNodes } = useMemo(() => {
        const buById = new Map(businessUnits.map(b => [b.id, b.name]));
        const filtered = users.filter(u => {
            if (!selectedBu) return true; // show all users across BUs
            return u.businessUnitId === selectedBu || u.businessUnit === buById.get(selectedBu);
        });

        const filteredIds = new Set(filtered.map(u => u.id));
        const roots = filtered.filter(u => !u.managerId || !filteredIds.has(u.managerId));
        return { rootNodes: roots };

    }, [selectedBu, users, businessUnits]);

    const handleOpenAddModal = (managerId: string) => {
        setNewEmployeeManagerId(managerId);
        setEditingEmployee(null);
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (employee: User) => {
        setEditingEmployee(employee);
        setNewEmployeeManagerId(null);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingEmployee(null);
        setNewEmployeeManagerId(null);
    };

    const handleSaveEmployee = async (employeeData: Partial<User>) => {
        if (!employeeData.id) return;
        const payload: any = {};
        if (employeeData.name) payload.full_name = employeeData.name;
        if (employeeData.position) payload.position = employeeData.position;
        if (employeeData.email) payload.email = employeeData.email;

        const { error: err } = await supabase.from('hris_users').update(payload).eq('id', employeeData.id);
        if (err) {
            setError(err.message);
        } else {
            logActivity(currentUser, 'UPDATE', 'User', employeeData.id, `Updated user details via org chart.`);
            await loadData();
            handleCloseModal();
        }
    };


    if (!canView) {
        return (
            <div className="p-6">
                <Card>
                    <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                        You do not have permission to view the Organizational Chart.
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Organizational Chart</h1>
             <p className="text-gray-600 dark:text-gray-400 mt-2">
                🧭 <strong>Organizational Chart</strong><br />
                View your company’s structure at a glance — see departments, reporting lines, and contact details for quick coordination.
            </p>
            {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}

            <Card>
                <div className="p-4">
                    <label htmlFor="bu-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Filter by Business Unit
                    </label>
                    <select
                        id="bu-filter"
                        value={selectedBu}
                        onChange={e => setSelectedBu(e.target.value)}
                        className="mt-1 block w-full max-w-xs pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                        <option value="">All Business Units</option>
                        {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                    </select>
                </div>
            </Card>

            <Card>
                <div className="overflow-x-auto p-4">
                    <div className="org-chart">
                        <ul>
                            {rootNodes.map(employee => (
                                <OrgChartNode 
                                    key={employee.id} 
                                    employee={employee} 
                                    allEmployees={users}
                                    onAddReport={canManage ? handleOpenAddModal : undefined}
                                    onEditEmployee={canManage ? handleOpenEditModal : undefined}
                                />
                            ))}
                        </ul>
                    </div>
                     {rootNodes.length === 0 && (
                        <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                            <p>No employees found for this business unit.</p>
                        </div>
                    )}
                </div>
            </Card>

            {isModalOpen && canManage && (
                <EmployeeEditModal
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                    onSave={handleSaveEmployee}
                    employee={editingEmployee}
                    managerId={newEmployeeManagerId}
                    allUsers={users}
                />
            )}
        </div>
    );
};

export default OrgChart;
