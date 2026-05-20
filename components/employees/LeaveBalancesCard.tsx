import React, { useState, useEffect } from 'react';
import { User, LeaveType } from '../../types';
import { fetchLeaveTypes } from '../../services/leaveService';
import Card from '../ui/Card';

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
    const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);

    useEffect(() => {
        fetchLeaveTypes().then(setLeaveTypes).catch(console.error);
    }, []);

    const formatDays = (value?: number) => {
        if (value === undefined || value === null) return 'N/A';
        return `${value.toFixed(2)} days`;
    };

    // Helper to map dynamic Leave Type ID to the hardcoded User structure
    // In a fully dynamic backend, User.balances would be a Record<string, number>
    const getBalanceForType = (type: LeaveType): number | undefined => {
        const name = type.name.toLowerCase();
        if (name.includes('vacation') || type.id === 'lt1') return user.leaveQuotaVacation;
        if (name.includes('sick') || type.id === 'lt2') return user.leaveQuotaSick;
        return 0;
    };

    return (
        <Card title="Leave Balances">
            <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-6">
                {leaveTypes.map(type => (
                    <DetailItem 
                        key={type.id} 
                        label={type.name} 
                        value={<strong>{formatDays(getBalanceForType(type))}</strong>} 
                    />
                ))}
                <DetailItem label="Leave Accrual Rate" value={user.leaveInfo?.accrualRate ? `${user.leaveInfo.accrualRate} days/month` : 'N/A'} />
                <DetailItem label="Last Leave Credit Date" value={user.leaveLastCreditDate ? new Date(user.leaveLastCreditDate).toLocaleDateString() : 'N/A'} />
            </dl>
        </Card>
    );
};

export default LeaveBalancesCard;
