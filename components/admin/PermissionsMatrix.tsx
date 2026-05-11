import React, { useState, useMemo } from 'react';
import { Role, Permission, Resource, PermissionsMatrix } from '../../types';

interface PermissionsMatrixProps {
    roles: Role[];
    resourceGroups: Record<string, Resource[]>;
    permissionsMatrix: PermissionsMatrix;
    onPermissionChange?: (role: Role, resource: Resource, permission: Permission, checked: boolean) => void;
}

const permissionOrder: Permission[] = [
    Permission.View,
    Permission.Create,
    Permission.Edit,
    Permission.Approve,
    Permission.Manage,
];

const permissionLabels: Record<Permission, string> = {
    [Permission.View]: 'View',
    [Permission.Create]: 'Create',
    [Permission.Edit]: 'Edit',
    [Permission.Approve]: 'Approve',
    [Permission.Manage]: 'Manage',
};

/* ─── Toggle switch ────────────────────────────────────────────────────────── */
const Toggle: React.FC<{
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
    id: string;
}> = ({ checked, onChange, disabled, id }) => (
    <button
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
            checked ? 'bg-purple-600' : 'bg-gray-600'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
        <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                checked ? 'translate-x-4' : 'translate-x-0'
            }`}
        />
    </button>
);

/* ─── Main Component ───────────────────────────────────────────────────────── */
const PermissionsMatrixTable: React.FC<PermissionsMatrixProps> = ({
    roles,
    resourceGroups,
    permissionsMatrix,
    onPermissionChange,
}) => {
    const [selectedRole, setSelectedRole] = useState<Role | null>(roles[0] ?? null);
    const [search, setSearch] = useState('');

    const readOnly = !onPermissionChange;

    /* Filter resources matching search */
    const filteredGroups = useMemo(() => {
        if (!search.trim()) return resourceGroups;
        const q = search.toLowerCase();
        const result: Record<string, Resource[]> = {};
        Object.entries(resourceGroups).forEach(([g, res]) => {
            const matched = (res as Resource[]).filter(r => r.toLowerCase().includes(q) || g.toLowerCase().includes(q));
            if (matched.length) result[g] = matched;
        });
        return result;
    }, [resourceGroups, search]);

    const handleToggle = (resource: Resource, permission: Permission, checked: boolean) => {
        if (!selectedRole || !onPermissionChange) return;
        onPermissionChange(selectedRole, resource, permission, checked);
    };

    /* Select-all / deselect-all for a group */
    const handleSelectAll = (resources: Resource[], select: boolean) => {
        if (!selectedRole || !onPermissionChange) return;
        resources.forEach(resource => {
            permissionOrder.forEach(permission => {
                const has = permissionsMatrix[selectedRole]?.[resource]?.includes(permission) ?? false;
                if (select && !has) onPermissionChange(selectedRole, resource, permission, true);
                if (!select && has) onPermissionChange(selectedRole, resource, permission, false);
            });
        });
    };

    const isGroupFullySelected = (resources: Resource[]) => {
        if (!selectedRole) return false;
        return resources.every(resource =>
            permissionOrder.every(p => permissionsMatrix[selectedRole]?.[resource]?.includes(p))
        );
    };

    return (
        <div className="flex h-full min-h-[600px] rounded-xl overflow-hidden border border-gray-700/60 bg-gray-900">
            {/* ── Left sidebar: Role list ── */}
            <aside className="w-52 flex-shrink-0 flex flex-col border-r border-gray-700/60 bg-gray-900">
                <div className="px-4 py-3 border-b border-gray-700/60">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Select Role</p>
                </div>
                <nav className="flex-1 overflow-y-auto py-1">
                    {roles.map(role => (
                        <button
                            key={role}
                            onClick={() => setSelectedRole(role)}
                            className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-between group ${
                                selectedRole === role
                                    ? 'bg-purple-600/20 text-purple-300 border-r-2 border-purple-500'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                            }`}
                        >
                            <span className="uppercase tracking-wide text-xs">{role}</span>
                            {selectedRole === role && (
                                <span className="text-purple-400">›</span>
                            )}
                        </button>
                    ))}
                </nav>

                {/* Add New Role hint slot */}
                <div className="px-3 py-3 border-t border-gray-700/60">
                    <p className="text-xs text-gray-600 italic">Manage roles above ↑</p>
                </div>
            </aside>

            {/* ── Right panel: Permissions ── */}
            <div className="flex-1 flex flex-col overflow-hidden bg-gray-900/50">
                {/* Panel header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/60 bg-gray-900/80 backdrop-blur">
                    <div>
                        <h2 className="text-xl font-bold text-white uppercase tracking-wide">
                            {selectedRole ?? '—'}
                        </h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {selectedRole ? 'Manage permissions for this role.' : 'Select a role to view permissions.'}
                        </p>
                    </div>
                    {/* Search */}
                    <div className="relative w-56">
                        <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-500">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                            </svg>
                        </span>
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search permissions..."
                            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg bg-gray-800 border border-gray-700 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                    </div>
                </div>

                {/* Permission groups */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                    {!selectedRole && (
                        <div className="text-center text-gray-500 py-12">Select a role from the left to manage its permissions.</div>
                    )}
                    {selectedRole && Object.entries(filteredGroups).map(([groupName, resources]) => {
                        const groupFull = isGroupFullySelected(resources as Resource[]);
                        return (
                            <div key={groupName} className="rounded-lg border border-gray-700/60 overflow-hidden">
                                {/* Group header */}
                                <div className="flex items-center justify-between px-5 py-3 bg-gray-800/70">
                                    <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">{groupName}</span>
                                    {!readOnly && (
                                        <button
                                            onClick={() => handleSelectAll(resources as Resource[], !groupFull)}
                                            className="text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors"
                                        >
                                            {groupFull ? 'Deselect All' : 'Select All'}
                                        </button>
                                    )}
                                </div>

                                {/* Permission rows: 2-column grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 divide-gray-700/40 bg-gray-900/60">
                                    {(resources as Resource[]).map((resource, idx) => (
                                        <div
                                            key={resource}
                                            className={`px-5 py-4 flex flex-col gap-3 ${
                                                idx % 2 === 0 ? 'sm:border-r border-gray-700/40' : ''
                                            } ${idx > 1 ? 'border-t border-gray-700/40' : ''}`}
                                        >
                                            {/* Resource name + permission toggles */}
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="text-sm text-gray-200 font-medium truncate">{resource}</span>
                                                <div className="flex items-center gap-3 flex-shrink-0">
                                                    {permissionOrder.map(permission => {
                                                        const has = permissionsMatrix[selectedRole]?.[resource]?.includes(permission) ?? false;
                                                        const tid = `${selectedRole}-${resource}-${permission}`;
                                                        return (
                                                            <div key={permission} className="flex flex-col items-center gap-1">
                                                                <span className="text-[10px] text-gray-500 uppercase">{permissionLabels[permission].charAt(0)}</span>
                                                                <Toggle
                                                                    id={tid}
                                                                    checked={has}
                                                                    onChange={v => handleToggle(resource, permission, v)}
                                                                    disabled={readOnly}
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                    {selectedRole && Object.keys(filteredGroups).length === 0 && (
                        <div className="text-center text-gray-500 py-12">No permissions match "{search}".</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PermissionsMatrixTable;
