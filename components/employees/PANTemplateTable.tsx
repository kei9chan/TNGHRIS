import React from 'react';
import { PANTemplate, Permission } from '../../types';
import Button from '../ui/Button';
import { usePermissions } from '../../hooks/usePermissions';
import { mockUsers } from '../../services/mockData';

interface PANTemplateTableProps {
    templates: PANTemplate[];
    onEdit: (template: PANTemplate) => void;
    onDelete: (templateId: string) => void;
}

const PANTemplateTable: React.FC<PANTemplateTableProps> = ({ templates, onEdit, onDelete }) => {
    const { can } = usePermissions();
    const canManage = can('PAN', Permission.Manage);

    const getUserName = (id: string) => mockUsers.find(u => u.id === id)?.name || 'N/A';

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Template Name</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Created By</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Last Modified</th>
                        <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {templates.map(template => (
                        <tr key={template.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{template.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{getUserName(template.createdByUserId)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(template.updatedAt).toLocaleDateString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                {canManage && (
                                    <div className="flex space-x-2 justify-end">
                                        <Button size="sm" variant="secondary" onClick={() => onEdit(template)}>Edit</Button>
                                        <Button size="sm" variant="danger" onClick={() => onDelete(template.id)}>Delete</Button>
                                    </div>
                                )}
                            </td>
                        </tr>
                    ))}
                     {templates.length === 0 && (
                        <tr>
                            <td colSpan={4} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                No PAN templates found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default PANTemplateTable;
