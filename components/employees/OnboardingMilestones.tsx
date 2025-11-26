import React, { useState } from 'react';
import { Milestone, OnboardingTask, OnboardingTaskStatus, User } from '../../types';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';

// Icons
const ChevronDownIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transition-transform duration-300 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>);
const LockClosedIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${className}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>);
const CheckCircleIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${className}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>);
const RadioButtonIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${className}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 10a3 3 0 116 0 3 3 0 01-6 0z" clipRule="evenodd" /></svg>);
const DotsCircleIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${className}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 100-2 1 1 0 000 2zm2 0a1 1 0 100-2 1 1 0 000 2zm2 0a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>);


interface TaskItemProps {
    task: OnboardingTask;
    isLocked: boolean;
    canComplete: boolean;
    onUpdateTask: (taskId: string, status: OnboardingTaskStatus) => void;
}

const TaskItem: React.FC<TaskItemProps> = ({ task, isLocked, canComplete, onUpdateTask }) => {
    const isCompleted = task.status === OnboardingTaskStatus.Completed;

    const getStatusIcon = () => {
        if (isCompleted) return <CheckCircleIcon className="text-green-400" />;
        if (isLocked) return <DotsCircleIcon className="text-gray-500" />;
        return <RadioButtonIcon className="text-blue-400" />;
    };

    return (
        <Link
            to={`/employees/onboarding/task/${task.id}`}
            className={`block hover:bg-white/10 transition-colors duration-200 ${isCompleted ? 'opacity-60' : ''}`}
        >
            <div className="flex items-center justify-between p-4 border-b border-white/10">
                <div className="flex items-center">
                    {getStatusIcon()}
                    <div className="ml-4">
                        <p className={`font-medium ${isCompleted ? 'line-through' : ''}`}>{task.name}</p>
                        <p className="text-sm text-gray-400">{task.points} points</p>
                    </div>
                </div>
                <div className="flex items-center">
                    {isLocked && !isCompleted && <LockClosedIcon className="text-gray-400" />}
                </div>
            </div>
        </Link>
    );
};


interface MilestoneGroupProps {
    milestone: Milestone;
    isOpen: boolean;
    onToggle: () => void;
    currentUser: User;
    onUpdateTask: (taskId: string, status: OnboardingTaskStatus) => void;
}

const MilestoneGroup: React.FC<MilestoneGroupProps> = ({ milestone, isOpen, onToggle, currentUser, onUpdateTask }) => {
    const isMilestoneCompleted = milestone.tasks.every(t => t.status === OnboardingTaskStatus.Completed);
    
    return (
        <div className="bg-white/5 rounded-lg overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full flex justify-between items-center p-4 text-left"
                aria-expanded={isOpen}
            >
                <div className="flex items-center">
                    {isMilestoneCompleted ? <CheckCircleIcon className="text-green-400 mr-3" /> : <div className="w-6 h-6 mr-3"></div>}
                    <h3 className="text-lg font-semibold">{milestone.title}</h3>
                </div>
                <ChevronDownIcon className={isOpen ? 'rotate-180' : ''} />
            </button>
            <div
                className={`transition-max-height duration-500 ease-in-out overflow-hidden ${isOpen ? 'max-h-screen' : 'max-h-0'}`}
            >
                <div>
                    {milestone.tasks.map((task, index) => (
                        <TaskItem
                            key={task.id}
                            task={task}
                            isLocked={milestone.isLocked}
                            canComplete={currentUser.id === task.ownerUserId || currentUser.id === task.employeeId}
                            onUpdateTask={onUpdateTask}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};


interface OnboardingMilestonesProps {
    milestones: Milestone[];
    progress: number;
    completedPoints: number;
    totalPoints: number;
    onUpdateTask: (taskId: string, status: OnboardingTaskStatus) => void;
    currentUser: User;
}

const OnboardingMilestones: React.FC<OnboardingMilestonesProps> = ({ milestones, progress, completedPoints, totalPoints, onUpdateTask, currentUser }) => {
    const [openMilestone, setOpenMilestone] = useState<string | null>(milestones.length > 0 ? milestones[0].title : null);

    const handleToggle = (title: string) => {
        setOpenMilestone(prev => prev === title ? null : title);
    };

    return (
        <div className="p-4 md:p-6 bg-indigo-900 text-white rounded-lg">
            <h1 className="text-2xl md:text-3xl font-bold">My Onboarding Journey</h1>

            <div className="my-6">
                <div className="flex justify-between items-center mb-1 text-gray-300">
                    <span className="font-medium">Progress</span>
                    <span className="font-semibold">{completedPoints} / {totalPoints} Points</span>
                </div>
                <div className="w-full bg-black/30 rounded-full h-3">
                    <div className="bg-green-400 h-3 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                </div>
            </div>
            
            <h2 className="text-xl font-bold mb-4">All Milestones</h2>
            <div className="space-y-3">
                {milestones.map(milestone => (
                    <MilestoneGroup
                        key={milestone.title}
                        milestone={milestone}
                        isOpen={openMilestone === milestone.title}
                        onToggle={() => handleToggle(milestone.title)}
                        currentUser={currentUser}
                        onUpdateTask={onUpdateTask}
                    />
                ))}
            </div>
        </div>
    );
};

export default OnboardingMilestones;