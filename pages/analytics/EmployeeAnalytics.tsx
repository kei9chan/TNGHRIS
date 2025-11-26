import React, { useMemo } from 'react';
import StatCard from '../../components/dashboard/StatCard';
import AnalyticsCard from '../../components/analytics/AnalyticsCard';
import SimpleBarChart from '../../components/analytics/SimpleBarChart';
import { mockUsers } from '../../services/mockData';
import EditableDescription from '../../components/ui/EditableDescription';

const UserGroupIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.122-1.28-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.122-1.28.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
const TrendingDownIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>;

const EmployeeAnalytics: React.FC = () => {

    const headcountByDept = useMemo(() => {
        const counts: Record<string, number> = {};
        mockUsers.forEach(user => {
            if (user.status === 'Active') {
                counts[user.department] = (counts[user.department] || 0) + 1;
            }
        });
        return Object.entries(counts)
            .map(([label, value]) => ({ label, value }))
            .sort((a,b) => b.value - a.value);
    }, []);

    const turnoverRate = useMemo(() => {
        const leavers = mockUsers.filter(u => u.status === 'Inactive').length;
        const total = mockUsers.length;
        return total > 0 ? (leavers / total) * 100 : 0;
    }, []);

    const tenureDistribution = useMemo(() => {
        const distribution = {
            '< 1 Year': 0,
            '1-3 Years': 0,
            '3-5 Years': 0,
            '5+ Years': 0,
        };
        const now = new Date();
        mockUsers.filter(u => u.status === 'Active' && u.dateHired).forEach(user => {
            const years = (now.getTime() - new Date(user.dateHired!).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
            if (years < 1) distribution['< 1 Year']++;
            else if (years <= 3) distribution['1-3 Years']++;
            else if (years <= 5) distribution['3-5 Years']++;
            else distribution['5+ Years']++;
        });
        return Object.entries(distribution).map(([label, value]) => ({ label, value }));
    }, []);

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Employee Analytics</h1>
            <EditableDescription descriptionKey="analyticsEmployeeDesc" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <StatCard 
                    title="Total Active Headcount"
                    value={mockUsers.filter(u => u.status === 'Active').length}
                    icon={<UserGroupIcon />}
                    colorClass="bg-blue-500"
                />
                 <StatCard 
                    title="Annualized Turnover Rate"
                    value={`${turnoverRate.toFixed(1)}%`}
                    icon={<TrendingDownIcon />}
                    colorClass="bg-red-500"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <AnalyticsCard title="Headcount by Department">
                    <SimpleBarChart data={headcountByDept} />
                </AnalyticsCard>
                <AnalyticsCard title="Tenure Distribution">
                    <SimpleBarChart data={tenureDistribution} />
                </AnalyticsCard>
            </div>
        </div>
    );
};

export default EmployeeAnalytics;