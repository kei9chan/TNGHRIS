import React from 'react';
import Card from '../../ui/Card';

interface DepartmentData {
    name: string;
    averageScore: number;
    employeeCount: number;
}

interface DepartmentPerformanceTableProps {
    departments: DepartmentData[];
}

const DepartmentPerformanceTable: React.FC<DepartmentPerformanceTableProps> = ({ departments }) => {
    
    const sortedDepartments = [...departments].sort((a,b) => b.averageScore - a.averageScore);

    return (
        <Card title="Performance by Department">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Department</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Participants</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Average Score</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {sortedDepartments.map(dept => (
                            <tr key={dept.name}>
                                <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white">{dept.name}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400">{dept.employeeCount}</td>
                                <td className="px-6 py-4 whitespace-nowrap font-bold text-lg text-indigo-600 dark:text-indigo-400">{dept.averageScore.toFixed(2)}</td>
                            </tr>
                        ))}
                         {sortedDepartments.length === 0 && (
                            <tr>
                                <td colSpan={3} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                    No data available for the selected filters.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

export default DepartmentPerformanceTable;
