import React, { useState, useEffect, useMemo } from 'react';
import { User } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';

interface EmployeeEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (employee: Partial<User>) => void;
    employee: User | null;
    managerId: string | null;
    allUsers: User[];
}

const EmployeeEditModal: React.FC<EmployeeEditModalProps> = ({ isOpen, onClose, onSave, employee, managerId, allUsers }) => {
    const [formData, setFormData] = useState<Partial<User>>({});
    const [selectedUnassignedUserId, setSelectedUnassignedUserId] = useState<string>('');
    
    const isEditing = !!employee;

    const unassignedUsers = useMemo(() => {
        return allUsers.filter(u => !u.managerId && u.status === 'Active');
    }, [allUsers]);

    useEffect(() => {
        if (isOpen) {
            if (isEditing) {
                setFormData(employee);
            } else {
                setFormData({ managerId: managerId || undefined });
                setSelectedUnassignedUserId(unassignedUsers.length > 0 ? unassignedUsers[0].id : '');
            }
        }
    }, [isOpen, employee, managerId, isEditing, unassignedUsers]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = () => {
        if (isEditing) {
            if (!formData.name || !formData.position) {
                alert('Name and Position are required.');
                return;
            }
            onSave(formData);
        } else {
            if (!selectedUnassignedUserId) {
                alert('Please select an employee to add.');
                return;
            }
            onSave({ id: selectedUnassignedUserId, managerId: managerId || undefined });
        }
    };

    const managerOptions = useMemo(() => {
        const subordinateIds = new Set<string>();
        const getSubordinates = (mgrId: string) => {
            allUsers.forEach(u => {
                if (u.managerId === mgrId) {
                    subordinateIds.add(u.id);
                    getSubordinates(u.id);
                }
            });
        };
        if (employee) {
            getSubordinates(employee.id);
        }
        
        return allUsers.filter(u => u.id !== employee?.id && !subordinateIds.has(u.id));
    }, [allUsers, employee]);

    const renderAddForm = () => {
        const reportsToUser = allUsers.find(u => u.id === managerId);
        return (
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Employee to Add</label>
                    <select
                        value={selectedUnassignedUserId}
                        onChange={e => setSelectedUnassignedUserId(e.target.value)}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        required
                    >
                        {unassignedUsers.length > 0 ? (
                            unassignedUsers.map(user => (
                                <option key={user.id} value={user.id}>{user.name} ({user.position})</option>
                            ))
                        ) : (
                             <option value="" disabled>No unassigned employees available</option>
                        )}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reports To</label>
                    <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{reportsToUser?.name || 'N/A'}</p>
                </div>
            </div>
        );
    };

    const renderEditForm = () => (
        <div className="space-y-4">
            <Input label="Full Name" name="name" value={formData.name || ''} onChange={handleChange} required autoFocus />
            <Input label="Position / Job Title" name="position" value={formData.position || ''} onChange={handleChange} required />
            <Input label="Email Address" name="email" type="email" value={formData.email || ''} onChange={handleChange} />
            
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reports To</label>
                <select
                    name="managerId"
                    value={formData.managerId || ''}
                    onChange={handleChange}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                    <option value="">-- No Manager (Root Employee) --</option>
                    {managerOptions.map(user => (
                        <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                </select>
            </div>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditing ? 'Edit Employee' : 'Add Employee to Chart'}
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>{isEditing ? 'Save Changes' : 'Add Employee'}</Button>
                </div>
            }
        >
            {isEditing ? renderEditForm() : renderAddForm()}
        </Modal>
    );
};

export default EmployeeEditModal;