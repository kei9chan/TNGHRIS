
import React, { useState } from 'react';
import { LeavePolicy, LeaveType, LeaveLedgerEntry, LeaveLedgerEntryType } from '../../types';
import { mockLeavePolicies, mockLeaveTypes, mockUsers, mockLeaveBalances, mockLeaveLedger } from '../../services/mockData';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import LeavePolicyModal from '../../components/admin/LeavePolicyModal';
import { logActivity } from '../../services/auditService';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';

const LeavePolicies: React.FC = () => {
    const { user } = useAuth();
    const { getVisibleEmployeeIds } = usePermissions();
    const [policies, setPolicies] = useState<LeavePolicy[]>(mockLeavePolicies);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedPolicy, setSelectedPolicy] = useState<LeavePolicy | null>(null);

    const handleOpenModal = (policy: LeavePolicy) => {
        setSelectedPolicy(policy);
        setIsModalOpen(true);
    };

    const handleSavePolicy = (policyToSave: LeavePolicy) => {
        setPolicies(prev => prev.map(p => p.id === policyToSave.id ? policyToSave : p));
        const index = mockLeavePolicies.findIndex(p => p.id === policyToSave.id);
        if (index !== -1) {
            mockLeavePolicies[index] = policyToSave;
        }
        setIsModalOpen(false);
    };

    const handleRunAccrual = () => {
        let accrualCount = 0;
        // Scope check: only run for accessible users
        const visibleIds = new Set(getVisibleEmployeeIds());
        const activeUsers = mockUsers.filter(u => u.status === 'Active' && visibleIds.has(u.id));

        activeUsers.forEach(employee => {
             // PHASE 3: Logic Implementation (The Accrual Engine)
             // 1. Check: Ensure employee.employmentStatus === 'Regular'
            if (employee.employmentStatus !== 'Regular') return;

            // 2. Calculate Rate: 5 days / 12 months = 0.4166...
            const accrualAmount = 5 / 12;

            policies.forEach(policy => {
                if (policy.accrualRule === 'monthly') {
                    // Determine which balance to update based on leave type ID
                    // lt1 = Vacation, lt2 = Sick
                    let balanceKey: 'vacation' | 'sick' | null = null;
                    if (policy.leaveTypeId === 'lt1') balanceKey = 'vacation';
                    else if (policy.leaveTypeId === 'lt2') balanceKey = 'sick';

                    if (balanceKey) {
                        // Ensure leaveInfo structure exists
                        if (!employee.leaveInfo) {
                            employee.leaveInfo = {
                                balances: { vacation: 0, sick: 0 },
                                accrualRate: 0,
                                lastCreditDate: new Date()
                            };
                        }
                        
                        // Update User Balance
                        employee.leaveInfo.balances[balanceKey] += accrualAmount;
                        employee.leaveInfo.lastCreditDate = new Date();

                        // Update Legacy Mock Balance (for compatibility with other components relying on it)
                        const legacyBalance = mockLeaveBalances.find(b => b.employeeId === employee.id && b.leaveTypeId === policy.leaveTypeId);
                        if (legacyBalance) {
                            legacyBalance.accrued += accrualAmount;
                        } else {
                             // If legacy balance doesn't exist, create it
                            mockLeaveBalances.push({
                                employeeId: employee.id,
                                leaveTypeId: policy.leaveTypeId,
                                opening: 0,
                                accrued: accrualAmount,
                                used: 0,
                                adjusted: 0
                            });
                        }

                        // 3. Update Ledger: Generate the ledger entry
                        const ledgerEntry: LeaveLedgerEntry = {
                            id: `ledger-${Date.now()}-${employee.id}-${policy.leaveTypeId}`,
                            employeeId: employee.id,
                            leaveTypeId: policy.leaveTypeId,
                            date: new Date(),
                            type: LeaveLedgerEntryType.Accrual,
                            change: accrualAmount,
                            balanceAfter: employee.leaveInfo.balances[balanceKey],
                            notes: `Monthly accrual (Regular: 5 days/yr).`
                        };
                        mockLeaveLedger.push(ledgerEntry);
                        accrualCount++;
                    }
                }
            });
        });
        
        logActivity(user, 'GENERATE', 'LeaveAccrual', 'all', `Ran monthly accrual for Regular employees. Generated ${accrualCount} entries.`);
        alert(`Accrual complete. ${accrualCount} entries generated for Regular employees (5 days/year rate).`);
    };

    const handleRunCarryOver = () => {
        let affectedUsers = 0;
        // Scope check: only run for accessible users
        const visibleIds = new Set(getVisibleEmployeeIds());
        
        mockUsers.filter(u => visibleIds.has(u.id)).forEach(employee => {
            let userAffected = false;
            policies.forEach(policy => {
                if (policy.carryOverCap >= 0) {
                    const balance = mockLeaveBalances.find(b => b.employeeId === employee.id && b.leaveTypeId === policy.leaveTypeId);
                    if (balance) {
                        const available = balance.opening + balance.accrued + balance.adjusted - balance.used;
                        if (available > policy.carryOverCap) {
                            const expiredAmount = available - policy.carryOverCap;
                            balance.opening = policy.carryOverCap;
                            mockLeaveLedger.push({
                                id: `ledger-co-exp-${Date.now()}-${employee.id}`, employeeId: employee.id, leaveTypeId: policy.leaveTypeId, date: new Date(),
                                type: LeaveLedgerEntryType.CarryOverExpired, change: -expiredAmount, balanceAfter: policy.carryOverCap, notes: 'Annual carry-over forfeiture.'
                            });
                        } else {
                            balance.opening = available;
                        }
                        
                        mockLeaveLedger.push({
                            id: `ledger-co-app-${Date.now()}-${employee.id}`, employeeId: employee.id, leaveTypeId: policy.leaveTypeId, date: new Date(),
                            type: LeaveLedgerEntryType.CarryOverApplied, change: 0, balanceAfter: balance.opening, notes: `New opening balance for the year.`
                        });

                        balance.accrued = 0;
                        balance.used = 0;
                        balance.adjusted = 0;
                        userAffected = true;
                    }
                }
            });
            if (userAffected) affectedUsers++;
        });

        logActivity(user, 'GENERATE', 'LeaveCarryOver', 'all', `Ran annual carry-over process for ${affectedUsers} employees.`);
        alert(`Annual carry-over process completed for ${affectedUsers} employees in your scope.`);
    };
    
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Leave Policies</h1>
                <div className="flex space-x-2">
                    <Button variant="secondary" onClick={handleRunAccrual}>Run Monthly Accrual</Button>
                    <Button variant="danger" onClick={handleRunCarryOver}>Run Annual Carry-Over</Button>
                </div>
            </div>

            <Card>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Leave Type</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Accrual Rule</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Entitlement Logic</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Carry-Over Cap</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Allow Negative</th>
                                <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {policies.map(policy => {
                                const leaveType = mockLeaveTypes.find(lt => lt.id === policy.leaveTypeId);
                                
                                let entitlementDisplay = `${policy.accrualRate} days / year (Legacy)`;

                                if (policy.tiers && policy.tiers.length > 0) {
                                    if (policy.tiers.length === 1) {
                                        entitlementDisplay = `${policy.tiers[0].entitlement} days / year`;
                                    } else {
                                        const minEntitlement = Math.min(...policy.tiers.map(t => t.entitlement));
                                        const maxEntitlement = Math.max(...policy.tiers.map(t => t.entitlement));
                                        entitlementDisplay = `${minEntitlement} - ${maxEntitlement} days (Tiered)`;
                                    }
                                }

                                return (
                                <tr key={policy.id}>
                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white">{leaveType?.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{policy.accrualRule}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{entitlementDisplay}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{policy.carryOverCap} days</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{policy.allowNegative ? 'Yes' : 'No'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <Button size="sm" onClick={() => handleOpenModal(policy)}>Edit</Button>
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
                />
            )}
        </div>
    );
};

export default LeavePolicies;
