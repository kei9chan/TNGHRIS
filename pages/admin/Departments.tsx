
import React, { useState, useMemo } from 'react';
import { Department, BusinessUnit } from '../../types';
import { mockDepartments, mockBusinessUnits, mockUsers } from '../../services/mockData';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import DepartmentModal from '../../components/admin/DepartmentModal';
import { usePermissions } from '../../hooks/usePermissions';
import { logActivity } from '../../services/auditService';
import { useAuth } from '../../hooks/useAuth';

const Departments: React.FC = () => {
    const { user } = useAuth();
    const { getAccessibleBusinessUnits } = usePermissions();
    const [departments, setDepartments] = useState<Department[]>(mockDepartments);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingDept, setEditingDept] = useState<Department | null>(null);
    const [buIdForNewDept, setBuIdForNewDept] = useState<string | null>(null);

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);

    const departmentsByBu = useMemo(() => {
        const grouped: Record<string, Department[]> = {};
        accessibleBus.forEach(bu => {
            grouped[bu.id] = departments.filter(d => d.businessUnitId === bu.id).sort((a,b) => a.name.localeCompare(b.name));
        });
        return grouped;
    }, [departments, accessibleBus]);

    const isDeptInUse = (deptName: string) => {
        return mockUsers.some(user => user.department === deptName);
    };

    const handleOpenModal = (dept: Department | null, buId: string) => {
        setEditingDept(dept);
        setBuIdForNewDept(buId);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingDept(null);
        setBuIdForNewDept(null);
    };

    const handleSave = (deptToSave: { id?: string, name: string, businessUnitId: string }) => {
        if (deptToSave.id) { // Editing
            const updated = departments.map(d => d.id === deptToSave.id ? { ...d, name: deptToSave.name } : d);
            setDepartments(updated);
            const mockIndex = mockDepartments.findIndex(d => d.id === deptToSave.id);
            if(mockIndex > -1) mockDepartments[mockIndex].name = deptToSave.name;
            logActivity(user, 'UPDATE', 'Department', deptToSave.id, `Updated department name to ${deptToSave.name}`);
        } else { // Adding
            const newDept: Department = {
                id: `dept-${Date.now()}`,
                name: deptToSave.name,
                businessUnitId: deptToSave.businessUnitId,
            };
            setDepartments(prev => [...prev, newDept]);
            mockDepartments.push(newDept);
            logActivity(user, 'CREATE', 'Department', newDept.id, `Created department ${newDept.name}`);
        }
        handleCloseModal();
    };

    const handleDelete = (dept: Department) => {
        if (isDeptInUse(dept.name)) {
            alert(`Cannot delete "${dept.name}" as it is currently assigned to one or more users.`);
            return;
        }
        if (window.confirm(`Are you sure you want to delete the department "${dept.name}"?`)) {
            const updated = departments.filter(d => d.id !== dept.id);
            setDepartments(updated);
            const mockIndex = mockDepartments.findIndex(d => d.id === dept.id);
            if(mockIndex > -1) mockDepartments.splice(mockIndex, 1);
            logActivity(user, 'DELETE', 'Department', dept.id, `Deleted department ${dept.name}`);
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Manage Departments</h1>
            <p className="text-gray-600 dark:text-gray-400">Add, edit, or remove departments within each business unit.</p>

            <div className="space-y-4">
                {accessibleBus.length === 0 ? (
                     <Card>
                        <div className="text-center py-8 text-gray-500">
                            You do not have access to manage any Business Units.
                        </div>
                    </Card>
                ) : accessibleBus.map(bu => (
                    <Card key={bu.id}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">{bu.name}</h2>
                            <Button size="sm" onClick={() => handleOpenModal(null, bu.id)}>+ Add Department</Button>
                        </div>
                        {departmentsByBu[bu.id]?.length > 0 ? (
                            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                                {departmentsByBu[bu.id].map(dept => (
                                    <li key={dept.id} className="py-3 flex justify-between items-center">
                                        <span className="text-gray-900 dark:text-white">{dept.name}</span>
                                        <div className="flex space-x-2">
                                            <Button size="sm" variant="secondary" onClick={() => handleOpenModal(dept, bu.id)}>Edit</Button>
                                            <Button size="sm" variant="danger" onClick={() => handleDelete(dept)} disabled={isDeptInUse(dept.name)}>Delete</Button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400">No departments configured for this business unit.</p>
                        )}
                    </Card>
                ))}
            </div>

            <DepartmentModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                onSave={handleSave}
                department={editingDept}
                businessUnitId={buIdForNewDept}
            />
        </div>
    );
};

export default Departments;
