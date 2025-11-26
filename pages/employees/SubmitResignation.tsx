import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Resignation, ResignationStatus, NotificationType } from '../../types';
import { mockResignations, mockNotifications, mockUsers } from '../../services/mockData';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import Button from '../../components/ui/Button';
import { logActivity } from '../../services/auditService';

const SubmitResignation: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    
    const [existingResignation, setExistingResignation] = useState<Resignation | null>(null);
    const [lastWorkingDay, setLastWorkingDay] = useState('');
    const [reason, setReason] = useState('');
    const [attachmentUrl, setAttachmentUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (user) {
            const found = mockResignations.find(r => r.employeeId === user.id && r.status === ResignationStatus.ReturnedForEdits);
            if (found) {
                setExistingResignation(found);
                setLastWorkingDay(new Date(found.lastWorkingDay).toISOString().split('T')[0]);
                setReason(found.reason);
                setAttachmentUrl(found.attachmentUrl || '');
            }
        }
    }, [user]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        if (!lastWorkingDay || !reason) {
            alert('Please provide your last working day and a reason for resignation.');
            return;
        }

        setIsSubmitting(true);

        if (existingResignation) {
            // Update existing resignation
            const resIndex = mockResignations.findIndex(r => r.id === existingResignation.id);
            if (resIndex > -1) {
                mockResignations[resIndex] = {
                    ...mockResignations[resIndex],
                    lastWorkingDay: new Date(lastWorkingDay),
                    reason,
                    attachmentUrl,
                    status: ResignationStatus.PendingHRReview,
                    submissionDate: new Date(),
                    rejectionReason: undefined,
                };
            }
            logActivity(user, 'UPDATE', 'Resignation', existingResignation.id, `Resubmitted resignation.`);
        } else {
            // Create new resignation
            const newResignation: Resignation = {
                id: `RES-${Date.now()}`,
                employeeId: user.id,
                employeeName: user.name,
                submissionDate: new Date(),
                lastWorkingDay: new Date(lastWorkingDay),
                reason,
                attachmentUrl: attachmentUrl,
                status: ResignationStatus.PendingHRReview,
            };
    
            mockResignations.unshift(newResignation);
            logActivity(user, 'CREATE', 'Resignation', newResignation.id, `Submitted resignation.`);

            // Simulate notification for HR
            const hrUsers = mockUsers.filter(u => u.role === 'HR Manager' || u.role === 'Admin');
            hrUsers.forEach(hrUser => {
                mockNotifications.push({
                    id: `notif-${Date.now()}-${hrUser.id}`,
                    userId: hrUser.id,
                    type: NotificationType.ResignationSubmitted,
                    message: `${user.name} has submitted a resignation.`,
                    link: '/employees/onboarding', // Link to offboarding module
                    isRead: false,
                    createdAt: new Date(),
                    relatedEntityId: newResignation.id,
                });
            });
        }


        setTimeout(() => {
            setIsSubmitting(false);
            alert('Your resignation has been submitted for HR review.');
            navigate('/dashboard');
        }, 1000);
    };

    return (
        <div className="max-w-2xl mx-auto">
             {existingResignation && (
                <div className="p-4 mb-4 rounded-md bg-orange-50 dark:bg-orange-900/40 border border-orange-400 dark:border-orange-800">
                    <h3 className="font-bold text-orange-800 dark:text-orange-200">Your Resignation was Returned</h3>
                    <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                        Reason: <em>"{existingResignation.rejectionReason}"</em>
                    </p>
                    <p className="text-sm text-orange-700 dark:text-orange-300 mt-2">Please make the necessary changes and resubmit.</p>
                </div>
            )}
            <Card title={existingResignation ? "Revise & Resubmit Resignation" : "Submit Resignation"}>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Please fill out the form below to formally submit your resignation. This will be sent to the HR department for review.
                    </p>
                    <Input
                        label="Last Working Day"
                        id="lastWorkingDay"
                        type="date"
                        value={lastWorkingDay}
                        onChange={(e) => setLastWorkingDay(e.target.value)}
                        required
                    />
                    <Textarea
                        label="Reason for Resignation"
                        id="reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={6}
                        required
                    />
                    <Input
                        label="Resignation Letter Link (Optional)"
                        id="attachmentUrl"
                        type="url"
                        placeholder="https://docs.google.com/document/..."
                        value={attachmentUrl}
                        onChange={(e) => setAttachmentUrl(e.target.value)}
                    />
                    <div className="flex justify-end">
                        <Button type="submit" isLoading={isSubmitting}>
                           {existingResignation ? 'Resubmit Resignation' : 'Submit Resignation'}
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
};

export default SubmitResignation;
