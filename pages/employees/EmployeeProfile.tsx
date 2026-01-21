
import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { mockUsers, mockChangeHistory, mockEmployeeDrafts } from '../../services/mockData';
import { User, ChangeHistory, ChangeHistoryStatus, EmployeeDraft, EmployeeDraftStatus, Permission } from '../../types';
import { logActivity } from '../../services/auditService';
import { F_SELF_SERVICE_ENABLED } from '../../constants';
import { db } from '../../services/db';
import { supabase } from '../../services/supabaseClient';

import ProfileHeader from '../../components/employees/ProfileHeader';
import PersonalInformationCard from '../../components/employees/PersonalInformationCard';
import EmploymentDetailsCard from '../../components/employees/EmploymentDetailsCard';
import CompensationCard from '../../components/employees/CompensationCard';
import ChangeHistoryCard from '../../components/employees/ChangeHistoryCard';
import ProfileEditModal from '../../components/employees/ProfileEditModal';
import EmployeeDocumentsCard from '../../components/employees/EmployeeDocumentsCard';
import UserDocumentsManager from '../../components/employees/UserDocumentsManager';
import LeaveBalancesCard from '../../components/employees/LeaveBalancesCard';
import AchievementsCard from '../../components/employees/AchievementsCard';
import EmployeeAssetsCard from '../../components/employees/EmployeeAssetsCard';

