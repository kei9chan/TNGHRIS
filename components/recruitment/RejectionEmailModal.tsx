
import React, { useState, useEffect } from 'react';
import { Candidate, Application } from '../../types';
import { mockCandidates, mockJobPosts } from '../../services/mockData';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import { useAuth } from '../../hooks/useAuth';
import { logActivity } from '../../services/auditService';

interface RejectionEmailModalProps {
    isOpen: boolean;
    onClose: () => void;
    application: Application | null;
    candidate?: Candidate | null;
    jobTitle?: string | null;
    onSend: () => void;
}

const RejectionEmailModal: React.FC<RejectionEmailModalProps> = ({ isOpen, onClose, application, candidate, jobTitle, onSend }) => {
    const { user } = useAuth();
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const resolvedCandidate = candidate || mockCandidates.find(c => c.id === application?.candidateId);
    const resolvedJobTitle = jobTitle || mockJobPosts.find(p => p.id === application?.jobPostId)?.title;

    useEffect(() => {
        if (isOpen && resolvedCandidate && resolvedJobTitle) {
            setSubject(`Update on your application for ${resolvedJobTitle}`);
            setMessage(`Dear ${resolvedCandidate.firstName},

Thank you for giving us the opportunity to consider your application for the ${resolvedJobTitle} position. We have reviewed your background and qualifications and appreciate the time and effort you put into sharing them with us.

While your skills and experience are impressive, we have decided to proceed with other candidates who more closely align with our current needs for this role.

We will keep your resume on file for future openings that may be a good fit. We wish you the best of luck in your job search.

Sincerely,
The Hiring Team`);
        }
    }, [isOpen, resolvedCandidate, resolvedJobTitle]);

    const handleSend = async () => {
        if (!resolvedCandidate?.email) {
            alert('Candidate email is missing.');
            return;
        }

        setIsSending(true);
        try {
            const response = await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: resolvedCandidate.email,
                    subject,
                    message,
                }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data?.error || 'Failed to send rejection email.');
            }

            if (user) {
                logActivity(user, 'EXPORT', 'Application', application?.id || '', `Sent rejection email to ${resolvedCandidate.email}`);
            }
            alert(`Rejection email sent to ${resolvedCandidate.email}`);
            onSend();
        } catch (error: any) {
            alert(error?.message || 'Failed to send rejection email.');
        } finally {
            setIsSending(false);
        }
    };

    if (!application || !resolvedCandidate) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Send Rejection Email"
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button variant="danger" onClick={handleSend} disabled={isSending}>
                        {isSending ? 'Sending...' : 'Send Rejection'}
                    </Button>
                </div>
            }
        >
            <div className="space-y-4">
                 <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-md">
                    <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                        This action will finalize the rejection status. Please review the email below.
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To</label>
                    <Input label="" value={`${resolvedCandidate.firstName} ${resolvedCandidate.lastName} <${resolvedCandidate.email}>`} disabled />
                </div>
                
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
                    <Input label="" value={subject} onChange={e => setSubject(e.target.value)} />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
                    <Textarea label="" value={message} onChange={e => setMessage(e.target.value)} rows={10} />
                </div>
            </div>
        </Modal>
    );
};

export default RejectionEmailModal;
