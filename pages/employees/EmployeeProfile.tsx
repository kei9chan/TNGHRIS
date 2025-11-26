
import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { mockUsers, mockChangeHistory, mockEmployeeDrafts } from '../../services/mockData';
import { User, ChangeHistory, ChangeHistoryStatus, EmployeeDraft, EmployeeDraftStatus, Permission } from '../../types';
import { logActivity } from '../../services/auditService';
import { F_SELF_SERVICE_ENABLED } from '../../constants';
import { db } from '../../services/db';

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

    // Polling to ensure Profile reflects changes made in other modules (like Leave Management or Admin)
    useEffect(() => {
        const interval = setInterval(() => {
            // We create a new array reference to force React to detect changes if deep properties changed
            // This is a simple check, in real apps we'd use better state management or events
            if (JSON.stringify(mockUsers) !== JSON.stringify(users)) {
                setUsers([...mockUsers]);
            }
            if (mockChangeHistory.length !== history.length) {
                setHistory([...mockChangeHistory]);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [users, history]);

    const userToView = useMemo(() => {
        const targetId = employeeId || currentUser?.id;
        return users.find(u => u.id === targetId);
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
        if (!userToView && (employeeId || currentUser)) { // check if user was looked for but not found
            navigate('/employees/list', { replace: true });
        }
    }, [userToView, navigate, employeeId, currentUser]);
    
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
    
    const handleSubmitForApproval = (updatedProfileData: Partial<User>) => {
        if (!userToView || !currentUser) return;

        const changes: ChangeHistory[] = [];
        const submissionId = `sub-${Date.now()}`;

        Object.keys(updatedProfileData).forEach(key => {
            const field = key as keyof User;
            const oldValue = userToView[field];
            const newValue = updatedProfileData[field];
            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                changes.push({
                    id: `ch-${submissionId}-${field}`,
                    employeeId: userToView.id,
                    timestamp: new Date(),
                    changedBy: currentUser.id,
                    field: key,
                    oldValue: JSON.stringify(oldValue),
                    newValue: JSON.stringify(newValue),
                    status: ChangeHistoryStatus.Pending,
                    submissionId: submissionId,
                });
            }
        });

        if (changes.length > 0) {
            mockChangeHistory.unshift(...changes);
            setHistory([...mockChangeHistory]);
            
            db.drafts.createOrUpdate(
                currentUser, 
                userToView.id, 
                updatedProfileData, 
                EmployeeDraftStatus.Submitted,
                submissionId
            );

            setDrafts([...mockEmployeeDrafts]);
            logActivity(currentUser, 'UPDATE', 'EmployeeProfile', userToView.id, 'Submitted profile changes for approval.');
            alert('Your changes have been submitted for HR approval.');
        }

        setEditModalOpen(false);
    };

    const handleAdminSave = (updatedProfileData: Partial<User>) => {
        if (!userToView || !currentUser) return;
        
        db.users.update(currentUser, userToView.id, updatedProfileData);
        
        setUsers([...mockUsers]);
        alert('Profile updated successfully.');
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
