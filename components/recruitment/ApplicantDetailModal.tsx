
import React, { useMemo, useState, useEffect } from 'react';
import { EnrichedApplication } from '../../pages/recruitment/Applicants';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import { useAuth } from '../../hooks/useAuth';
import { logActivity } from '../../services/auditService';

interface ApplicantDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  application: EnrichedApplication;
}

const ApplicantDetailModal: React.FC<ApplicantDetailModalProps> = ({ isOpen, onClose, application }) => {
    const { user } = useAuth();
    const candidateName = useMemo(() => {
        if (application.candidateName && application.candidateName !== 'Unknown') {
            return application.candidateName;
        }
        const fallback = `${application.candidateFirstName || ''} ${application.candidateLastName || ''}`.trim();
        return fallback || 'Applicant';
    }, [application]);
    
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!isEmailModalOpen) return;
        const senderName =
            (import.meta as any).env?.VITE_SMTP_FROM_NAME ||
            user?.name ||
            'The Hiring Team';
        setSubject(`Regarding your application for ${application.jobTitle}`);
        setMessage(
            `Dear ${application.candidateFirstName || candidateName},\n\nThank you for your interest in the ${application.jobTitle} position. We are currently reviewing your application and would contact for further announcements. Stay tuned. \n\nBest regards,\n${senderName}`
        );
    }, [isEmailModalOpen, application, candidateName, user?.name]);

    const handleSendEmail = async () => {
        if (!application.candidateEmail) {
            alert('Candidate email is missing.');
            return;
        }

        setIsSending(true);
        try {
            const response = await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: application.candidateEmail,
                    subject,
                    message,
                }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data?.error || 'Failed to send email.');
            }

            alert(`Email sent to ${application.candidateEmail}.`);
            if (user) {
                logActivity(user, 'EXPORT', 'Applicant', application.candidateId, `Sent email to candidate regarding ${application.jobTitle}`);
            }
            setIsEmailModalOpen(false);
        } catch (error: any) {
            alert(error?.message || 'Failed to send email.');
        } finally {
            setIsSending(false);
        }
    };
    
    const renderFooter = () => (
        <div className="flex justify-end w-full space-x-2">
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button onClick={() => setIsEmailModalOpen(true)}>Email Candidate</Button>
        </div>
    );

    const DetailItem: React.FC<{label: string, value?: React.ReactNode}> = ({label, value}) => (
        <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-white">{value || 'N/A'}</dd>
        </div>
    );

  return (
    <>
        <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Applicant: ${application.candidateName}`}
        footer={renderFooter()}
        >
            <div className="space-y-6">
                {/* Candidate Details */}
                <section>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b pb-2 mb-2">Candidate Information</h3>
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                        <DetailItem label="Full Name" value={application.candidateName} />
                        <DetailItem label="Email" value={application.candidateEmail ? <a href={`mailto:${application.candidateEmail}`} className="text-indigo-600 dark:text-indigo-400">{application.candidateEmail}</a> : 'N/A'} />
                        <DetailItem label="Phone" value={application.candidatePhone} />
                        <DetailItem label="Source" value={application.candidateSource} />
                        <DetailItem label="Portfolio" value={application.candidatePortfolioUrl ? <a href={application.candidatePortfolioUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400">View Portfolio</a> : 'N/A'} />
                        <DetailItem label="Tags" value={application.candidateTags?.join(', ')} />
                    </dl>
                </section>

                {/* Application Details */}
                <section>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b pb-2 mb-2">Application Details</h3>
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                        <DetailItem label="Applying For" value={application.jobTitle} />
                        <DetailItem label="Current Stage" value={<span className="px-2 py-1 text-sm font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">{application.stage}</span>} />
                        <DetailItem label="Application Date" value={new Date(application.createdAt).toLocaleString()} />
                        <DetailItem label="Last Updated" value={new Date(application.updatedAt).toLocaleString()} />
                        <div className="sm:col-span-2">
                            <DetailItem label="Notes" value={application.notes || 'No notes added yet.'} />
                        </div>
                    </dl>
                </section>
            </div>
        </Modal>

        {isEmailModalOpen && (
            <Modal
                isOpen={isEmailModalOpen}
                onClose={() => setIsEmailModalOpen(false)}
                title={`Email ${candidateName}`}
                footer={
                    <div className="flex justify-end w-full space-x-2">
                        <Button variant="secondary" onClick={() => setIsEmailModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSendEmail} disabled={isSending}>
                            {isSending ? 'Sending...' : 'Send Email'}
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="p-2 bg-gray-100 dark:bg-slate-700 rounded text-sm">
                        <p><strong>To:</strong> {application.candidateEmail || 'N/A'}</p>
                    </div>
                    <Input 
                        label="Subject" 
                        value={subject} 
                        onChange={e => setSubject(e.target.value)} 
                    />
                    <Textarea 
                        label="Message" 
                        value={message} 
                        onChange={e => setMessage(e.target.value)} 
                        rows={6} 
                    />
                </div>
            </Modal>
        )}
    </>
  );
};

export default ApplicantDetailModal;
