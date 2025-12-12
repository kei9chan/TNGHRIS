
import React, { useState, useEffect, useMemo } from 'react';
import { User, EmployeeDraft, SalaryBreakdown, RateType, TaxStatus, EmploymentStatus } from '../../types';
import { mockLeaveTypes } from '../../services/mockData';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { supabase } from '../../services/supabaseClient';

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onSave: (updatedProfileData: Partial<User>) => void;
  onSaveDraft: (draftData: Partial<User>) => void;
  draft: EmployeeDraft | null;
  isAdminEdit?: boolean;
}

type Tab = 'personal' | 'gov' | 'emergency' | 'banking' | 'compensation' | 'leave';

const ProfileEditModal: React.FC<ProfileEditModalProps> = ({ isOpen, onClose, user, onSave, onSaveDraft, draft, isAdminEdit = false }) => {
  const [activeTab, setActiveTab] = useState<Tab>('personal');
  const [formData, setFormData] = useState<Partial<User>>({});
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [computedLeaves, setComputedLeaves] = useState<{
    usedVacation: number;
    usedSick: number;
    balanceVacation: number;
    balanceSick: number;
    accrualRate: number;
    lastCreditDate: Date | null;
  }>({
    usedVacation: 0,
    usedSick: 0,
    balanceVacation: 0,
    balanceSick: 0,
    accrualRate: 0,
    lastCreditDate: null,
  });

  useEffect(() => {
    if (isOpen) {
        const initialData = draft ? draft.draftData : {
            name: user.name,
            email: user.email,
            birthDate: user.birthDate,
            endDate: user.endDate,
            department: user.department,
            departmentId: user.departmentId,
            businessUnit: user.businessUnit,
            businessUnitId: user.businessUnitId,
            position: user.position,
            employmentStatus: user.employmentStatus || 'Probationary',
            rateType: user.rateType || RateType.Monthly,
            rateAmount: user.rateAmount ?? user.salary?.basic ?? 0,
            taxStatus: user.taxStatus || TaxStatus.Single,
            salary: user.salary || { basic: user.rateAmount ?? 0, deminimis: 0, reimbursable: 0 },
            leaveQuotaVacation: user.leaveQuotaVacation || 0,
            leaveQuotaSick: user.leaveQuotaSick || 0,
            leaveLastCreditDate: user.leaveLastCreditDate,
            sssNo: user.sssNo,
            pagibigNo: user.pagibigNo,
            philhealthNo: user.philhealthNo,
            tin: user.tin,
            emergencyContact: user.emergencyContact || { name: '', relationship: '', phone: '' },
            bankingDetails: user.bankingDetails || { bankName: '', accountNumber: '', accountType: 'Savings' },
            leaveInfo: user.leaveInfo || {
                balances: { vacation: 0, sick: 0 },
                accrualRate: 0
            }
        };
      setFormData(initialData);
      setActiveTab('personal');

      // Load leave requests for this employee to prefill Leave tab
      supabase
        .from('leave_requests')
        .select('id, leave_type_id, start_date, end_date, status, reason, duration_days, created_at, leave_types(name)')
        .eq('employee_id', user.id)
        .order('created_at', { ascending: false })
        .then(({ data }) => {
            if (data) {
                setLeaveRequests(data.map((row: any) => ({
                    id: row.id,
                    typeName: row.leave_types?.name || 'Leave',
                    startDate: row.start_date,
                    endDate: row.end_date,
                    status: row.status,
                    reason: row.reason,
                    duration: row.duration_days,
                })));
                // Compute balances and accrual rate from approved leaves
                const approved = data.filter((r: any) => r.status === 'Approved');
                let usedVac = 0, usedSick = 0;
                let firstDate: Date | null = null;
                let lastDate: Date | null = null;
                approved.forEach((r: any) => {
                    const d = r.duration_days || 0;
                    const name = (r.leave_types?.name || '').toLowerCase();
                    if (name.includes('vacation')) usedVac += d;
                    if (name.includes('sick')) usedSick += d;
                    const start = r.start_date ? new Date(r.start_date) : null;
                    if (start) firstDate = firstDate ? (start < firstDate ? start : firstDate) : start;
                    const end = r.end_date ? new Date(r.end_date) : null;
                    if (end) lastDate = lastDate ? (end > lastDate ? end : lastDate) : end;
                });
                const monthsActive = firstDate ? Math.max(1, ((new Date().getFullYear() - firstDate.getFullYear()) * 12 + (new Date().getMonth() - firstDate.getMonth()) + 1)) : 1;
                const accrualRate = (usedVac + usedSick) / monthsActive;
                const quotaVac = initialData.leaveQuotaVacation || 0;
                const quotaSick = initialData.leaveQuotaSick || 0;
                const balanceVacation = quotaVac - usedVac;
                const balanceSick = quotaSick - usedSick;
                setComputedLeaves({ usedVacation: usedVac, usedSick, balanceVacation, balanceSick, accrualRate, lastCreditDate: lastDate });
                setFormData(prev => ({
                  ...prev,
                  leaveInfo: {
                    ...(prev.leaveInfo || { balances: { vacation: 0, sick: 0 }, accrualRate: 0 }),
                    balances: { vacation: balanceVacation, sick: balanceSick },
                    accrualRate: accrualRate || 0,
                    lastCreditDate: prev.leaveLastCreditDate || lastDate || prev.leaveInfo?.lastCreditDate,
                  },
                  leaveLastCreditDate: prev.leaveLastCreditDate || lastDate || prev.leaveInfo?.lastCreditDate,
                }));
            } else {
                setLeaveRequests([]);
                setComputedLeaves({
                  usedVacation: 0,
                  usedSick: 0,
                  balanceVacation: initialData.leaveQuotaVacation || 0,
                  balanceSick: initialData.leaveQuotaSick || 0,
                  accrualRate: 0,
                  lastCreditDate: initialData.leaveLastCreditDate || null,
                });
            }
        })
        .catch(() => {
            setLeaveRequests([]);
            setComputedLeaves({
              usedVacation: 0,
              usedSick: 0,
              balanceVacation: initialData.leaveQuotaVacation || 0,
              balanceSick: initialData.leaveQuotaSick || 0,
              accrualRate: 0,
              lastCreditDate: initialData.leaveLastCreditDate || null,
            });
        });
    }
  }, [isOpen, user, draft]);

  // Keep leaveInfo balances in sync with editable quotas and computed usage
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      leaveInfo: {
        ...(prev.leaveInfo || { balances: { vacation: 0, sick: 0 }, accrualRate: 0 }),
        balances: {
          vacation: Math.max(0, (prev.leaveQuotaVacation ?? 0) - (computedLeaves.usedVacation || 0)),
          sick: Math.max(0, (prev.leaveQuotaSick ?? 0) - (computedLeaves.usedSick || 0)),
        },
        accrualRate: computedLeaves.accrualRate || 0,
        lastCreditDate: prev.leaveLastCreditDate || computedLeaves.lastCreditDate || prev.leaveInfo?.lastCreditDate,
      },
    }));
  }, [computedLeaves, formData.leaveQuotaVacation, formData.leaveQuotaSick]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'birthDate') {
        // keep as plain YYYY-MM-DD string for reliable DB writes
        setFormData(prev => ({ ...prev, [name]: value }));
    } else if (name === 'endDate') {
        const date = new Date(value);
        const userTimezoneOffset = date.getTimezoneOffset() * 60000;
        setFormData(prev => ({ ...prev, [name]: new Date(date.getTime() + userTimezoneOffset) }));
    } else {
        const isNumberField = e.target.type === 'number';
        setFormData(prev => ({ ...prev, [name]: isNumberField ? parseFloat(value) || 0 : value }));
    }
  };

  const handleNestedChange = (
    section: 'emergencyContact' | 'bankingDetails' | 'salary',
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    const isNumberField = section === 'salary';
    const parsedValue = isNumberField ? parseFloat(value) || 0 : value;

    setFormData(prev => ({
      ...prev,
      [section]: {
        ...(prev[section] as any),
        [name]: parsedValue,
      },
    }));
  };

  const handleLeaveChange = (section: 'balances' | 'root', name: string, value: string) => {
    let finalValue: any = value;
    const isNumber = !isNaN(parseFloat(value)) && isFinite(value as any);

    if (isNumber) {
        finalValue = parseFloat(value) || 0;
    } else if (name === 'lastCreditDate' && value) {
        const date = new Date(value);
        const userTimezoneOffset = date.getTimezoneOffset() * 60000;
        finalValue = new Date(date.getTime() + userTimezoneOffset);
    }

    setFormData(prev => {
        const newLeaveInfo = { ...(prev.leaveInfo || { balances: { vacation: 0, sick: 0 }, accrualRate: 0 }) };
        if (section === 'balances') {
            // Ensure balances object exists
            newLeaveInfo.balances = { ...newLeaveInfo.balances };
            (newLeaveInfo.balances as any)[name] = finalValue;
        } else { // root
            (newLeaveInfo as any)[name] = finalValue;
        }
        const base = { ...prev, leaveInfo: newLeaveInfo };
        if (name === 'lastCreditDate') {
          return { ...base, leaveLastCreditDate: finalValue };
        }
        return base;
    });
  };

  // Compute balances from quotas minus approved usage
  const getBalanceValue = (typeId: string) => {
      const quotaVac = formData.leaveQuotaVacation ?? 0;
      const quotaSick = formData.leaveQuotaSick ?? 0;
      const { usedVacation = 0, usedSick = 0 } = computedLeaves;
      if (typeId === 'lt1') return Math.max(0, quotaVac - usedVacation);
      if (typeId === 'lt2') return Math.max(0, quotaSick - usedSick);
      return '';
  };

  // Helper to map config ID back to User property name
  const getBalanceKey = (typeId: string) => {
      if (typeId === 'lt1') return 'vacation';
      if (typeId === 'lt2') return 'sick';
      return 'vacation'; // fallback
  };

  const totalSalary = useMemo(() => {
    if (!formData.salary) return 0;
    return (formData.rateAmount || formData.salary.basic || 0) + (formData.salary.deminimis || 0) + (formData.salary.reimbursable || 0);
  }, [formData.salary, formData.rateAmount]);

  const getTabClass = (tabName: Tab) => {
    return `px-4 py-2 text-sm font-medium rounded-md focus:outline-none transition-colors ${activeTab === tabName ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`;
  };

  const adminFooter = (
    <div className="flex justify-end w-full space-x-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSave(formData)}>Save Changes</Button>
    </div>
  );
  
  const selfServiceFooter = (
    <div className="flex justify-between items-center w-full">
        <Button variant="secondary" onClick={() => onSaveDraft(formData)}>Save Draft</Button>
        <div className="flex space-x-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave(formData)}>Submit for Approval</Button>
        </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isAdminEdit ? `Editing Profile for ${user.name}` : "Edit My Profile"}
      footer={isAdminEdit ? adminFooter : selfServiceFooter}
    >
      <div className="border-b border-gray-200 dark:border-gray-700 mb-4">
        <nav className="flex space-x-1 sm:space-x-2 flex-wrap" aria-label="Tabs">
          <button className={getTabClass('personal')} onClick={() => setActiveTab('personal')}>Personal Info</button>
          {isAdminEdit && <button className={getTabClass('compensation')} onClick={() => setActiveTab('compensation')}>Compensation</button>}
          {isAdminEdit && <button className={getTabClass('leave')} onClick={() => setActiveTab('leave')}>Leave</button>}
          <button className={getTabClass('gov')} onClick={() => setActiveTab('gov')}>Government IDs</button>
          <button className={getTabClass('emergency')} onClick={() => setActiveTab('emergency')}>Emergency</button>
          <button className={getTabClass('banking')} onClick={() => setActiveTab('banking')}>Banking</button>
        </nav>
      </div>
      
      <div className="space-y-4">
        {activeTab === 'personal' && (
          <div className="space-y-4">
            <Input label="Full Name" name="name" value={formData.name || ''} onChange={handleChange} />
            <Input label="Email Address" name="email" type="email" value={formData.email || ''} onChange={handleChange} />
            <Input label="Birth Date" name="birthDate" type="date" value={formData.birthDate ? (typeof formData.birthDate === 'string' ? formData.birthDate : new Date(formData.birthDate).toISOString().split('T')[0]) : ''} onChange={handleChange} />
            <Input label="Department" name="department" value={formData.department || ''} onChange={handleChange} disabled={!isAdminEdit} />
            <Input label="Position" name="position" value={formData.position || ''} onChange={handleChange} disabled={!isAdminEdit}/>
            {isAdminEdit && (
                <div>
                    <label className="block text-sm font-medium">Employment Status</label>
                    <select name="employmentStatus" value={formData.employmentStatus || 'Probationary'} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        <option value="Regular">Regular</option>
                        <option value="Probationary">Probationary</option>
                        <option value="Contractual">Contractual</option>
                    </select>
                </div>
            )}
            <Input label="End Date (for inactive employees)" name="endDate" type="date" value={formData.endDate ? new Date(formData.endDate).toISOString().split('T')[0] : ''} onChange={handleChange} disabled={!isAdminEdit}/>
          </div>
        )}
        {activeTab === 'compensation' && isAdminEdit && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Compensation Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium">Rate Type</label>
                <select name="rateType" value={formData.rateType || ''} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    {Object.values(RateType).map(rt => <option key={rt} value={rt}>{rt}</option>)}
                </select>
              </div>
              <Input label="Rate Amount" name="rateAmount" type="number" value={formData.rateAmount || ''} onChange={handleChange} />
            </div>
             <div>
                <label className="block text-sm font-medium">Tax Status</label>
                <select name="taxStatus" value={formData.taxStatus || ''} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    {Object.values(TaxStatus).map(ts => <option key={ts} value={ts}>{ts}</option>)}
                </select>
            </div>
            <div className="pt-4 border-t dark:border-gray-700 space-y-4">
              <h4 className="font-medium">Salary Breakdown</h4>
              <Input label="Deminimis" name="deminimis" type="number" value={formData.salary?.deminimis || ''} onChange={e => handleNestedChange('salary', e)} />
              <Input label="Reimbursable" name="reimbursable" type="number" value={formData.salary?.reimbursable || ''} onChange={e => handleNestedChange('salary', e)} />
            </div>
            <div className="p-2 bg-gray-100 dark:bg-gray-700/50 rounded-md flex justify-between items-center">
                <span className="font-semibold">Total Monthly Compensation:</span>
                <span className="font-bold text-lg">Php {totalSalary.toLocaleString()}</span>
            </div>
          </div>
        )}
        {activeTab === 'leave' && isAdminEdit && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Leave Quotas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Vacation Leave Quota (days)"
                name="leaveQuotaVacation"
                type="number"
                step="0.01"
                value={formData.leaveQuotaVacation ?? ''}
                onChange={handleChange}
              />
              <Input
                label="Sick Leave Quota (days)"
                name="leaveQuotaSick"
                type="number"
                step="0.01"
                value={formData.leaveQuotaSick ?? ''}
                onChange={handleChange}
              />
            </div>
            {leaveRequests.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Recent Leave Requests</h3>
                <div className="border rounded-md divide-y dark:border-gray-700">
                  {leaveRequests.slice(0, 5).map(lr => (
                    <div key={lr.id} className="p-3 text-sm text-gray-700 dark:text-gray-200">
                      <div className="font-semibold">{lr.typeName} &middot; {lr.status}</div>
                      <div>{lr.startDate} to {lr.endDate} ({lr.duration} days)</div>
                      {lr.reason && <div className="text-gray-500 dark:text-gray-400">Reason: {lr.reason}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Leave Balances (computed, days)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {mockLeaveTypes.map(type => (
                <Input
                  key={type.id}
                  label={`${type.name} Balance`}
                  name={type.id}
                  type="number"
                  step="0.01"
                  value={getBalanceValue(type.id)}
                  onChange={() => {}}
                  disabled
                />
              ))}
            </div>
            <div className="pt-4 border-t dark:border-gray-700 space-y-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Accrual Details</h3>
              <Input
                label="Leave Accrual Rate (days/month)"
                name="accrualRate"
                type="number"
                step="0.01"
                value={formData.leaveInfo?.accrualRate ?? computedLeaves.accrualRate ?? ''}
                onChange={() => {}}
                disabled
              />
              <Input
                label="Last Leave Credit Date"
                name="lastCreditDate"
                type="date"
                value={
                  (formData.leaveLastCreditDate ||
                    formData.leaveInfo?.lastCreditDate ||
                    computedLeaves.lastCreditDate)
                    ? new Date(
                        (formData.leaveLastCreditDate as any) ||
                        (formData.leaveInfo?.lastCreditDate as any) ||
                        (computedLeaves.lastCreditDate as any)
                      )
                        .toISOString()
                        .split('T')[0]
                    : ''
                }
                onChange={(e) => handleLeaveChange('root', 'lastCreditDate', e.target.value)}
              />
            </div>
          </div>
        )}
        {activeTab === 'gov' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="SSS Number" name="sssNo" value={formData.sssNo || ''} onChange={handleChange} />
            <Input label="Pag-IBIG Number" name="pagibigNo" value={formData.pagibigNo || ''} onChange={handleChange} />
            <Input label="PhilHealth Number" name="philhealthNo" value={formData.philhealthNo || ''} onChange={handleChange} />
            <Input label="TIN" name="tin" value={formData.tin || ''} onChange={handleChange} />
          </div>
        )}
        {activeTab === 'emergency' && (
          <div className="space-y-4">
            <Input label="Contact Name" name="name" value={formData.emergencyContact?.name || ''} onChange={e => handleNestedChange('emergencyContact', e)} />
            <Input label="Relationship" name="relationship" value={formData.emergencyContact?.relationship || ''} onChange={e => handleNestedChange('emergencyContact', e)} />
            <Input label="Phone Number" name="phone" type="tel" value={formData.emergencyContact?.phone || ''} onChange={e => handleNestedChange('emergencyContact', e)} />
          </div>
        )}
        {activeTab === 'banking' && (
          <div className="space-y-4">
            <Input label="Bank Name" name="bankName" value={formData.bankingDetails?.bankName || ''} onChange={e => handleNestedChange('bankingDetails', e)} />
            <Input label="Account Number" name="accountNumber" value={formData.bankingDetails?.accountNumber || ''} onChange={e => handleNestedChange('bankingDetails', e)} />
            <div>
              <label htmlFor="accountType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Account Type</label>
              <select id="accountType" name="accountType" value={formData.bankingDetails?.accountType || 'Savings'} onChange={e => handleNestedChange('bankingDetails', e)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <option>Savings</option>
                <option>Checking</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ProfileEditModal;
