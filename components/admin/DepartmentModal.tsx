import React, { useState, useEffect, useMemo } from 'react';
import { Department } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { mockBusinessUnits } from '../../services/mockData';
import { usePermissions } from '../../hooks/usePermissions';

interface DepartmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (dept: { id?: string, name: string, businessUnitId: string }) => void;
    department: Department | null;
    businessUnitId: string | null;
}

const DepartmentModal: React.FC<DepartmentModalProps> = ({ isOpen, onClose, onSave, department, businessUnitId }) => {
    const { getAccessibleBusinessUnits } = usePermissions();
    const [name, setName] = useState('');
    const [selectedBuId, setSelectedBuId] = useState('');

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);

    useEffect(() => {
        if (isOpen) {
            setName(department?.name || '');
            // If adding new with pre-selected BU (from parent filter), use that.
            // If editing, use existing BU.
            // Otherwise default to first accessible.
            setSelectedBuId(businessUnitId || department?.businessUnitId || (accessibleBus.length > 0 ? accessibleBus[0].id : ''));
        }
    }, [department, isOpen, businessUnitId, accessibleBus]);

    const handleSave = () => {
        if (name.trim() && selectedBuId) {
            onSave({ id: department?.id, name, businessUnitId: selectedBuId });
        } else {
            alert('Department name and Business Unit are required.');
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={department ? 'Edit Department' : 'Add New Department'}
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>{department ? 'Save Changes' : 'Add Department'}</Button>
                </div>
            }
        >
            <div className="space-y-4">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                    <select
                        value={selectedBuId}
                        onChange={(e) => setSelectedBuId(e.target.value)}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        disabled={!!businessUnitId} // If passed from parent context, maybe lock it? Or allow move? Let's allow move if not passed.
                    >
                        {accessibleBus.map(bu => (
                            <option key={bu.id} value={bu.id}>{bu.name}</option>
                        ))}
                    </select>
                </div>
                <Input
                    label="Department Name"
                    id="dept-name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    autoFocus
                />
            </div>
        </Modal>
    );
};

export default DepartmentModal;