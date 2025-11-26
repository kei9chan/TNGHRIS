
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
    onSend: () => void;
}

const RejectionEmailModal: React.FC<RejectionEmailModalProps> = ({ isOpen, onClose, application, onSend }) => {
    const { user } = useAuth();
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const candidate = mockCandidates.find(c => c.id === application?.candidateId);
    const jobPost = mockJobPosts.find(p => p.id === application?.jobPostId);

    useEffect(() => {
        if (isOpen && candidate && jobPost) {
            setSubject(`Update on your application for ${jobPost.title}`);
            setMessage(`Dear ${candidate.firstName},

Thank you for giving us the opportunity to consider your application for the ${jobPost.title} position. We have reviewed your background and qualifications and appreciate the time and effort you put into sharing them with us.

While your skills and experience are impressive, we have decided to proceed with other candidates who more closely align with our current needs for this role.

We will keep your resume on file for future openings that may be a good fit. We wish you the best of luck in your job search.

Sincerely,
The Hiring Team`);
        }
    }, [isOpen, candidate, jobPost]);

    const handleSend = () => {
        if (user && candidate) {
             logActivity(user, 'EXPORT', 'Application', application?.id || '', `Sent rejection email to ${candidate.email}`);
             alert(`Rejection email sent to ${candidate.email}`);
             onSend();
        }
    };

    if (!application || !candidate) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Send Rejection Email"
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button variant="danger" onClick={handleSend}>Send Rejection</Button>
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
                    <Input label="" value={`${candidate.firstName} ${candidate.lastName} <${candidate.email}>`} disabled />
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
