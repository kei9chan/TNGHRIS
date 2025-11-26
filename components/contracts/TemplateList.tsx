import React from 'react';
import { ContractTemplate, Role } from '../../types';
import Button from '../ui/Button';
import { mockBusinessUnits } from '../../services/mockData';

interface TemplateListProps {
    templates: ContractTemplate[];
    onEdit: (template: ContractTemplate) => void;
}

const TemplateList: React.FC<TemplateListProps> = ({ templates, onEdit }) => {
    
    const getBuName = (id: string) => mockBusinessUnits.find(b => b.id === id)?.name || 'N/A';
    
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Template Title</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Business Unit</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Default</th>
                        <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {templates.map(template => (
                        <tr key={template.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{template.title}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{getBuName(template.owningBusinessUnitId)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                {template.isDefault && (
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                        Yes
                                    </span>
                                )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <div className="flex space-x-2">
                                    <Button size="sm" onClick={() => onEdit(template)}>Edit</Button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
             {templates.length === 0 && (
                <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                    No templates created yet.
                </div>
            )}
        </div>
    );
};
export default TemplateList;
