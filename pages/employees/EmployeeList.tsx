
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import { mockUsers, mockChangeHistory, mockUserDocuments, mockBusinessUnits } from '../../services/mockData';
import { User, Permission, ChangeHistory, ChangeHistoryStatus, Role, UserDocument, UserDocumentStatus } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import EmployeeTable from '../../components/employees/EmployeeTable';
import ProfileEditModal from '../../components/employees/ProfileEditModal';
import { useAuth } from '../../hooks/useAuth';
import HRReviewQueue from '../admin/HRReviewQueue';
import EditableDescription from '../../components/ui/EditableDescription';
import { supabase } from '../../services/supabaseClient';

const EmployeeList: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { can, getAccessibleBusinessUnits } = usePermissions();
  const { user: currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [buFilter, setBuFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Active' | 'Inactive' | ''>('');
  
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  
  const queryParams = new URLSearchParams(location.search);
  const initialTab = queryParams.get('tab') === 'review' ? 'review' : 'list';
  const [activeTab, setActiveTab] = useState(initialTab);

  const [businessUnits, setBusinessUnits] = useState(mockBusinessUnits);
  const accessibleBus = useMemo(() => getAccessibleBusinessUnits(businessUnits), [getAccessibleBusinessUnits, businessUnits]);

  useEffect(() => {
      const params = new URLSearchParams(location.search);
      const tab = params.get('tab');
      if (tab === 'review') {
          setActiveTab('review');
      } else if (tab === 'list') {
          setActiveTab('list');
      }
  }, [location.search]);
  
  // State to ensure reactivity to mock data changes
  const [changeHistory] = useState<ChangeHistory[]>(mockChangeHistory);
  const [users, setUsers] = useState<User[]>([]);
  const [userDocuments] = useState<UserDocument[]>(mockUserDocuments);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase
          .from('hris_users')
          .select('id, full_name, email, role, status, business_unit, business_unit_id, department, department_id, position, birth_date, date_hired, sss_no, pagibig_no, philhealth_no, tin, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, bank_name, bank_account_number, bank_account_type, leave_quota_vacation, leave_quota_sick, leave_last_credit_date, employment_status, rate_type, rate_amount, tax_status, salary_basic, salary_deminimis, salary_reimbursable');
        if (data) {
          const mapped: User[] = data.map((u: any) => ({
            id: u.id,
            name: u.full_name || u.email,
            email: u.email,
            role: (u.role as Role) || Role.Employee,
            department: u.department || '',
            businessUnit: u.business_unit || '',
            departmentId: u.department_id || undefined,
            businessUnitId: u.business_unit_id || undefined,
            status: (u.status as 'Active' | 'Inactive') || 'Active',
            isPhotoEnrolled: false,
            birthDate: u.birth_date ? new Date(u.birth_date) : undefined,
            dateHired: u.date_hired ? new Date(u.date_hired) : new Date(),
            position: u.position || '',
            leaveQuotaVacation: u.leave_quota_vacation ?? undefined,
            leaveQuotaSick: u.leave_quota_sick ?? undefined,
            leaveLastCreditDate: u.leave_last_credit_date ? new Date(u.leave_last_credit_date) : undefined,
            employmentStatus: u.employment_status || undefined,
            rateType: u.rate_type || undefined,
            rateAmount: u.rate_amount !== null && u.rate_amount !== undefined ? Number(u.rate_amount) : undefined,
            taxStatus: u.tax_status || undefined,
            salary: {
              basic: u.salary_basic !== null && u.salary_basic !== undefined ? Number(u.salary_basic) : 0,
              deminimis: u.salary_deminimis !== null && u.salary_deminimis !== undefined ? Number(u.salary_deminimis) : 0,
              reimbursable: u.salary_reimbursable !== null && u.salary_reimbursable !== undefined ? Number(u.salary_reimbursable) : 0,
            },
            sssNo: u.sss_no || '',
            pagibigNo: u.pagibig_no || '',
            philhealthNo: u.philhealth_no || '',
            tin: u.tin || '',
            emergencyContact: {
              name: u.emergency_contact_name || '',
              relationship: u.emergency_contact_relationship || '',
              phone: u.emergency_contact_phone || '',
            },
            bankingDetails: {
              bankName: u.bank_name || '',
              accountNumber: u.bank_account_number || '',
              accountType: (u.bank_account_type as any) || 'Savings',
            },
          }));
          setUsers(mapped);
        } else {
          setUsers(mockUsers);
        }
      } catch {
        setUsers(mockUsers);
      }

      try {
        const { data: buRows } = await supabase.from('business_units').select('id, name, code, color');
        if (buRows) {
          setBusinessUnits(buRows.map((b: any) => ({
            id: b.id,
            name: b.name,
            code: b.code,
            color: b.color || '#4F46E5',
          })));
        } else {
          setBusinessUnits(mockBusinessUnits);
        }
      } catch {
        setBusinessUnits(mockBusinessUnits);
      }
    };
    load();
  }, []);

  const departments = useMemo(() => [...new Set(users.map(u => u.department))].sort(), [users]);

  const accessControl = useMemo(() => {
    const role = currentUser?.role;
    const base = { canView: false, canEdit: false, scope: 'none' as 'none' | 'global' | 'buDept' | 'bu' | 'team' | 'logs' };
    switch (role) {
      case Role.Admin:
      case Role.HRManager:
      case Role.HRStaff:
      case Role.Recruiter:
        return { canView: true, canEdit: true, scope: 'global' as const };
      case Role.BOD:
        return { canView: true, canEdit: false, scope: 'global' as const };
      case Role.GeneralManager:
        return { canView: true, canEdit: false, scope: 'buDept' as const };
      case Role.OperationsDirector:
      case Role.BusinessUnitManager:
        return { canView: true, canEdit: false, scope: 'bu' as const };
      case Role.Manager:
        return { canView: true, canEdit: false, scope: 'team' as const };
      case Role.Auditor:
        return { canView: true, canEdit: false, scope: 'logs' as const };
      default:
        return base; // Employee, Finance, IT, etc. -> no view
    }
  }, [currentUser]);
  
  // Filter users based on RBAC scope + UI filters
  const filteredUsers = useMemo(() => {
    const accessibleBuNames = accessibleBus.length ? new Set(accessibleBus.map(b => b.name)) : null;
    const scope = accessControl.scope;

    const withinScope = (user: User) => {
      if (!accessControl.canView) return false;
      if (scope === 'global' || scope === 'logs') return true;
      if (scope === 'buDept') {
        const buOk = !currentUser?.businessUnit || user.businessUnit === currentUser.businessUnit;
        const deptOk = !currentUser?.department || user.department === currentUser.department;
        return buOk && deptOk;
      }
      if (scope === 'bu') {
        return !currentUser?.businessUnit || user.businessUnit === currentUser.businessUnit;
      }
      if (scope === 'team') {
        // Prefer explicit managerId; fallback to same dept
        if (user.managerId && currentUser?.id) return user.managerId === currentUser.id;
        return !!currentUser?.department && user.department === currentUser.department;
      }
      return false;
    };

    return users
      .filter(user => {
        if (!accessibleBuNames) return true;
        if (!user.businessUnit) return true;
        return accessibleBuNames.has(user.businessUnit);
      })
      .filter(withinScope)
      .filter(user => {
        const nameMatch = user.name.toLowerCase().includes(searchTerm.toLowerCase());
        const buMatch = !buFilter || user.businessUnit === buFilter;
        const deptMatch = !departmentFilter || user.department === departmentFilter;
        const statusMatch = !statusFilter || user.status === statusFilter;
        return nameMatch && buMatch && deptMatch && statusMatch;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [searchTerm, buFilter, departmentFilter, statusFilter, accessibleBus, users, accessControl, currentUser]);

  const pendingReviewCount = useMemo(() => {
    const pendingChangeSubmissions = new Set(
        changeHistory
            .filter(c => c.status === ChangeHistoryStatus.Pending)
            .map(c => c.submissionId)
    ).size;
    
    const pendingUserRegistrations = users.filter(
        u => u.status === 'Inactive' && u.role === Role.Employee
    ).length;
    
    const pendingDocumentSubmissions = userDocuments.filter(
        d => d.status === UserDocumentStatus.Pending
    ).length;

    return pendingChangeSubmissions + pendingUserRegistrations + pendingDocumentSubmissions;
  }, [changeHistory, users, userDocuments]);

  const handleView = (userId: string) => {
    navigate(`/employees/view/${userId}`);
  };

  const handleEdit = (user: User) => {
    if (can('Employees', Permission.Edit) && accessControl.canEdit) {
        setUserToEdit(user);
        setEditModalOpen(true);
    } else {
        alert("You don't have permission to edit this user.");
    }
  };
  
  const handleCloseModal = () => {
      setEditModalOpen(false);
      setUserToEdit(null);
  };
  
  const handleAdminSave = async (updatedProfileData: Partial<User>) => {
      if (!userToEdit) return;

      const formatDateOnly = (d?: Date | string | null) => {
        if (!d) return null;
        if (typeof d === 'string') {
          const clean = d.split('T')[0]?.trim();
          if (!clean) return null;
          // Support dd/mm/yyyy or mm/dd/yyyy if user types it
          if (clean.includes('/')) {
            const parts = clean.split('/');
            if (parts.length === 3) {
              const [p1, p2, p3] = parts;
              // assume dd/mm/yyyy
              const normalized = `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
              return normalized;
            }
          }
          return clean;
        }
        return new Date(d).toISOString().split('T')[0];
      };
      const birthDateValue = updatedProfileData.birthDate ?? userToEdit.birthDate ?? null;
      const hireDateValue = updatedProfileData.dateHired ?? userToEdit.dateHired ?? null;

      const payload: any = {
        full_name: updatedProfileData.name,
        email: updatedProfileData.email,
        department: updatedProfileData.department,
        department_id: updatedProfileData.departmentId,
        business_unit: updatedProfileData.businessUnit,
        business_unit_id: updatedProfileData.businessUnitId,
        position: updatedProfileData.position,
        birth_date: formatDateOnly(birthDateValue),
        date_hired: formatDateOnly(hireDateValue),
        status: updatedProfileData.status,
        employment_status: updatedProfileData.employmentStatus,
        rate_type: updatedProfileData.rateType,
        rate_amount: updatedProfileData.rateAmount,
        tax_status: updatedProfileData.taxStatus,
        salary_basic: updatedProfileData.salary?.basic,
        salary_deminimis: updatedProfileData.salary?.deminimis,
        salary_reimbursable: updatedProfileData.salary?.reimbursable,
        sss_no: updatedProfileData.sssNo,
        pagibig_no: updatedProfileData.pagibigNo,
        philhealth_no: updatedProfileData.philhealthNo,
        tin: updatedProfileData.tin,
        emergency_contact_name: updatedProfileData.emergencyContact?.name,
        emergency_contact_relationship: updatedProfileData.emergencyContact?.relationship,
        emergency_contact_phone: updatedProfileData.emergencyContact?.phone,
        bank_name: updatedProfileData.bankingDetails?.bankName,
        bank_account_number: updatedProfileData.bankingDetails?.accountNumber,
        bank_account_type: updatedProfileData.bankingDetails?.accountType,
        leave_quota_vacation: updatedProfileData.leaveQuotaVacation ?? null,
        leave_quota_sick: updatedProfileData.leaveQuotaSick ?? null,
        leave_last_credit_date: formatDateOnly(updatedProfileData.leaveLastCreditDate ?? null),
      };

      // Remove undefined to avoid overwriting with null
      Object.keys(payload).forEach((key) => {
        if (payload[key] === undefined) delete payload[key];
      });

      const { error, data: updatedRows } = await supabase
        .from('hris_users')
        .update(payload)
        .eq('id', userToEdit.id)
        .select('*');

      if (error) {
        console.error('Error updating user', error);
        alert('Failed to update profile.');
        return;
      }
      if (!updatedRows || updatedRows.length === 0) {
        console.warn('No rows returned from update; check RLS or payload', payload);
      }

      // Refresh list to reflect updates
      const refreshed = await supabase
        .from('hris_users')
        .select('id, full_name, email, role, status, business_unit, business_unit_id, department, department_id, position, birth_date, date_hired, sss_no, pagibig_no, philhealth_no, tin, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, bank_name, bank_account_number, bank_account_type, leave_quota_vacation, leave_quota_sick, leave_last_credit_date, employment_status, rate_type, rate_amount, tax_status, salary_basic, salary_deminimis, salary_reimbursable');
      if (!refreshed.error && refreshed.data) {
        const mapped: User[] = refreshed.data.map((u: any) => ({
          id: u.id,
          name: u.full_name || u.email,
          email: u.email,
          role: (u.role as Role) || Role.Employee,
          department: u.department || '',
          businessUnit: u.business_unit || '',
          departmentId: u.department_id || undefined,
          businessUnitId: u.business_unit_id || undefined,
          status: (u.status as 'Active' | 'Inactive') || 'Active',
          isPhotoEnrolled: false,
          birthDate: u.birth_date ? new Date(u.birth_date) : undefined,
          dateHired: u.date_hired ? new Date(u.date_hired) : new Date(),
          position: u.position || '',
          employmentStatus: u.employment_status || undefined,
          rateType: u.rate_type || undefined,
          rateAmount: u.rate_amount !== null && u.rate_amount !== undefined ? Number(u.rate_amount) : undefined,
          taxStatus: u.tax_status || undefined,
          salary: {
            basic: u.salary_basic !== null && u.salary_basic !== undefined ? Number(u.salary_basic) : 0,
            deminimis: u.salary_deminimis !== null && u.salary_deminimis !== undefined ? Number(u.salary_deminimis) : 0,
            reimbursable: u.salary_reimbursable !== null && u.salary_reimbursable !== undefined ? Number(u.salary_reimbursable) : 0,
          },
          leaveQuotaVacation: u.leave_quota_vacation ?? undefined,
          leaveQuotaSick: u.leave_quota_sick ?? undefined,
          leaveLastCreditDate: u.leave_last_credit_date ? new Date(u.leave_last_credit_date) : undefined,
          sssNo: u.sss_no || '',
          pagibigNo: u.pagibig_no || '',
          philhealthNo: u.philhealth_no || '',
          tin: u.tin || '',
          emergencyContact: {
            name: u.emergency_contact_name || '',
            relationship: u.emergency_contact_relationship || '',
            phone: u.emergency_contact_phone || '',
          },
          bankingDetails: {
            bankName: u.bank_name || '',
            accountNumber: u.bank_account_number || '',
            accountType: u.bank_account_type || 'Savings',
          },
          leaveInfo: {
            balances: { vacation: 0, sick: 0 },
            accrualRate: 0,
          },
        }));
        setUsers(mapped);
      }

      handleCloseModal();
      alert(`Profile for ${userToEdit.name} updated.`);
  };
  
  const handleTabChange = (tab: string) => {
      setActiveTab(tab);
      navigate(`?tab=${tab}`, { replace: true });
  };
  
  const tabClass = (tabName: string) =>
    `flex items-center whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
      activeTab === tabName
        ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
    }`;

  return (
    <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Employee Management</h1>
        
        <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                <button onClick={() => handleTabChange('list')} className={tabClass('list')}>
                    Employee List
                </button>
                {(currentUser?.role === Role.HRManager || currentUser?.role === Role.HRStaff) && (
                  <button onClick={() => handleTabChange('review')} className={tabClass('review')}>
                      HR Review Queue
                      {pendingReviewCount > 0 && (
                          <span className="ml-2 inline-flex items-center justify-center h-6 w-6 rounded-full bg-red-500 text-xs font-bold text-white">
                              {pendingReviewCount}
                          </span>
                      )}
                  </button>
                )}
            </nav>
        </div>

        {activeTab === 'list' && (
            <>
                <EditableDescription descriptionKey="employeeListDesc" className="mt-1" />
                <Card>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
                        <Input label="Search by Name" id="search-name" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="e.g., John Doe" />
                        <div>
                            <label htmlFor="bu-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                            <select id="bu-filter" value={buFilter} onChange={e => setBuFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                                <option value="">All Accessible</option>
                                {accessibleBus.map(bu => <option key={bu.id} value={bu.name}>{bu.name}</option>)}
                            </select>
                        </div>
                         <div>
                            <label htmlFor="dept-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Department</label>
                            <select id="dept-filter" value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                                <option value="">All</option>
                                {departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                            </select>
                        </div>
                         <div>
                            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                            <select id="status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                                <option value="">All</option>
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                            </select>
                        </div>
                    </div>
                </Card>
                <Card>
                    <EmployeeTable users={filteredUsers} onView={handleView} onEdit={handleEdit} />
                </Card>
            </>
        )}

        {activeTab === 'review' && (
            <HRReviewQueue />
        )}
        
        {isEditModalOpen && userToEdit && (
            <ProfileEditModal 
                isOpen={isEditModalOpen}
                onClose={handleCloseModal}
                user={userToEdit}
                onSave={handleAdminSave}
                onSaveDraft={() => {}} // No-op for admin edit
                draft={null}
                isAdminEdit={true}
            />
        )}
    </div>
  );
};

export default EmployeeList;
