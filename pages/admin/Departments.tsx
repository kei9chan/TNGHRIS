
import React, { useState, useMemo, useEffect } from 'react';
import { Department, BusinessUnit, Permission } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import DepartmentModal from '../../components/admin/DepartmentModal';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabaseClient';

const Departments: React.FC = () => {
    const { user } = useAuth();
    const { getAccessibleBusinessUnits, can } = usePermissions();
    const canView = can('Departments', Permission.View);
    const canManage = can('Departments', Permission.Manage);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingDept, setEditingDept] = useState<Department | null>(null);
    const [buIdForNewDept, setBuIdForNewDept] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);

    // Show all business units; do not scope to current user's accessible units
    const accessibleBus = useMemo(() => businessUnits, [businessUnits]);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);
            const [{ data: buRows, error: buErr }, { data: deptRows, error: deptErr }] = await Promise.all([
                supabase.from('business_units').select('id, name'),
                supabase.from('departments').select('id, name, business_unit_id'),
            ]);
            if (buErr || deptErr) {
                setError(buErr?.message || deptErr?.message || 'Failed to load departments.');
                setLoading(false);
                return;
            }
            setBusinessUnits((buRows || []).map((b: any) => ({ id: b.id, name: b.name } as BusinessUnit)));
            setDepartments((deptRows || []).map((d: any) => ({
                id: d.id,
                name: d.name,
                businessUnitId: d.business_unit_id,
            } as Department)));
            setLoading(false);
        };
        loadData();
    }, []);

    const departmentsByBu = useMemo(() => {
        const grouped: Record<string, Department[]> = {};
        businessUnits.forEach(bu => {
            grouped[bu.id] = departments.filter(d => d.businessUnitId === bu.id).sort((a,b) => a.name.localeCompare(b.name));
        });
        return grouped;
    }, [departments, businessUnits]);

    const isDeptInUse = async (deptId: string) => {
        const { count, error: err } = await supabase.from('hris_users').select('id', { count: 'exact', head: true }).eq('department_id', deptId);
        if (err) return false;
        return (count || 0) > 0;
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

    const handleSave = async (deptToSave: { id?: string, name: string, businessUnitId: string }) => {
        if (!deptToSave.name.trim()) return;
        setError(null);
        if (deptToSave.id) {
            const { error: err } = await supabase.from('departments').update({ name: deptToSave.name }).eq('id', deptToSave.id);
            if (err) {
                setError(err.message);
                return;
            }
            setDepartments(prev => prev.map(d => d.id === deptToSave.id ? { ...d, name: deptToSave.name } : d));
        } else {
            const { data, error: err } = await supabase.from('departments').insert({
                name: deptToSave.name,
                business_unit_id: deptToSave.businessUnitId,
            }).select('id, name, business_unit_id').single();
            if (err) {
                setError(err.message);
                return;
            }
            if (data) {
                setDepartments(prev => [...prev, { id: data.id, name: data.name, businessUnitId: data.business_unit_id }]);
            }
        }
        handleCloseModal();
    };

    const handleDelete = async (dept: Department) => {
        if (await isDeptInUse(dept.id)) {
            alert(`Cannot delete "${dept.name}" as it is currently assigned to one or more users.`);
            return;
        }
        if (window.confirm(`Are you sure you want to delete the department "${dept.name}"?`)) {
            const { error: err } = await supabase.from('departments').delete().eq('id', dept.id);
            if (err) {
                setError(err.message);
                return;
            }
            setDepartments(prev => prev.filter(d => d.id !== dept.id));
        }
    };

    return (
        canView ? (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Manage Departments</h1>
            <p className="text-gray-600 dark:text-gray-400">Add, edit, or remove departments within each business unit.</p>
            {error && (
                <Card>
                    <div className="p-4 text-sm text-red-600 dark:text-red-400">{error}</div>
                </Card>
            )}
            {loading && (
                <Card>
                    <div className="p-4 text-sm text-gray-600 dark:text-gray-300">Loading departments...</div>
                </Card>
            )}

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
                            {canManage && <Button size="sm" onClick={() => handleOpenModal(null, bu.id)}>+ Add Department</Button>}
                        </div>
                        {departmentsByBu[bu.id]?.length > 0 ? (
                            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                                {departmentsByBu[bu.id].map(dept => (
                                    <li key={dept.id} className="py-3 flex justify-between items-center">
                                        <span className="text-gray-900 dark:text-white">{dept.name}</span>
                                        {canManage && (
                                            <div className="flex space-x-2">
                                                <Button size="sm" variant="secondary" onClick={() => handleOpenModal(dept, bu.id)}>Edit</Button>
                                                <Button size="sm" variant="danger" onClick={() => handleDelete(dept)}>Delete</Button>
                                            </div>
                                        )}
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
                businessUnits={businessUnits}
            />
        </div>
        ) : (
            <div className="p-6 bg-white dark:bg-slate-800 rounded shadow text-center text-gray-600 dark:text-gray-300">
                You do not have permission to view this page.
            </div>
        )
    );
};

export default Departments;
