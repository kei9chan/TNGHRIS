import React, { useState, useEffect } from 'react';
import { User, Role, AccessScope, BusinessUnit } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface UserRoleEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User;
    businessUnits: BusinessUnit[];
    roles: string[];
    onSave: (userId: string, roleIds: string[], primaryRole: string, accessScope: AccessScope) => Promise<void> | void;
}

const UserRoleEditModal: React.FC<UserRoleEditModalProps> = ({ isOpen, onClose, user, onSave, businessUnits, roles }) => {
    const [selectedRoles, setSelectedRoles] = useState<string[]>(user.roleIds || [user.role]);
    const [primaryRole, setPrimaryRole] = useState<string>(user.role);
    const [scopeType, setScopeType] = useState<AccessScope['type']>('HOME_ONLY');
    const [selectedBuIds, setSelectedBuIds] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            const assigned = user.roleIds?.length ? user.roleIds : [user.role];
            setSelectedRoles(assigned);
            setPrimaryRole(assigned.includes(user.role) ? user.role : assigned[0]);
            if (user.accessScope) {
                setScopeType(user.accessScope.type);
                setSelectedBuIds(user.accessScope.allowedBuIds || []);
            } else {
                setScopeType('HOME_ONLY');
                setSelectedBuIds([]);
            }
        }
    }, [isOpen, user]);

    const handleSave = async () => {
        if (selectedRoles.length === 0) {
            alert('Assign at least one role.');
            return;
        }
        const newScope: AccessScope = {
            type: scopeType,
            allowedBuIds: scopeType === 'SPECIFIC' ? selectedBuIds : undefined
        };
        await onSave(user.id, selectedRoles, primaryRole, newScope);
    };

    const handleRoleToggle = (role: string) => {
        setSelectedRoles(previous => {
            const next = previous.includes(role)
                ? previous.filter(item => item !== role)
                : [...previous, role];
            if (!next.includes(primaryRole)) setPrimaryRole(next[0] || '');
            return next;
        });
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
                    <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Assigned Roles
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md border border-gray-200 dark:border-gray-700 p-3 max-h-48 overflow-y-auto">
                        {roles.map((role) => (
                            <label key={role} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={selectedRoles.includes(role)}
                                    onChange={() => handleRoleToggle(role)}
                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                {role}
                            </label>
                        ))}
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Effective feature permissions combine all assigned roles. Workflow approvals remain explicitly controlled.
                    </p>
                    {selectedRoles.includes(Role.Admin) && (
                        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
                            High-risk access: Admin is the Super Admin role. Review sensitive-data and workflow permissions before saving.
                        </div>
                    )}
                    <label htmlFor="primary-role-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mt-4 mb-1">
                        Primary Role / Dashboard
                    </label>
                    <select
                        id="primary-role-select"
                        value={primaryRole}
                        onChange={(event) => setPrimaryRole(event.target.value)}
                        className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                    >
                        {selectedRoles.map(role => <option key={role} value={role}>{role}</option>)}
                    </select>
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
                                        {businessUnits.map(bu => (
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
