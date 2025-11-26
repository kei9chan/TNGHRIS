import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { User } from '../../types';
import { mockUsers } from '../../services/mockData';
import Card from '../ui/Card';

// FIX: Inlined DetailItem component to remove dependency on a non-existent file.
const DetailItem: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm text-gray-900 dark:text-white">{value || 'N/A'}</dd>
    </div>
);

interface EmploymentDetailsCardProps {
    user: User;
}

const EmploymentDetailsCard: React.FC<EmploymentDetailsCardProps> = ({ user }) => {
    const manager = useMemo(() => {
        if (!user.managerId) return null;
        return mockUsers.find(u => u.id === user.managerId);
    }, [user.managerId]);

    return (
        <Card title="Employment Details">
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6">
                <DetailItem label="Employee ID" value={user.id} />
                <DetailItem label="Business Unit" value={user.businessUnit} />
                <DetailItem label="Department" value={user.department} />
                <DetailItem label="Role" value={user.role} />
                <DetailItem label="Employment Status" value={user.employmentStatus || 'N/A'} />
                <DetailItem label="Status" value={<span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{user.status}</span>} />
                <DetailItem label="Date Hired" value={user.dateHired ? new Date(user.dateHired).toLocaleDateString() : 'N/A'} />
                {user.status === 'Inactive' && (
                    <DetailItem label="End Date" value={user.endDate ? new Date(user.endDate).toLocaleDateString() : 'N/A'} />
                )}
                <DetailItem label="Reports To" value={manager ? <Link to={`/employees/view/${manager.id}`} className="text-indigo-600 hover:underline">{manager.name}</Link> : 'N/A'} />
            </dl>
        </Card>
    );
};

export default EmploymentDetailsCard;