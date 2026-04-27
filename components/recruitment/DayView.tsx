import React from 'react';
import { Interview, Application, Candidate, User } from '../../types';

interface DayViewProps {
    currentDate: Date;
    interviews: Interview[];
    applications: Application[];
    candidates: Candidate[];
    users: User[];
    onInterviewClick: (interview: Interview) => void;
}

const DayView: React.FC<DayViewProps> = ({ currentDate, interviews, applications, candidates, users, onInterviewClick }) => {
    const interviewsForDay = interviews
        .filter(i => new Date(i.scheduledStart).toDateString() === currentDate.toDateString())
        .sort((a,b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());

    return (
        <div className="p-4">
            {interviewsForDay.length > 0 ? (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {interviewsForDay.map(interview => {
                        const application = applications.find(a => a.id === interview.applicationId);
                        const candidate = candidates.find(c => c.id === application?.candidateId);
                        const panel = users.filter(u => interview.panelUserIds.includes(u.id));

                        return (
                            <li key={interview.id} onClick={() => onInterviewClick(interview)} className="py-4 px-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md">
                                <div className="flex space-x-4">
                                    <div className="font-mono text-indigo-600 dark:text-indigo-400 w-24 text-right">
                                        <p>{new Date(interview.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                        <p className="text-xs text-gray-500">{interview.interviewType}</p>
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-bold text-gray-900 dark:text-white">{candidate ? `${candidate.firstName} ${candidate.lastName}` : 'Unknown Applicant'}</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Panel: {panel.map(p => p.name).join(', ')}</p>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                    <p>No interviews scheduled for this day.</p>
                </div>
            )}
        </div>
    );
};

export default DayView;