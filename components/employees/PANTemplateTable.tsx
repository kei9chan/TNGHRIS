import React from 'react';
import { PANTemplate, Permission } from '../../types';
import Button from '../ui/Button';
import { usePermissions } from '../../hooks/usePermissions';
import { useUsers } from '../../hooks/useHRData';

interface PANTemplateTableProps {
  templates: PANTemplate[];
  onEdit: (template: PANTemplate) => void;
  onDelete: (templateId: string) => void;
}

const PANTemplateTable: React.FC<PANTemplateTableProps> = ({ templates, onEdit, onDelete }) => {
  const { can } = usePermissions(); const { users } = useUsers(); const canManage = can('PAN', Permission.Manage);
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700"><thead className="bg-slate-50 dark:bg-slate-800"><tr>{['Template', 'Scope', 'Created by', 'Last modified', ''].map((heading, index) => <th key={index} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{templates.map(template => <tr key={template.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60"><td className="px-5 py-4 text-sm font-semibold text-slate-900 dark:text-white">{template.name}{template.isDefault && <span className="ml-2 rounded-full bg-indigo-100 px-2 py-1 text-xs text-indigo-700">Default</span>}</td><td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">{template.businessUnitName || 'Global — all business units'}</td><td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">{users.find(user => user.id === template.createdByUserId)?.name || 'N/A'}</td><td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">{new Date(template.updatedAt).toLocaleDateString()}</td><td className="px-5 py-4 text-right">{canManage && <div className="flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => onEdit(template)}>Edit</Button><Button size="sm" variant="danger" onClick={() => onDelete(template.id)}>Delete</Button></div>}</td></tr>)}{!templates.length && <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">No PAN templates found.</td></tr>}</tbody></table></div></div>;
};

export default PANTemplateTable;

