import React, { useState, useEffect } from 'react';
import Card from '../../components/ui/Card';
import { GovernmentReportTemplate, TemplateStatus } from '../../types';
import { fetchGovernmentReportTemplates } from '../../services/payrollService';

const getStatusChipColor = (status: TemplateStatus) => {
    switch (status) {
        case TemplateStatus.Active: return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200';
        case TemplateStatus.Archived: return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
        default: return 'bg-gray-100 text-gray-800';
    }
};

const GovernmentReportTemplates: React.FC = () => {
  const [templates, setTemplates] = useState<GovernmentReportTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGovernmentReportTemplates()
      .then(setTemplates)
      .catch(err => setError(err.message || 'Failed to load report templates.'))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <div className="text-center py-20 text-gray-500 dark:text-gray-400">Loading templates...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Government Report Templates</h1>
      <p className="text-gray-600 dark:text-gray-400">
        Manage and view all report templates available for each business unit.
      </p>
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Business Unit
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Report Type
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Frequency
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {error && (
                <tr><td colSpan={4} className="px-6 py-4 text-center text-red-500">{error}</td></tr>
              )}
              {!error && templates.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">No report templates found.</td></tr>
              )}
              {templates.map(template => (
                <tr key={template.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {template.businessUnit}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {template.reportType}
                  </td>
                   <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {template.frequency}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusChipColor(template.status)}`}>
                      {template.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default GovernmentReportTemplates;