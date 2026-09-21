import React, { useEffect, useMemo, useState } from 'react';
import { User } from '../../types';
import Card from '../ui/Card';
import { useSettings } from '../../context/SettingsContext';
import { Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

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
    const [profile, setProfile] = useState<any>();
    const [profileError, setProfileError] = useState('');

    useEffect(() => {
        let active = true;
        setProfile(undefined); setProfileError('');
        void supabase.rpc('get_employee_compensation_profile', { p_employee_id: user.id }).then(({ data, error }) => {
            if (!active) return;
            if (error) setProfileError(error.message);
            else setProfile(data);
        });
        return () => { active = false; };
    }, [user.id]);
    
    const formatCurrency = (value?: number) => {
        if (value === undefined || value === null) return 'N/A';
        return `${settings.currency} ${value.toLocaleString()}`;
    };

    const totalSalary = useMemo(() => {
        if (!salary) return rateAmount || 0;
        return (rateAmount || salary.basic || 0) + (salary.deminimis || 0) + (salary.reimbursable || 0);
    }, [salary, rateAmount]);
    
    const activePackage = profile?.current;
    const upcomingPackage = profile?.upcoming;
    const displayedBase = activePackage?.base_amount ?? rateAmount ?? salary?.basic;
    const sourcePan = activePackage?.source_pan_id;
    const components: any[] = activePackage?.components || [];
    const allowances = components.filter(item => ['de_minimis','fixed_allowance','reimbursable_allowance'].includes(item.category));
    const benefits = components.filter(item => String(item.category || '').includes('benefit') || item.category === 'employer_contribution');

    return (
        <Card title="Compensation">
            {activePackage?.source_kind === 'approved_pan' && <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><strong>Compensation source: Approved PAN #{String(sourcePan).slice(0, 8).toUpperCase()}</strong><p className="mt-1">Approved {activePackage.source_metadata?.panApprovalDate ? new Date(activePackage.source_metadata.panApprovalDate).toLocaleString() : 'date recorded'} · Effective {new Date(`${activePackage.effective_from}T00:00:00`).toLocaleDateString()}</p></div>}
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6">
                <DetailItem label={`Current basic pay (${activePackage?.rate_type || rateType || 'N/A'})`} value={<strong>{formatCurrency(displayedBase)}</strong>} />
                <DetailItem label="Compensation type" value={activePackage?.treatment?.payBasis === 'net_tax' ? 'Net of tax' : activePackage ? 'Gross pay' : 'Legacy employee profile'} />
                <DetailItem label="Effective date" value={activePackage?.effective_from ? new Date(`${activePackage.effective_from}T00:00:00`).toLocaleDateString() : 'N/A'} />
                <DetailItem label="Tax Status" value={taxStatus || 'N/A'} />
                <DetailItem label="Allowances" value={allowances.length ? allowances.map(item => `${item.name}: ${formatCurrency(Number(item.amount))}`).join(' · ') : formatCurrency((salary?.deminimis || 0) + (salary?.reimbursable || 0))} />
                <DetailItem label="Benefits & employer contributions" value={benefits.length ? benefits.map(item => item.name).join(', ') : 'None recorded'} />
                {(activePackage?.rate_type || rateType) === 'Monthly' && <DetailItem label="Total Monthly Compensation" value={<strong>{formatCurrency(activePackage ? Number(activePackage.base_amount) + components.reduce((sum, item) => sum + Number(item.amount || 0), 0) : totalSalary)}</strong>} />}
            </dl>
            {upcomingPackage && <div className="mt-5 rounded-lg bg-violet-50 p-3 text-sm text-violet-900"><strong>Upcoming compensation</strong><p>{formatCurrency(Number(upcomingPackage.base_amount))} from {new Date(`${upcomingPackage.effective_from}T00:00:00`).toLocaleDateString()} · {upcomingPackage.source_kind === 'approved_pan' ? 'Approved PAN' : 'Approved direct package'}</p></div>}
            {profileError && <p className="mt-4 text-xs text-amber-700">Dated compensation history could not be loaded: {profileError}</p>}
            <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold"><Link className="text-indigo-600 dark:text-indigo-300" to={`/payroll/pay-packages?employee=${user.id}&view=review`}>View active package and salary history →</Link>{sourcePan && <Link className="text-indigo-600 dark:text-indigo-300" to={`/employees/pan?item=${sourcePan}`}>View approved PAN →</Link>}</div>
        </Card>
    );
};

export default CompensationCard;