const EmployeeProfile: React.FC = () => {
    const { employeeId } = useParams<{ employeeId: string }>();
    const { user: currentUser } = useAuth();
    const { can } = usePermissions();
    const navigate = useNavigate();

    const [users, setUsers] = useState<User[]>(mockUsers);
    const [history, setHistory] = useState<ChangeHistory[]>(mockChangeHistory);
    const [drafts, setDrafts] = useState<EmployeeDraft[]>(mockEmployeeDrafts);

    const [isEditModalOpen, setEditModalOpen] = useState(false);

    const mapHrisUser = (row: any): User => {
        const emergencyContact = row.emergency_contact
            || (row.emergency_contact_name || row.emergency_contact_phone || row.emergency_contact_relationship
                ? {
                    name: row.emergency_contact_name || '',
                    phone: row.emergency_contact_phone || '',
                    relationship: row.emergency_contact_relationship || '',
                }
                : undefined);

        const bankingDetails = row.banking_details
            || (row.bank_name || row.bank_account_number || row.bank_account_type
                ? {
                    bankName: row.bank_name || '',
                    accountNumber: row.bank_account_number || '',
                    accountType: row.bank_account_type || '',
                }
                : undefined);

        return {
            id: row.id,
            authUserId: row.auth_user_id || row.auth_userid || undefined,
            name: row.full_name || row.name || `${row.first_name || ''} ${row.last_name || ''}`.trim(),
            email: row.email || '',
            role: row.role,
            department: row.department || row.department_name || '',
            businessUnit: row.business_unit || row.business_unit_name || '',
            departmentId: row.department_id || undefined,
            businessUnitId: row.business_unit_id || undefined,
            status: (row.status as User['status']) || 'Active',
            position: row.position || row.role || '',
            reportsTo: row.reports_to || undefined,
            birthDate: row.birth_date ? new Date(row.birth_date) : undefined,
            dateHired: row.date_hired ? new Date(row.date_hired) : row.dateHired ? new Date(row.dateHired) : undefined,
            isPhotoEnrolled: !!row.is_photo_enrolled,
            signatureUrl: row.signature_url || undefined,
            profilePictureUrl: row.profile_picture_url || undefined,
            sssNo: row.sss_no || undefined,
            pagibigNo: row.pagibig_no || undefined,
            philhealthNo: row.philhealth_no || undefined,
            tin: row.tin || undefined,
            employmentStatus: row.employment_status || undefined,
            rateType: row.rate_type || undefined,
            rateAmount: row.rate_amount !== null && row.rate_amount !== undefined ? Number(row.rate_amount) : undefined,
            taxStatus: row.tax_status || undefined,
            salary: {
                basic: row.salary_basic !== null && row.salary_basic !== undefined ? Number(row.salary_basic) : 0,
                deminimis: row.salary_deminimis !== null && row.salary_deminimis !== undefined ? Number(row.salary_deminimis) : 0,
                reimbursable: row.salary_reimbursable !== null && row.salary_reimbursable !== undefined ? Number(row.salary_reimbursable) : 0,
            },
            leaveQuotaVacation: row.leave_quota_vacation ?? undefined,
            leaveQuotaSick: row.leave_quota_sick ?? undefined,
            leaveLastCreditDate: row.leave_last_credit_date ? new Date(row.leave_last_credit_date) : undefined,
            emergencyContact,
            bankingDetails,
            accessScope: row.access_scope || undefined,
        } as User;
    };

    // Load user record from Supabase hris_users and merge into local state
    useEffect(() => {
        const loadUser = async () => {
            const targetId = employeeId || currentUser?.id;
            const email = currentUser?.email;
            if (!targetId && !email) return;

            try {
                let query = supabase.from('hris_users').select('*').limit(1);
                if (targetId) {
                    query = query.eq('id', targetId);
                } else if (email) {
                    query = query.eq('email', email);
                }
                const { data, error } = await query;
                if (error || !data || data.length === 0) return;
                const mapped = mapHrisUser(data[0]);
                setUsers(prev => {
                    const rest = prev.filter(u => u.id !== mapped.id);
                    return [mapped, ...rest];
                });
            } catch (err) {
                console.warn('Failed to load hris_users record', err);
            }
        };
        loadUser();
    }, [employeeId, currentUser]);

    const userToView = useMemo(() => {
        const targetId = employeeId || currentUser?.id;
        // Prefer direct id match
        let found = users.find(u => u.id === targetId);
        // If not found, try authUserId (Supabase) or email match to align Supabase logins to legacy mock data
        if (!found && currentUser?.authUserId) {
            found = users.find(u => u.authUserId === currentUser.authUserId);
        }
        if (!found && currentUser?.email) {
            found = users.find(
                u => u.email.toLowerCase() === currentUser.email.toLowerCase()
            );
        }
        // As a last resort, show the current user object even if not in mock data so the page renders
        if (!found && currentUser && !employeeId) {
            return currentUser;
        }
        return found;
    }, [employeeId, currentUser, users]);

    const userHistory = useMemo(() => {
        if (!userToView) return [];
        return history.filter(h => h.employeeId === userToView.id);
    }, [userToView, history]);
    
    const userDraft = useMemo(() => {
        if (!userToView) return null;
        return drafts.find(d => d.employeeId === userToView.id && d.status !== EmployeeDraftStatus.Approved) || null;
    }, [userToView, drafts]);
    
    useEffect(() => {
        if (!userToView && employeeId) { // Only redirect when an explicit employeeId was requested
            navigate('/employees/list', { replace: true });
        }
    }, [userToView, navigate, employeeId]);
    
    if (!userToView) {
        return <div>Loading profile...</div>;
    }
    
    const isMyProfile = userToView.id === currentUser?.id;
    const canEditProfile = (isMyProfile && F_SELF_SERVICE_ENABLED) || can('Employees', Permission.Edit);
    const canAdminEdit = can('Employees', Permission.Edit);

    const handleSaveDraft = (draftData: Partial<User>) => {
        if (!userToView || !currentUser) return;
        
        db.drafts.createOrUpdate(currentUser, userToView.id, draftData, EmployeeDraftStatus.Draft);

        setDrafts([...mockEmployeeDrafts]);
        setEditModalOpen(false);
        alert('Draft saved!');
    };
    
    const updateSupabaseUser = async (userId: string, data: Partial<User>) => {
        const formatDateOnly = (d?: Date | string | null) => {
            if (!d) return null;
            if (typeof d === 'string') {
                const clean = d.split('T')[0]?.trim();
                if (!clean) return null;
                if (clean.includes('/')) {
                    const parts = clean.split('/');
                    if (parts.length === 3) {
                        const [p1, p2, p3] = parts;
                        const normalized = `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
                        return normalized;
                    }
                }
                return clean;
            }
            return new Date(d).toISOString().split('T')[0];
        };

        const payload: Record<string, any> = {
            full_name: data.name,
            email: data.email,
            role: data.role,
            status: data.status,
            department: data.department,
            department_id: data.departmentId,
            business_unit: data.businessUnit,
            business_unit_id: data.businessUnitId,
            position: data.position,
            reports_to: data.reportsTo,
            birth_date: formatDateOnly(data.birthDate ?? userToView.birthDate ?? null),
            sss_no: data.sssNo,
            pagibig_no: data.pagibigNo,
            philhealth_no: data.philhealthNo,
            tin: data.tin,
            employment_status: data.employmentStatus,
            rate_type: data.rateType,
            rate_amount: data.rateAmount,
            tax_status: data.taxStatus,
            salary_basic: data.salary?.basic,
            salary_deminimis: data.salary?.deminimis,
            salary_reimbursable: data.salary?.reimbursable,
            leave_quota_vacation: data.leaveQuotaVacation ?? null,
            leave_quota_sick: data.leaveQuotaSick ?? null,
            leave_last_credit_date: formatDateOnly(data.leaveLastCreditDate ?? userToView.leaveLastCreditDate ?? null),
            emergency_contact_name: data.emergencyContact?.name,
            emergency_contact_relationship: data.emergencyContact?.relationship,
            emergency_contact_phone: data.emergencyContact?.phone,
            bank_name: data.bankingDetails?.bankName,
            bank_account_number: data.bankingDetails?.accountNumber,
            bank_account_type: data.bankingDetails?.accountType,
            date_hired: formatDateOnly(data.dateHired ?? userToView.dateHired ?? null),
        };
        const { data: updated, error } = await supabase
            .from('hris_users')
            .update(payload)
            .eq('id', userId)
            .select()
            .single();
        if (error) throw error;
        return updated ? mapHrisUser(updated) : null;
    };
    
    const handleSubmitForApproval = async (updatedProfileData: Partial<User>) => {
        if (!userToView || !currentUser) return;

        try {
            const updated = await updateSupabaseUser(userToView.id, updatedProfileData);
            if (updated) {
                setUsers(prev => {
                    const rest = prev.filter(u => u.id !== updated.id);
                    return [updated, ...rest];
                });
            }
            logActivity(currentUser, 'UPDATE', 'EmployeeProfile', userToView.id, 'Updated profile.');
            alert('Your changes have been submitted.');
        } catch (err: any) {
            alert(err?.message || 'Failed to submit changes.');
        }
        setEditModalOpen(false);
    };

    const handleAdminSave = async (updatedProfileData: Partial<User>) => {
        if (!userToView || !currentUser) return;
        
        try {
            const updated = await updateSupabaseUser(userToView.id, updatedProfileData);
            if (updated) {
                setUsers(prev => {
                    const rest = prev.filter(u => u.id !== updated.id);
                    return [updated, ...rest];
                });
            }
            alert('Profile updated successfully.');
        } catch (err: any) {
            alert(err?.message || 'Failed to update profile.');
        }
        setEditModalOpen(false);
    };

    return (
        <div className="space-y-6">
            <ProfileHeader 
                user={userToView}
                onEditClick={() => setEditModalOpen(true)}
                canEdit={canEditProfile}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <EmploymentDetailsCard user={userToView} />
                    
                    <EmployeeAssetsCard employeeId={userToView.id} isMyProfile={isMyProfile} />

                    <CompensationCard user={userToView} />
                    <LeaveBalancesCard user={userToView} />
                    <AchievementsCard employeeId={userToView.id} />
                </div>
                <div className="lg:col-span-1">
                    <PersonalInformationCard user={userToView} />
                </div>
            </div>
            
            <UserDocumentsManager employeeId={userToView.id} isMyProfile={isMyProfile} />

            <EmployeeDocumentsCard 
                employeeId={userToView.id}
                title="Contracts & Agreements"
                documentTypes={['Contract']}
            />

            <EmployeeDocumentsCard 
                employeeId={userToView.id}
                title="Certificates"
                documentTypes={['Certificate of Employment']}
            />

            <EmployeeDocumentsCard 
                employeeId={userToView.id}
                title="Personnel Action Notices"
                documentTypes={['Personnel Action Notice']}
            />

            <EmployeeDocumentsCard 
                employeeId={userToView.id}
                title="Disciplinary Documents"
                documentTypes={['Notice to Explain', 'Notice of Decision']}
            />

            <ChangeHistoryCard history={userHistory} />
            
            {isEditModalOpen && (
                <ProfileEditModal 
                    isOpen={isEditModalOpen}
                    onClose={() => setEditModalOpen(false)}
                    user={userToView}
                    onSave={canAdminEdit && !isMyProfile ? handleAdminSave : handleSubmitForApproval}
                    onSaveDraft={handleSaveDraft}
                    draft={userDraft}
                    isAdminEdit={canAdminEdit && !isMyProfile}
                />
            )}
        </div>
    );
};

export default EmployeeProfile;
