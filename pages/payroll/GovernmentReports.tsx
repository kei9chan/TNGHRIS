import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import { GovernmentReport } from '../../types';
import { fetchGovernmentReports } from '../../services/payrollService';

const getStatusChipColor = (status: GovernmentReport['status']) => {
    switch (status) {
        case 'Generated': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200';
        case 'Submitted': return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200';
        case 'Not Generated':
        default:
            return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
};

const GovernmentReports: React.FC = () => {
  const [reports, setReports] = useState<GovernmentReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGovernmentReports()
      .then(setReports)
      .catch(err => setError(err.message || 'Failed to load government reports.'))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <div className="text-center py-20 text-gray-500 dark:text-gray-400">Loading reports...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Government Reports</h1>
      <p className="text-gray-600 dark:text-gray-400">
        List of mandatory government reports for payroll. Click on a report to view.
      </p>
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Report Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Description
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {error && (
                <tr><td colSpan={3} className="px-6 py-4 text-center text-red-500">{error}</td></tr>
              )}
              {!error && reports.length === 0 && (
                <tr><td colSpan={3} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">No government reports found.</td></tr>
              )}
              {reports.map(report => (
                <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    <Link to={`/payroll/government-reports/${report.id}`} className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300">
                      {report.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-normal text-sm text-gray-500 dark:text-gray-400">
                    {report.description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusChipColor(report.status)}`}>
                      {report.status}
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

export default GovernmentReports;