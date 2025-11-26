import React, { useMemo, useState } from 'react';
import { OnboardingChecklist, OnboardingTaskStatus, User } from '../../types';
import Card from '../ui/Card';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import OnboardingStatusBadge from './OnboardingStatusBadge';

interface AssignedOnboardingChecklistProps {
    checklist: OnboardingChecklist | undefined;
    currentUser: User;
    onUpdateTaskStatus: (taskId: string, status: OnboardingTaskStatus) => void;
}

const AssignedOnboardingChecklist: React.FC<AssignedOnboardingChecklistProps> = ({ checklist, onUpdateTaskStatus }) => {
    const [isViewDocModalOpen, setViewDocModalOpen] = useState(false);

    const { progress, completedPoints, totalPoints, allTasksCompleted } = useMemo(() => {
        if (!checklist) {
            return { progress: 0, completedPoints: 0, totalPoints: 0, allTasksCompleted: false };
        }

        let completed = 0;
        let total = 0;
        checklist.tasks.forEach(task => {
            if (task.status === OnboardingTaskStatus.Completed) {
                completed += task.points || 0;
            }
            total += task.points || 0;
        });

        const calculatedProgress = total > 0 ? (completed / total) * 100 : 0;
        const allCompleted = checklist.tasks.every(t => t.status === OnboardingTaskStatus.Completed);
        
        return { progress: calculatedProgress, completedPoints: completed, totalPoints: total, allTasksCompleted: allCompleted };
    }, [checklist]);

    if (!checklist) {
        return (
            <Card>
                <div className="text-center py-12">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">No Onboarding Checklist Assigned</h2>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">Your onboarding checklist has not been assigned yet. Please check back later or contact HR.</p>
                </div>
            </Card>
        );
    }
    
    return (
        <div>
            <Card>
                <div className="mb-6">
                    <div className="flex justify-between items-center mb-1 text-gray-700 dark:text-gray-200">
                        <span className="font-medium">Progress</span>
                        <span className="font-semibold">{completedPoints} / {totalPoints} Points</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                        <div className="bg-green-500 h-3 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                    </div>
                </div>
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {checklist.tasks.map(task => (
                         <li key={task.id} className="py-3 flex justify-between items-center">
                            <div>
                                <p className={`font-medium ${task.status === 'Completed' ? 'line-through text-gray-500' : 'text-gray-900 dark:text-white'}`}>{task.name}</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{task.points} points - Due: {new Date(task.dueDate).toLocaleDateString()}</p>
                            </div>
                            <div className="flex items-center space-x-4">
                                <OnboardingStatusBadge status={task.status} />
                                <Link to={`/employees/onboarding/task/${task.id}`}>
                                    <Button size="sm" variant="secondary">
                                        {task.status === 'Completed' ? 'View' : 'Start'}
                                    </Button>
                                </Link>
                            </div>
                         </li>
                    ))}
                </ul>
            </Card>

            {allTasksCompleted && checklist.status !== 'Completed' && (
                <Card className="mt-6 text-center">
                    <h3 className="text-xl font-bold">All tasks completed!</h3>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">You're ready for the final step. Proceed to sign and complete your onboarding.</p>
                    <Link to={`/employees/onboarding/sign/${checklist.id}`} className="mt-4 inline-block">
                        <Button size="lg">Proceed to Final Acknowledgement</Button>
                    </Link>
                </Card>
            )}

            {checklist.status === 'Completed' && checklist.signedAt && (
                <Card className="mt-6 text-center">
                    <h3 className="text-xl font-bold text-green-600 dark:text-green-400">Onboarding Complete!</h3>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">
                        Welcome to the team! Your onboarding was finalized on {new Date(checklist.signedAt).toLocaleDateString()}.
                    </p>
                    <Button onClick={() => setViewDocModalOpen(true)} className="mt-4" variant="secondary">View Signed Document</Button>
                </Card>
            )}
            
            {checklist.status === 'Completed' && isViewDocModalOpen && (
                 <Modal isOpen={isViewDocModalOpen} onClose={() => setViewDocModalOpen(false)} title="Signed Onboarding Acknowledgement">
                    <div className="space-y-4">
                        <p>This document confirms that you have completed all required onboarding tasks.</p>
                        <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-md">
                            <dl>
                                <dt className="font-semibold">Signed By:</dt>
                                <dd className="ml-4">{checklist.signatureName}</dd>
                                <dt className="font-semibold mt-2">Date Signed:</dt>
                                <dd className="ml-4">{checklist.signedAt ? new Date(checklist.signedAt).toLocaleString() : 'N/A'}</dd>
                            </dl>
                            <div className="mt-4">
                                <p className="font-semibold">Signature:</p>
                                {checklist.signatureDataUrl ? (
                                    <img src={checklist.signatureDataUrl} alt="Your signature" className="mt-2 border rounded-md p-2 bg-white" />
                                ) : (
                                    <p>No signature data found.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default AssignedOnboardingChecklist;