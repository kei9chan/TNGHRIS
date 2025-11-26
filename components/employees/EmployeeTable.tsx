
import React from 'react';
import { User, Permission } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import Button from '../ui/Button';

interface EmployeeTableProps {
    users: User[];
    onView: (userId: string) => void;
    onEdit: (user: User) => void;
}

const getStatusColor = (status: User['status']) => {
    return status === 'Active' 
        ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' 
        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
};

const EmployeeTable: React.FC<EmployeeTableProps> = ({ users, onView, onEdit }) => {
    const { can } = usePermissions();
    const canEdit = can('Employees', Permission.Edit);

    return (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            {/* 
                max-h-[70vh] limits the table height so it scrolls internally.
                overflow-y-auto enables vertical scrolling.
                overflow-x-auto enables horizontal scrolling for small screens.
            */}
            <div className="max-h-[70vh] overflow-y-auto overflow-x-auto custom-scrollbar">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider bg-gray-50 dark:bg-gray-700">Name</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider bg-gray-50 dark:bg-gray-700">Department</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider bg-gray-50 dark:bg-gray-700">Position</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider bg-gray-50 dark:bg-gray-700">Business Unit</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider bg-gray-50 dark:bg-gray-700">Status</th>
                            <th scope="col" className="relative px-6 py-3 bg-gray-50 dark:bg-gray-700"><span className="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {users.map(user => (
                            <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900 dark:text-white">{user.name}</div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400">{user.email}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.department}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.position || 'N/A'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{user.businessUnit}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(user.status)}`}>
                                        {user.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex space-x-2 justify-end">
                                        <Button size="sm" variant="secondary" onClick={() => onView(user.id)}>View</Button>
                                        {canEdit && <Button size="sm" onClick={() => onEdit(user)}>Edit</Button>}
                                    </div>
                                </td>
                            </tr>
                        ))}
                         {users.length === 0 && (
                            <tr>
                                <td colSpan={6} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                    No employees match the current filters.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default EmployeeTable;
