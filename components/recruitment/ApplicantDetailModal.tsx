
import React, { useState } from 'react';
import { EnrichedApplication } from '../../pages/recruitment/Applicants';
import { mockCandidates } from '../../services/mockData';
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
    const candidate = mockCandidates.find(c => c.id === application.candidateId);
    
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [subject, setSubject] = useState(`Regarding your application for ${application.jobTitle}`);
    const [message, setMessage] = useState(`Dear ${candidate?.firstName},\n\nWe are reviewing your application and would like to request further details regarding...\n\nBest regards,\n${user?.name || 'The Hiring Team'}`);

    const handleSendEmail = () => {
        // Simulation of email sending
        alert(`(Simulation) Email sent to ${candidate?.email}!\n\nSubject: ${subject}\nMessage: ${message}`);
        
        if (user) {
            logActivity(user, 'EXPORT', 'Applicant', application.candidateId, `Sent email to candidate regarding ${application.jobTitle}`);
        }
        
        setIsEmailModalOpen(false);
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
                        <DetailItem label="Email" value={<a href={`mailto:${candidate?.email}`} className="text-indigo-600 dark:text-indigo-400">{candidate?.email}</a>} />
                        <DetailItem label="Phone" value={candidate?.phone} />
                        <DetailItem label="Source" value={candidate?.source} />
                        <DetailItem label="Portfolio" value={candidate?.portfolioUrl ? <a href={candidate.portfolioUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400">View Portfolio</a> : 'N/A'} />
                        <DetailItem label="Tags" value={candidate?.tags?.join(', ')} />
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
                title={`Email ${candidate?.firstName} ${candidate?.lastName}`}
                footer={
                    <div className="flex justify-end w-full space-x-2">
                        <Button variant="secondary" onClick={() => setIsEmailModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSendEmail}>Send Email</Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="p-2 bg-gray-100 dark:bg-slate-700 rounded text-sm">
                        <p><strong>To:</strong> {candidate?.email}</p>
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
