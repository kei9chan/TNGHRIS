import { supabase } from '../../services/supabaseClient';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Resignation, ResignationStatus, NotificationType } from '../../types';
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
        let active = true;
        const fetchResignation = async () => {
            if (user) {
                try {
                    const { data, error } = await supabase
                        .from('resignations')
                        .select('*')
                        .eq('employee_id', user.id)
                        .eq('status', ResignationStatus.ReturnedForEdits)
                        .order('created_at', { ascending: false })
                        .limit(1);

                    if (error) throw error;

                    if (active && data && data.length > 0) {
                        const found = data[0];
                        const resObj: Resignation = {
                            id: found.id,
                            employeeId: found.employee_id,
                            employeeName: found.employee_name,
                            submissionDate: new Date(found.submission_date),
                            lastWorkingDay: new Date(found.last_working_day),
                            reason: found.reason,
                            attachmentUrl: found.attachment_url,
                            status: found.status,
                            rejectionReason: found.rejection_reason
                        };
                        setExistingResignation(resObj);
                        setLastWorkingDay(new Date(resObj.lastWorkingDay).toISOString().split('T')[0]);
                        setReason(resObj.reason);
                        setAttachmentUrl(resObj.attachmentUrl || '');
                    }
                } catch (error) {
                    console.error("Error fetching resignation:", error);
                }
            }
        };
        fetchResignation();

        return () => { active = false; };
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        if (!lastWorkingDay || !reason) {
            alert('Please provide your last working day and a reason for resignation.');
            return;
        }

        setIsSubmitting(true);

        try {
            if (existingResignation) {
                // Update existing resignation
                const { error } = await supabase
                    .from('resignations')
                    .update({
                        last_working_day: new Date(lastWorkingDay).toISOString(),
                        reason,
                        attachment_url: attachmentUrl,
                        status: ResignationStatus.PendingHRReview,
                        submission_date: new Date().toISOString(),
                        rejection_reason: null
                    })
                    .eq('id', existingResignation.id);

                if (error) throw error;
                logActivity(user, 'UPDATE', 'Resignation', existingResignation.id, `Resubmitted resignation.`);
            } else {
                // Create new resignation
                const { data: newResignationData, error } = await supabase
                    .from('resignations')
                    .insert([{
                        employee_id: user.id,
                        employee_name: user.name,
                        submission_date: new Date().toISOString(),
                        last_working_day: new Date(lastWorkingDay).toISOString(),
                        reason,
                        attachment_url: attachmentUrl,
                        status: ResignationStatus.PendingHRReview
                    }])
                    .select()
                    .single();

                if (error) throw error;
                const newId = newResignationData.id;
                logActivity(user, 'CREATE', 'Resignation', newId, `Submitted resignation.`);

                // Simulate notification for HR
                const { data: hrUsers } = await supabase
                    .from('hris_users')
                    .select('id')
                    .in('role', ['HR Manager', 'Admin']);
                
                if (hrUsers) {
                    const notifications = hrUsers.map(hr => ({
                        id: `notif-${Date.now()}-${hr.id}`,
                        user_id: hr.id,
                        type: NotificationType.ResignationSubmitted,
                        message: `${user.name} has submitted a resignation.`,
                        link: '/employees/onboarding',
                        is_read: false,
                        related_entity_id: newId
                    }));
                    if (notifications.length > 0) {
                        await supabase.from('notifications').insert(notifications);
                    }
                }
            }

            alert('Your resignation has been submitted for HR review.');
            navigate('/dashboard');
        } catch (error) {
            console.error("Failed to submit resignation:", error);
            alert("Failed to submit resignation. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
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
