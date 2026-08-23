import React, { useEffect, useState } from 'react';
import { User, Role, AccessScope, BusinessUnit } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    user: User;
    businessUnits: BusinessUnit[];
    roles: string[];
    onSave: (configuration: {
        userId: string;
        roleIds: string[];
        primaryRole: string;
        accessScope: AccessScope;
        dashboardType: string;
    }) => void;
}

const UserRoleEditModal: React.FC<Props> = ({ isOpen, onClose, user, onSave, businessUnits, roles }) => {
    const [primaryRole, setPrimaryRole] = useState<string>(user.role);
    const [additionalRole, setAdditionalRole] = useState('');
    const [scopeType, setScopeType] = useState<AccessScope['type']>('SELF');
    const [selectedBuIds, setSelectedBuIds] = useState<string[]>([]);
    const [dashboardType, setDashboardType] = useState(user.dashboardType || 'employee');

    useEffect(() => {
        if (!isOpen) return;
        setPrimaryRole(user.role);
        setAdditionalRole(user.roles?.find(role => role !== user.role) || '');
        setScopeType(user.accessScope?.type || 'SELF');
        setSelectedBuIds(user.accessScope?.allowedBuIds || []);
        setDashboardType(user.dashboardType || 'employee');
    }, [isOpen, user]);

    const roleIds = [...new Set([primaryRole, additionalRole].filter(Boolean))];
    const toggleBusinessUnit = (id: string) => setSelectedBuIds(previous =>
        previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]
    );

    const footer = (
        <div className="flex w-full justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave({
                userId: user.id,
                roleIds,
                primaryRole,
                accessScope: { type: scopeType, allowedBuIds: scopeType === 'SPECIFIC' ? selectedBuIds : undefined },
                dashboardType,
            })}>Save audited change</Button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Access for ${user.name}`} footer={footer}>
            <div className="space-y-6">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Role and scope changes are atomic, server-authorized, and recorded in the RBAC audit history. Self-promotion is blocked.
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium text-gray-700">Primary role
                        <select value={primaryRole} onChange={event => setPrimaryRole(event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 p-2">
                            {roles.map(role => <option key={role} value={role}>{role === 'GeneralManager' ? 'General Manager' : role}</option>)}
                        </select>
                    </label>
                    <label className="text-sm font-medium text-gray-700">Additional role
                        <select value={additionalRole} onChange={event => setAdditionalRole(event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 p-2">
                            <option value="">None</option>
                            {roles.filter(role => role !== primaryRole).map(role => <option key={role} value={role}>{role === 'GeneralManager' ? 'General Manager' : role}</option>)}
                        </select>
                        <span className="mt-1 block text-xs text-gray-500">The server permits a second role only for the two approved accounts.</span>
                    </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium text-gray-700">Dashboard type
                        <select value={dashboardType} onChange={event => setDashboardType(event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 p-2">
                            <option value="executive">Executive/BOD</option><option value="hr">Full HR</option>
                            <option value="admin">Admin</option><option value="admin_it">Admin/IT</option>
                            <option value="manager">Manager</option><option value="employee">Employee</option>
                        </select>
                    </label>
                    <label className="text-sm font-medium text-gray-700">Data-access scope
                        <select value={scopeType} onChange={event => setScopeType(event.target.value as AccessScope['type'])} className="mt-1 block w-full rounded-md border-gray-300 p-2">
                            <option value="SELF">Self only</option><option value="DIRECT_REPORTS">Direct reports</option>
                            <option value="DEPARTMENT">Department</option><option value="HOME_ONLY">Home business unit</option>
                            <option value="SPECIFIC">Selected business units</option><option value="GLOBAL">Global/all business units</option>
                        </select>
                    </label>
                </div>
                {scopeType === 'SPECIFIC' && (
                    <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 p-3">
                        {businessUnits.map(unit => (
                            <label key={unit.id} className="flex items-center gap-2 py-1 text-sm">
                                <input type="checkbox" checked={selectedBuIds.includes(unit.id)} onChange={() => toggleBusinessUnit(unit.id)} />
                                {unit.name}
                            </label>
                        ))}
                    </div>
                )}
                <div className="grid gap-3 rounded-lg bg-gray-50 p-4 text-sm sm:grid-cols-4">
                    <div><strong>Effective roles</strong><p>{roleIds.join(' + ')}</p></div>
                    <div><strong>Feature access</strong><p>{Object.keys(user.effectiveFeaturePermissions || {}).length} resources</p></div>
                    <div><strong>Sensitive-data summary</strong><p>{Object.keys(user.sensitivePermissions || {}).length} protected categories</p></div>
                    <div><strong>Workflow summary</strong><p>{Object.keys(user.workflowPermissions || {}).length} workflows</p></div>
                </div>
            </div>
        </Modal>
    );
};

export default UserRoleEditModal;
