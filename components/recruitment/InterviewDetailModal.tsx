
import React from 'react';
import { Interview, InterviewFeedback, User, Application } from '../../types';
import { mockUsers, mockApplications, mockCandidates } from '../../services/mockData';
import { useAuth } from '../../hooks/useAuth';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import InterviewFeedbackForm from './InterviewFeedbackForm';

interface InterviewDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  interview: Interview;
  feedbacks: InterviewFeedback[];
  onSaveFeedback: (feedback: InterviewFeedback) => void;
}

const DetailItem: React.FC<{label: string, value?: React.ReactNode}> = ({label, value}) => (
    <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm text-gray-900 dark:text-white">{value || 'N/A'}</dd>
    </div>
);

const InterviewDetailModal: React.FC<InterviewDetailModalProps> = ({ isOpen, onClose, interview, feedbacks, onSaveFeedback }) => {
    const { user } = useAuth();

    const application = mockApplications.find(a => a.id === interview.applicationId) as Application;
    const candidate = mockCandidates.find(c => c.id === application.candidateId);
    const panel = mockUsers.filter(u => interview.panelUserIds.includes(u.id));

    const currentUserIsOnPanel = user ? interview.panelUserIds.includes(user.id) : false;
    const currentUserFeedback = currentUserIsOnPanel ? feedbacks.find(f => f.reviewerUserId === user?.id) : null;
    
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Interview Details: ${candidate?.firstName} ${candidate?.lastName}`}
            footer={<div className="flex justify-end w-full"><Button variant="secondary" onClick={onClose}>Close</Button></div>}
            size="2xl"
        >
            <div className="space-y-6">
                <section>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b pb-2 mb-2">Schedule</h3>
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                        <DetailItem label="Date" value={new Date(interview.scheduledStart).toLocaleDateString()} />
                        <DetailItem label="Time" value={`${new Date(interview.scheduledStart).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} - ${new Date(interview.scheduledEnd).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`} />
                        <DetailItem label="Type" value={interview.interviewType} />
                        <DetailItem label="Location / Link" value={
                            interview.interviewType === 'Virtual'
                            ? <a href={interview.location} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400">Join Google Meet</a>
                            : interview.location
                        } />
                        <div className="sm:col-span-2">
                            <DetailItem label="Panel" value={panel.map(p => p.name).join(', ')} />
                        </div>
                    </dl>
                </section>
                
                <section>
                     <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b pb-2 mb-2">Feedback & Scorecards</h3>
                    {currentUserIsOnPanel && !currentUserFeedback && (
                         <InterviewFeedbackForm interviewId={interview.id} onSubmit={onSaveFeedback} />
                    )}

                    <div className="space-y-4 mt-4">
                        {feedbacks.map(feedback => {
                             const reviewer = mockUsers.find(u => u.id === feedback.reviewerUserId);
                             return (
                                <div key={feedback.id} className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border dark:border-gray-700">
                                    <div className="flex justify-between items-center mb-3">
                                        <p className="font-semibold text-gray-900 dark:text-white">{reviewer?.name}</p>
                                        <div className="flex items-center bg-white dark:bg-gray-800 px-2 py-1 rounded border dark:border-gray-600">
                                            <span className="text-yellow-500 mr-1">★</span>
                                            <span className="font-bold">{feedback.score}/5</span>
                                        </div>
                                    </div>

                                    {feedback.competencyScores && (
                                        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                                            {Object.entries(feedback.competencyScores).map(([comp, score]) => (
                                                <div key={comp} className="flex justify-between items-center text-xs text-gray-600 dark:text-gray-400 border-b border-dotted dark:border-gray-700 pb-1">
                                                    <span>{comp}</span>
                                                    <span className="font-mono font-bold">{score}/5</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 gap-2 text-sm">
                                        <div className="bg-white dark:bg-gray-800 p-2 rounded border dark:border-gray-600">
                                            <span className="font-bold block text-xs uppercase text-green-600 mb-1">Strengths</span>
                                            {feedback.strengths}
                                        </div>
                                        <div className="bg-white dark:bg-gray-800 p-2 rounded border dark:border-gray-600">
                                            <span className="font-bold block text-xs uppercase text-red-600 mb-1">Concerns</span>
                                            {feedback.concerns}
                                        </div>
                                    </div>

                                    <div className="mt-3 flex justify-between items-center">
                                        <span className="text-sm font-medium">Recommendation: <span className={`font-bold ${feedback.hireRecommendation === 'Yes' ? 'text-green-600' : feedback.hireRecommendation === 'No' ? 'text-red-600' : 'text-yellow-600'}`}>{feedback.hireRecommendation}</span></span>
                                        <span className="text-xs text-gray-500">Submitted: {new Date(feedback.submittedAt).toLocaleDateString()}</span>
                                    </div>
                                </div>
                             )
                        })}
                        {feedbacks.length === 0 && <p className="text-sm text-gray-500 italic text-center py-4">No feedback submitted yet.</p>}
                    </div>
                </section>
            </div>
        </Modal>
    );
};

export default InterviewDetailModal;
