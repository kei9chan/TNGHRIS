
import React, { useMemo } from 'react';
import { Candidate, Application, ApplicationStage } from '../../types';
import { mockApplications, mockJobPosts } from '../../services/mockData';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface CandidateProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: Candidate;
}

const getStageColor = (stage: ApplicationStage) => {
    switch (stage) {
        case ApplicationStage.Hired: return 'bg-green-100 text-green-800';
        case ApplicationStage.Offer: return 'bg-teal-100 text-teal-800';
        case ApplicationStage.Interview: return 'bg-blue-100 text-blue-800';
        case ApplicationStage.Rejected:
        case ApplicationStage.Withdrawn: return 'bg-red-100 text-red-800';
        default: return 'bg-gray-100 text-gray-800';
    }
}

const CandidateProfileModal: React.FC<CandidateProfileModalProps> = ({ isOpen, onClose, candidate }) => {
    
    const applicationHistory = useMemo(() => {
        return mockApplications
            .filter(app => app.candidateId === candidate.id)
            .map(app => {
                const jobPost = mockJobPosts.find(p => p.id === app.jobPostId);
                return {
                    ...app,
                    jobTitle: jobPost?.title || 'Unknown Position'
                }
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [candidate.id]);

    const DetailItem: React.FC<{label: string, value?: React.ReactNode}> = ({label, value}) => (
        <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-white">{value || 'N/A'}</dd>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Candidate Profile: ${candidate.firstName} ${candidate.lastName}`}
            footer={<div className="flex justify-end w-full"><Button variant="secondary" onClick={onClose}>Close</Button></div>}
        >
            <div className="space-y-6">
                <section>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b pb-2 mb-2">Personal Information</h3>
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                        <DetailItem label="Email" value={<a href={`mailto:${candidate.email}`} className="text-indigo-600 dark:text-indigo-400">{candidate.email}</a>} />
                        <DetailItem label="Phone" value={candidate.phone} />
                        <DetailItem label="Source" value={candidate.source} />
                        <DetailItem label="Tags" value={candidate.tags?.map(tag => <span key={tag} className="mr-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800">{tag}</span>)} />
                    </dl>
                </section>

                <section>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b pb-2 mb-2">Application History</h3>
                    {applicationHistory.length > 0 ? (
                        <ul className="space-y-3 max-h-64 overflow-y-auto pr-2">
                            {applicationHistory.map(app => (
                                <li key={app.id} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-md border border-gray-200 dark:border-gray-700">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-semibold text-gray-800 dark:text-gray-200">{app.jobTitle}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Applied on: {new Date(app.createdAt).toLocaleDateString()}</p>
                                        </div>
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStageColor(app.stage)}`}>
                                            {app.stage}
                                        </span>
                                    </div>
                                    {app.notes && <p className="mt-2 text-sm italic text-gray-600 dark:text-gray-400">Note: "{app.notes}"</p>}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">No application history found for this candidate.</p>
                    )}
                </section>
            </div>
        </Modal>
    );
};

export default CandidateProfileModal;
      