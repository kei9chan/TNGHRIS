import React from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/ui/Card';
import { usePermissions } from '../hooks/usePermissions';
import { Permission, Resource } from '../types';

const ChartBarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>;
const UserGroupIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.122-1.28-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.122-1.28.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
const ScaleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52v16.5m-1.5-16.5v16.5m-3-16.5v16.5m-1.5-16.5v16.5m-3-16.5v16.5m-1.5-16.5v16.5M5.25 4.97c-1.01.143-2.01.317-3 .52m3-.52v16.5m1.5-16.5v16.5m3-16.5v16.5m1.5-16.5v16.5m3-16.5v16.5m1.5-16.5v16.5" /></svg>;

const reportLinks: { name: string; path: string; icon: React.ReactNode; resource: Resource }[] = [
    {
        name: 'Recruitment Analytics',
        path: '/employees/analytics/recruitment',
        icon: <UserGroupIcon />,
        resource: 'Analytics',
    },
    {
        name: 'Employee Analytics',
        path: '/employees/analytics/employee',
        icon: <ChartBarIcon />,
        resource: 'Analytics',
    },
    {
        name: 'Discipline Analytics',
        path: '/employees/analytics/discipline',
        icon: <ScaleIcon />,
        resource: 'Analytics',
    }
];

const Analytics: React.FC = () => {
    const { can } = usePermissions();

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Analytics & Reports</h1>
            <p className="text-gray-600 dark:text-gray-400">
                Explore dashboards with visual insights into your organization's HR metrics.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {reportLinks.filter(link => can(link.resource, Permission.View)).map(report => (
                    <Link to={report.path} key={report.name} className="block hover:no-underline">
                        <Card className="hover:shadow-xl hover:ring-2 hover:ring-indigo-500 transition-all duration-300 h-full">
                            <div className="flex flex-col items-center text-center p-4">
                                {report.icon}
                                <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">{report.name}</h2>
                            </div>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
};

export default Analytics;