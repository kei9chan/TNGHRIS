import React, { useEffect, useMemo, useState } from 'react';
import { LeavePolicy, LeaveType } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LeavePolicyModal from '../../components/admin/LeavePolicyModal';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../services/supabaseClient';
import { Permission } from '../../types';

const LeavePolicies: React.FC = () => {
    const { user } = useAuth();
    const { getVisibleEmployeeIds, can } = usePermissions();
    const canView = can('LeavePolicies', Permission.View);
    const canManage = can('LeavePolicies', Permission.Manage);
    const [policies, setPolicies] = useState<LeavePolicy[]>([]);
    const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedPolicy, setSelectedPolicy] = useState<LeavePolicy | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);
            const [{ data: ltRows, error: ltErr }, { data: polRows, error: polErr }] = await Promise.all([
                supabase.from('leave_types').select('id, name, paid, unit, min_increment, requires_doc_after_days').order('name'),
                supabase.from('leave_policies').select('id, leave_type_id, accrual_rule, carry_over_cap, allow_negative, default_entitlement, tiers'),
            ]);
            if (ltErr || polErr) {
                setError(ltErr?.message || polErr?.message || 'Failed to load leave policies.');
                setLoading(false);
                return;
            }
            const polMap = new Map<string, LeavePolicy>();
            (polRows || []).forEach((p: any) => {
                polMap.set(p.leave_type_id, {
                    id: p.id,
                    leaveTypeId: p.leave_type_id,
                    accrualRule: (p.accrual_rule as any) || 'none',
                    accrualRate: p.default_entitlement ?? p.accrual_rate ?? 0,
                    tiers: p.tiers || [],
                    carryOverCap: p.carry_over_cap ?? 0,
                    allowNegative: !!p.allow_negative,
                });
            });
            const types = (ltRows || []).map((t: any) => ({
                id: t.id,
                name: t.name,
                paid: !!t.paid,
                unit: t.unit,
                minIncrement: t.min_increment,
                requiresDocAfterDays: t.requires_doc_after_days,
            } as LeaveType));
            setLeaveTypes(types);

            const mergedPolicies: LeavePolicy[] = types.map(t => {
                const existing = polMap.get(t.id);
                return existing || {
                    id: '',
                    leaveTypeId: t.id,
                    accrualRule: 'none',
                    accrualRate: 0,
                    tiers: [],
                    carryOverCap: 0,
                    allowNegative: false,
                };
            });
            setPolicies(mergedPolicies);
            setLoading(false);
        };
        loadData();
    }, []);

    const handleOpenModal = (policy: LeavePolicy) => {
        setSelectedPolicy(policy);
        setIsModalOpen(true);
    };

    const handleSavePolicy = async (policyToSave: LeavePolicy) => {
        setError(null);
        if (!policyToSave.leaveTypeId) {
            alert('Missing leave type.');
            return;
        }
        const tiers = policyToSave.tiers || [];
        const defaultEntitlement = tiers.length === 0 ? policyToSave.accrualRate ?? 0 : null;

        if (policyToSave.id) {
            const { error: err } = await supabase.from('leave_policies').update({
                accrual_rule: policyToSave.accrualRule,
                carry_over_cap: policyToSave.carryOverCap,
                allow_negative: policyToSave.allowNegative,
                tiers,
                default_entitlement: defaultEntitlement,
            }).eq('id', policyToSave.id);
            if (err) {
                setError(err.message);
                return;
            }
            setPolicies(prev => prev.map(p => p.id === policyToSave.id ? { ...policyToSave } : p));
        } else {
            const { data, error: err } = await supabase.from('leave_policies').insert({
                leave_type_id: policyToSave.leaveTypeId,
                accrual_rule: policyToSave.accrualRule,
                carry_over_cap: policyToSave.carryOverCap,
                allow_negative: policyToSave.allowNegative,
                tiers,
                default_entitlement: defaultEntitlement,
            }).select('id').single();
            if (err) {
                setError(err.message);
                return;
            }
            setPolicies(prev => prev.map(p => p.leaveTypeId === policyToSave.leaveTypeId ? { ...policyToSave, id: data?.id || policyToSave.id } : p));
        }
        setIsModalOpen(false);
    };

    const entitlementText = (policy: LeavePolicy) => {
        if (policy.tiers && policy.tiers.length > 0) {
            if (policy.tiers.length === 1) return `${policy.tiers[0].entitlement} days / year`;
            const minEntitlement = Math.min(...policy.tiers.map(t => t.entitlement));
            const maxEntitlement = Math.max(...policy.tiers.map(t => t.entitlement));
            return `${minEntitlement} - ${maxEntitlement} days (Tiered)`;
        }
        return `${policy.accrualRate} days / year`;
    };

    if (!canView) {
        return (
            <Card>
                <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                    You do not have permission to view this page.
                </div>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Leave Policies</h1>
            </div>
            {error && (
                <Card>
                    <div className="p-3 text-sm text-red-600 dark:text-red-400">{error}</div>
                </Card>
            )}
            {loading && (
                <Card>
                    <div className="p-3 text-sm text-gray-600 dark:text-gray-300">Loading leave policies...</div>
                </Card>
            )}

            <Card>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Leave Type</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Paid</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Unit</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Accrual Rule</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Entitlement</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Carry-Over Cap</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Allow Negative</th>
                                <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {policies.map(policy => {
                                const leaveType = leaveTypes.find(lt => lt.id === policy.leaveTypeId);
                                return (
                                <tr key={policy.id || policy.leaveTypeId}>
                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white">{leaveType?.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{leaveType?.paid ? 'Yes' : 'No'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{leaveType?.unit}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{policy.accrualRule}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{entitlementText(policy)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{policy.carryOverCap ?? 0} days</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{policy.allowNegative ? 'Yes' : 'No'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        {canManage && <Button size="sm" onClick={() => handleOpenModal(policy)}>Edit</Button>}
                                    </td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </div>
            </Card>

            {selectedPolicy && (
                <LeavePolicyModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    policy={selectedPolicy}
                    onSave={handleSavePolicy}
                    leaveTypeName={leaveTypes.find(lt => lt.id === selectedPolicy.leaveTypeId)?.name || ''}
                />
            )}
        </div>
    );
};

export default LeavePolicies;
