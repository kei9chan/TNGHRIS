import React, { useMemo } from 'react';
import { User } from '../../types';
import { mockUsers } from '../../services/mockData';
import Card from '../ui/Card';
import { useSettings } from '../../context/SettingsContext';

// FIX: Inlined DetailItem component to remove dependency on a non-existent file.
const DetailItem: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm text-gray-900 dark:text-white">{value || 'N/A'}</dd>
    </div>
);

interface CompensationCardProps {
  user: User;
}

const CompensationCard: React.FC<CompensationCardProps> = ({ user }) => {
    const { settings } = useSettings();
    const { salary, rateType, rateAmount, taxStatus } = user;
    
    const formatCurrency = (value?: number) => {
        if (value === undefined || value === null) return 'N/A';
        return `${settings.currency} ${value.toLocaleString()}`;
    };

    const totalSalary = useMemo(() => {
        if (!salary) return rateAmount || 0;
        return (rateAmount || salary.basic || 0) + (salary.deminimis || 0) + (salary.reimbursable || 0);
    }, [salary, rateAmount]);
    
    return (
        <Card title="Compensation">
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6">
                <DetailItem label={`Rate Amount (${rateType || 'N/A'})`} value={<strong>{formatCurrency(rateAmount)}</strong>} />
                <DetailItem label="Tax Status" value={taxStatus || 'N/A'} />
                <DetailItem label="Deminimis" value={formatCurrency(salary?.deminimis)} />
                <DetailItem label="Reimbursable" value={formatCurrency(salary?.reimbursable)} />
                <DetailItem label="Total Monthly Compensation" value={<strong>{formatCurrency(totalSalary)}</strong>} />
            </dl>
        </Card>
    );
};

export default CompensationCard;