import React, { useState, useEffect } from 'react';
import { User, Role, AccessScope } from '../../types';
import { mockBusinessUnits } from '../../services/mockData';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface UserRoleEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User;
    onSave: (userId: string, newRole: Role, accessScope: AccessScope) => void;
}

const UserRoleEditModal: React.FC<UserRoleEditModalProps> = ({ isOpen, onClose, user, onSave }) => {
    const [newRole, setNewRole] = useState<Role>(user.role);
    const [scopeType, setScopeType] = useState<AccessScope['type']>('HOME_ONLY');
    const [selectedBuIds, setSelectedBuIds] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            setNewRole(user.role);
            if (user.accessScope) {
                setScopeType(user.accessScope.type);
                setSelectedBuIds(user.accessScope.allowedBuIds || []);
            } else {
                setScopeType('HOME_ONLY');
                setSelectedBuIds([]);
            }
        }
    }, [isOpen, user]);

    const handleSave = () => {
        const newScope: AccessScope = {
            type: scopeType,
            allowedBuIds: scopeType === 'SPECIFIC' ? selectedBuIds : undefined
        };
        onSave(user.id, newRole, newScope);
    };

    const handleBuToggle = (buId: string) => {
        setSelectedBuIds(prev => 
            prev.includes(buId) ? prev.filter(id => id !== buId) : [...prev, buId]
        );
    };

    const footer = (
        <div className="flex justify-end w-full space-x-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>Save Changes</Button>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Edit Permissions for ${user.name}`}
            footer={footer}
        >
            <div className="space-y-6">
                {/* Role Section */}
                <div>
                    <label htmlFor="role-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        System Role
                    </label>
                    <select
                        id="role-select"
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value as Role)}
                        className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                    >
                        {Object.values(Role).map((role) => (
                            <option key={role} value={role}>
                                {role}
                            </option>
                        ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Defines feature access and functional capabilities.
                    </p>
                </div>

                <hr className="border-gray-200 dark:border-gray-700" />

                {/* Access Scope Section */}
                <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Data Access Scope</h3>
                    <div className="space-y-3">
                        <div className="flex items-start">
                            <div className="flex items-center h-5">
                                <input
                                    id="scope-home"
                                    name="scope"
                                    type="radio"
                                    checked={scopeType === 'HOME_ONLY'}
                                    onChange={() => setScopeType('HOME_ONLY')}
                                    className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 dark:border-gray-600 dark:bg-slate-700"
                                />
                            </div>
                            <div className="ml-3 text-sm">
                                <label htmlFor="scope-home" className="font-medium text-gray-700 dark:text-gray-300">
                                    Default (Home Unit Only)
                                </label>
                                <p className="text-gray-500 dark:text-gray-400">
                                    User can only view and manage data for their assigned Business Unit ({user.businessUnit}).
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start">
                            <div className="flex items-center h-5">
                                <input
                                    id="scope-global"
                                    name="scope"
                                    type="radio"
                                    checked={scopeType === 'GLOBAL'}
                                    onChange={() => setScopeType('GLOBAL')}
                                    className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 dark:border-gray-600 dark:bg-slate-700"
                                />
                            </div>
                            <div className="ml-3 text-sm">
                                <label htmlFor="scope-global" className="font-medium text-gray-700 dark:text-gray-300">
                                    Global Access
                                </label>
                                <p className="text-gray-500 dark:text-gray-400">
                                    User can view and manage data across ALL Business Units.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start">
                            <div className="flex items-center h-5">
                                <input
                                    id="scope-specific"
                                    name="scope"
                                    type="radio"
                                    checked={scopeType === 'SPECIFIC'}
                                    onChange={() => setScopeType('SPECIFIC')}
                                    className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 dark:border-gray-600 dark:bg-slate-700"
                                />
                            </div>
                            <div className="ml-3 text-sm w-full">
                                <label htmlFor="scope-specific" className="font-medium text-gray-700 dark:text-gray-300">
                                    Specific Units
                                </label>
                                <p className="text-gray-500 dark:text-gray-400 mb-2">
                                    Select specific Business Units this user can manage.
                                </p>
                                
                                {scopeType === 'SPECIFIC' && (
                                    <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-slate-800 p-2 max-h-40 overflow-y-auto">
                                        {mockBusinessUnits.map(bu => (
                                            <div key={bu.id} className="flex items-center py-1">
                                                <input
                                                    id={`bu-${bu.id}`}
                                                    type="checkbox"
                                                    checked={selectedBuIds.includes(bu.id)}
                                                    onChange={() => handleBuToggle(bu.id)}
                                                    className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 dark:bg-slate-700 dark:border-gray-600"
                                                />
                                                <label htmlFor={`bu-${bu.id}`} className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                                                    {bu.name}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default UserRoleEditModal;