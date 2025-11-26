import React from 'react';
import { Role, Permission, Resource, PermissionsMatrix } from '../../types';

interface PermissionsMatrixProps {
    roles: Role[];
    resourceGroups: Record<string, Resource[]>;
    permissionsMatrix: PermissionsMatrix;
    onPermissionChange: (role: Role, resource: Resource, permission: Permission, checked: boolean) => void;
}

const permissionOrder: Permission[] = [Permission.View, Permission.Create, Permission.Edit, Permission.Approve, Permission.Manage];

const PermissionsMatrixTable: React.FC<PermissionsMatrixProps> = ({ roles, resourceGroups, permissionsMatrix, onPermissionChange }) => {
    
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700">
                <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0 z-10">
                    <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-r dark:border-gray-600">
                            Section / Permission
                        </th>
                        {roles.map(role => (
                            <th key={role} scope="col" className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-48">
                                {role}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {Object.entries(resourceGroups).map(([groupName, resources]) => (
                        <React.Fragment key={groupName}>
                            <tr className="bg-gray-50 dark:bg-gray-800/50">
                                <td colSpan={roles.length + 1} className="px-4 py-2 text-sm font-bold text-gray-800 dark:text-gray-200">
                                    {groupName}
                                </td>
                            </tr>
                            {/* FIX: Cast 'resources' to Resource[] to resolve 'map does not exist on unknown' error. */}
                            {(resources as Resource[]).map(resource => (
                                <tr key={resource} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="px-4 py-3 font-medium text-sm text-gray-800 dark:text-gray-300 border-r dark:border-gray-600">
                                        {resource}
                                    </td>
                                    {roles.map(role => (
                                        <td key={role} className="px-4 py-3">
                                            <div className="flex justify-around items-center space-x-2">
                                                {permissionOrder.map(permission => {
                                                    const hasPermission = permissionsMatrix[role]?.[resource]?.includes(permission) || false;
                                                    const id = `${role}-${resource}-${permission}`;
                                                    return (
                                                        <div key={permission} className="flex flex-col items-center">
                                                            <label htmlFor={id} className="text-xs text-gray-500">{permission.charAt(0)}</label>
                                                            <input
                                                                id={id}
                                                                type="checkbox"
                                                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                                                checked={hasPermission}
                                                                onChange={(e) => onPermissionChange(role, resource, permission, e.target.checked)}
                                                            />
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default PermissionsMatrixTable;
