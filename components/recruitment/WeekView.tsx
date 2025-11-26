import React from 'react';
import { Interview } from '../../types';
import { mockApplications, mockCandidates } from '../../services/mockData';

interface WeekViewProps {
    currentDate: Date;
    interviews: Interview[];
    onInterviewClick: (interview: Interview) => void;
}

const WeekView: React.FC<WeekViewProps> = ({ currentDate, interviews, onInterviewClick }) => {
    const weekDates = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(currentDate);
        date.setDate(date.getDate() - date.getDay() + i);
        return date;
    });

    return (
        <div className="grid grid-cols-7 divide-x divide-gray-200 dark:divide-gray-700">
            {weekDates.map(date => {
                const interviewsForDay = interviews.filter(i => new Date(i.scheduledStart).toDateString() === date.toDateString())
                                                   .sort((a,b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
                return (
                    <div key={date.toISOString()} className="p-2">
                        <div className="text-center mb-2">
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{date.toLocaleDateString('en-US', { weekday: 'short' })}</p>
                            <p className={`font-bold text-lg ${new Date().toDateString() === date.toDateString() ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-white'}`}>{date.getDate()}</p>
                        </div>
                        <div className="space-y-2 min-h-[40vh]">
                            {interviewsForDay.map(interview => {
                                const application = mockApplications.find(a => a.id === interview.applicationId);
                                const candidate = mockCandidates.find(c => c.id === application?.candidateId);
                                return (
                                    <div key={interview.id} onClick={() => onInterviewClick(interview)} className="p-2 bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500 rounded-md cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50">
                                        <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 truncate">{candidate ? `${candidate.firstName} ${candidate.lastName}` : 'Unknown'}</p>
                                        <p className="text-xs text-blue-600 dark:text-blue-400">{new Date(interview.scheduledStart).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )
            })}
        </div>
    );
};

export default WeekView;