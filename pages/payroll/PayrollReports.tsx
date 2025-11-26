import React from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';

const ChartBarIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>);
const DocumentReportIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>);
const CheckCircleIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>);

const reports = [
    {
        name: 'Daily Time Summary',
        description: 'Aggregated work hours by department and site.',
        path: '/payroll/reports/time-summary',
        icon: <ChartBarIcon />,
    },
    {
        name: 'Exceptions Report',
        description: 'Review historical attendance flags and anomalies.',
        path: '/payroll/reports/exceptions',
        icon: <DocumentReportIcon />,
    },
    {
        name: 'Approved Overtime Report',
        description: 'View and export all approved OT for payroll staging.',
        path: '/payroll/payroll-prep',
        icon: <CheckCircleIcon />,
    }
];

const PayrollReports: React.FC = () => {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Payroll Reports</h1>
            <p className="text-gray-600 dark:text-gray-400">
                Generate and export detailed reports for timekeeping, exceptions, and overtime.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {reports.map(report => (
                    <Link to={report.path} key={report.name} className="block hover:no-underline">
                        <Card className="hover:shadow-xl hover:border-indigo-500/50 border border-transparent transition-all duration-300 h-full">
                            <div className="flex flex-col items-center text-center">
                                {report.icon}
                                <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">{report.name}</h2>
                                <p className="mt-2 text-gray-600 dark:text-gray-400">{report.description}</p>
                            </div>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
};

export default PayrollReports;