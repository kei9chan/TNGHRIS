// Phase E: mockDataCompat removed from EmployeeProfile

import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { Memo, MemoAcknowledgement, User, ChangeHistory, ChangeHistoryStatus, EmployeeDraft, EmployeeDraftStatus, Permission } from '../../types';
import { logActivity } from '../../services/auditService';
import { F_SELF_SERVICE_ENABLED } from '../../constants';
import { db } from '../../services/db';
import { supabase } from '../../services/supabaseClient';
import { formatEmployeeName } from '../../services/formatEmployeeName';

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
import Card from '../../components/ui/Card';
import MemoViewModal from '../../components/feedback/MemoViewModal';
import Button from '../../components/ui/Button';

const EmployeeProfile: React.FC = () => {
    const { employeeId, userId } = useParams<{ employeeId?: string; userId?: string }>();
    const resolvedEmployeeId = employeeId || userId;
    const { user: currentUser } = useAuth();
    const { can } = usePermissions();
    const navigate = useNavigate();
    const location = useLocation();

    const [users, setUsers] = useState<User[]>([]);
    const [history, setHistory] = useState<ChangeHistory[]>([]);
    const [drafts, setDrafts] = useState<EmployeeDraft[]>([]);

    const [isEditModalOpen, setEditModalOpen] = useState(false);
    const [memos, setMemos] = useState<Memo[]>([]);
    const [isMemoViewOpen, setIsMemoViewOpen] = useState(false);
    const [selectedMemo, setSelectedMemo] = useState<Memo | null>(null);

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
            name: formatEmployeeName(
              row.full_name || row.name || `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unknown'
            ),
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

    const extractMemoBody = (row: any) => {
        const candidates = ['body', 'content', 'html', 'memo_body', 'memoBody', 'body_text', 'bodyHtml'];
        for (const key of candidates) {
            const val = row?.[key];
            if (typeof val === 'string' && val.trim().length > 0) return val as string;
        }
        return '';
    };

    const normalizeMemoSignatures = (raw: any): MemoAcknowledgement[] => {
        if (!Array.isArray(raw)) return [];
        return raw
            .map((entry: any) => ({
                userId: entry?.userId || entry?.user_id || '',
                signatureDataUrl: entry?.signatureDataUrl || entry?.signature_data_url,
                acknowledgedAt: entry?.acknowledgedAt
                    ? new Date(entry.acknowledgedAt)
                    : entry?.acknowledged_at
                    ? new Date(entry.acknowledged_at)
                    : undefined,
            }))
            .filter((entry: MemoAcknowledgement) => entry.userId);
    };

    const normalizeMemoTracker = (raw: any): string[] => {
        if (!Array.isArray(raw)) return [];
        return raw
            .map((entry: any) => (typeof entry === 'string' ? entry : entry?.userId || entry?.user_id))
            .filter(Boolean);
    };

    const mapMemoRow = (row: any): Memo => ({
        id: row.id,
        title: row.title,
        body: extractMemoBody(row),
        effectiveDate: row.effective_date ? new Date(row.effective_date) : new Date(),
        targetDepartments: row.target_departments || [],
        targetBusinessUnits: row.target_business_units || [],
        acknowledgementRequired: row.acknowledgement_required ?? false,
        tags: row.tags || [],
        attachments: row.attachments || [],
        acknowledgementTracker: normalizeMemoTracker(row.acknowledgement_tracker),
        acknowledgementSignatures: normalizeMemoSignatures(row.acknowledgement_signatures),
        status: row.status || 'Draft',
    });

    // Load user record from Supabase hris_users and merge into local state
    useEffect(() => {
        const loadUser = async () => {
            const targetId = resolvedEmployeeId || currentUser?.id;
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
    }, [resolvedEmployeeId, currentUser]);

    useEffect(() => {
        const loadMemos = async () => {
            try {
                const { data, error } = await supabase
                    .from('memos')
                    .select('*')
                    .order('effective_date', { ascending: false });
                if (error) throw error;
                setMemos((data || []).map(mapMemoRow));
            } catch (err) {
                console.warn('Failed to load memos', err);
            }
        };
        loadMemos();
    }, []);

    const userToView = useMemo(() => {
        const targetId = resolvedEmployeeId || currentUser?.id;
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
    }, [resolvedEmployeeId, currentUser, users]);

    useEffect(() => {
        if (!location.hash) return;
        const targetId = location.hash.replace('#', '');
        const scrollToTarget = () => {
            const target = document.getElementById(targetId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };
        const timeoutId = window.setTimeout(scrollToTarget, 0);
        return () => window.clearTimeout(timeoutId);
    }, [location.hash, userToView?.id]);

    const userHistory = useMemo(() => {
        if (!userToView) return [];
        return history.filter(h => h.employeeId === userToView.id);
    }, [userToView, history]);
    
    const userDraft = useMemo(() => {
        if (!userToView) return null;
        return drafts.find(d => d.employeeId === userToView.id && d.status !== EmployeeDraftStatus.Approved) || null;
    }, [userToView, drafts]);

    const acknowledgedMemos = useMemo(() => {
        if (!userToView) return [];
        const hasAcknowledged = (memo: Memo) => {
            const tracker = memo.acknowledgementTracker || [];
            const tracked = tracker.some(entry => {
                if (typeof entry === 'string') return entry === userToView.id;
                if (entry && typeof entry === 'object') return (entry as MemoAcknowledgement).userId === userToView.id;
                return false;
            });
            if (tracked) return true;
            return (memo.acknowledgementSignatures || []).some(sig => sig.userId === userToView.id);
        };
        return memos
            .filter(memo => memo.acknowledgementRequired && hasAcknowledged(memo))
            .sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());
    }, [memos, userToView]);
    
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

    const handleSaveDraft = async (draftData: Partial<User>) => {
        if (!userToView || !currentUser) return;
        await db.drafts.createOrUpdate(currentUser, userToView.id, draftData, EmployeeDraftStatus.Draft);
        // Re-read drafts from the live source after saving
        const { data } = await (supabase as any).from('employee_drafts').select('*').eq('employee_id', userToView.id);
        if (data) setDrafts(data as EmployeeDraft[]);
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
            const formatDateOnly = (d?: Date | string | null) => {
                if (!d) return null;
                if (typeof d === 'string') {
                    const clean = d.split('T')[0]?.trim();
                    return clean || null;
                }
                return new Date(d).toISOString().split('T')[0];
            };

            const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];
            const pushIfChanged = (field: string, oldValue: any, newValue: any) => {
                const oldJson = JSON.stringify(oldValue ?? null);
                const newJson = JSON.stringify(newValue ?? null);
                if (oldJson !== newJson) {
                    changes.push({ field, oldValue, newValue });
                }
            };

            pushIfChanged('name', userToView.name, updatedProfileData.name ?? userToView.name);
            pushIfChanged('email', userToView.email, updatedProfileData.email ?? userToView.email);
            pushIfChanged('position', userToView.position, updatedProfileData.position ?? userToView.position);
            pushIfChanged('department', userToView.department, updatedProfileData.department ?? userToView.department);
            pushIfChanged('businessUnit', userToView.businessUnit, updatedProfileData.businessUnit ?? userToView.businessUnit);
            pushIfChanged('birthDate', formatDateOnly(userToView.birthDate ?? null), formatDateOnly(updatedProfileData.birthDate ?? userToView.birthDate ?? null));

            if (changes.length === 0) {
                alert('No changes detected to submit.');
                return;
            }

            const submissionId =
                typeof crypto !== 'undefined' && 'randomUUID' in crypto
                    ? crypto.randomUUID()
                    : `submission-${Date.now()}`;
            const createdAt = new Date().toISOString();

            const rows = changes.map(change => ({
                employee_id: userToView.id,
                changed_by: currentUser.id,
                field: change.field,
                old_value: change.oldValue ?? null,
                new_value: change.newValue ?? null,
                status: ChangeHistoryStatus.Pending,
                submission_id: submissionId,
                created_at: createdAt,
            }));

            const { error } = await supabase.from('profile_change_requests').insert(rows);
            if (error) throw error;

            logActivity(currentUser, 'SUBMIT', 'EmployeeProfileChange', submissionId, 'Submitted profile changes for approval.');
            alert('Your changes have been submitted for approval.');
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
                    <div id="achievements">
                        <AchievementsCard employeeId={userToView.id} />
                    </div>
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

            <Card title="Acknowledged Memos">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Title</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Effective Date</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Acknowledged At</th>
                                <th scope="col" className="relative px-4 py-3"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {acknowledgedMemos.map(memo => {
                                const ack = (memo.acknowledgementSignatures || []).find(sig => sig.userId === userToView.id);
                                return (
                                    <tr key={memo.id}>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{memo.title}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(memo.effectiveDate).toLocaleDateString()}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {ack?.acknowledgedAt ? new Date(ack.acknowledgedAt).toLocaleDateString() : '—'}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <Button size="sm" variant="secondary" onClick={() => { setSelectedMemo(memo); setIsMemoViewOpen(true); }}>
                                                View
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {acknowledgedMemos.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="text-center py-6 text-gray-500 dark:text-gray-400">
                                        No acknowledged memos found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

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

            <MemoViewModal
                isOpen={isMemoViewOpen}
                onClose={() => setIsMemoViewOpen(false)}
                memo={selectedMemo}
            />
        </div>
    );
};

export default EmployeeProfile;
