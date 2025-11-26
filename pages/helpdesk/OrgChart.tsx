
import React, { useState, useMemo, useEffect } from 'react';
import { mockUsers, mockBusinessUnits } from '../../services/mockData';
import Card from '../../components/ui/Card';
import OrgChartNode from '../../components/helpdesk/OrgChartNode';
import { User } from '../../types';
import EmployeeEditModal from '../../components/helpdesk/EmployeeEditModal';
import { logActivity } from '../../services/auditService';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';

const OrgChart: React.FC = () => {
    const { user: currentUser } = useAuth();
    const { getAccessibleBusinessUnits } = usePermissions();
    const [users, setUsers] = useState<User[]>(mockUsers);
    const [selectedBu, setSelectedBu] = useState<string>('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<User | null>(null);
    const [newEmployeeManagerId, setNewEmployeeManagerId] = useState<string | null>(null);

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);

    useEffect(() => {
        if (accessibleBus.length > 0 && !selectedBu) {
            setSelectedBu(accessibleBus[0].name);
        }
    }, [accessibleBus, selectedBu]);

    const { rootNodes } = useMemo(() => {
        if (!selectedBu) return { rootNodes: [] };
        const buUsers = users.filter(u => u.businessUnit === selectedBu);
        const buUserIds = new Set(buUsers.map(u => u.id));

        const roots = buUsers.filter(u => !u.managerId || !buUserIds.has(u.managerId));
        return { rootNodes: roots };

    }, [selectedBu, users]);

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

    const handleSaveEmployee = (employeeData: Partial<User>) => {
        if (employeeData.id) { // Editing existing user
            const updatedUsers = users.map(u => u.id === employeeData.id ? { ...u, ...employeeData } as User : u);
            setUsers(updatedUsers);
            const mockIndex = mockUsers.findIndex(u => u.id === employeeData.id);
            if (mockIndex > -1) mockUsers[mockIndex] = { ...mockUsers[mockIndex], ...employeeData } as User;
            logActivity(currentUser, 'UPDATE', 'User', employeeData.id, `Updated user details via org chart.`);
        }
        handleCloseModal();
    };


    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Organizational Chart</h1>
             <p className="text-gray-600 dark:text-gray-400 mt-2">
                🧭 <strong>Organizational Chart</strong><br />
                View your company’s structure at a glance — see departments, reporting lines, and contact details for quick coordination.
            </p>

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
                        {accessibleBus.map(bu => <option key={bu.id} value={bu.name}>{bu.name}</option>)}
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
                                    onAddReport={handleOpenAddModal}
                                    onEditEmployee={handleOpenEditModal}
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

            {isModalOpen && (
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
