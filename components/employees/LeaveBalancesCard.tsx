
import React from 'react';
import { User } from '../../types';
import Card from '../ui/Card';
import { mockLeaveTypes } from '../../services/mockData';

interface LeaveBalancesCardProps {
  user: User;
}

const DetailItem: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm text-gray-900 dark:text-white">{value || 'N/A'}</dd>
    </div>
);

const LeaveBalancesCard: React.FC<LeaveBalancesCardProps> = ({ user }) => {
    const { leaveInfo } = user;
    const balances = leaveInfo?.balances;

    const formatDays = (value?: number) => {
        if (value === undefined || value === null) return 'N/A';
        return `${value.toFixed(2)} days`;
    };

    // Helper to map dynamic Leave Type ID to the hardcoded User structure
    // In a fully dynamic backend, User.balances would be a Record<string, number>
    const getBalanceForType = (typeId: string): number | undefined => {
        if (!balances) return undefined;
        if (typeId === 'lt1') return balances.vacation;
        if (typeId === 'lt2') return balances.sick;
        return 0;
    };

    return (
        <Card title="Leave Balances">
            <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-6">
                {mockLeaveTypes.map(type => (
                    <DetailItem 
                        key={type.id} 
                        label={type.name} 
                        value={<strong>{formatDays(getBalanceForType(type.id))}</strong>} 
                    />
                ))}
                <DetailItem label="Leave Accrual Rate" value={leaveInfo?.accrualRate ? `${leaveInfo.accrualRate} days/month` : 'N/A'} />
                <DetailItem label="Last Leave Credit Date" value={leaveInfo?.lastCreditDate ? new Date(leaveInfo.lastCreditDate).toLocaleDateString() : 'N/A'} />
            </dl>
        </Card>
    );
};

export default LeaveBalancesCard;
