import React from 'react';
import { Interview, Application, Candidate, JobPost } from '../../types';

interface WeekViewProps {
    currentDate: Date;
    interviews: Interview[];
    applications: Application[];
    candidates: Candidate[];
    jobPosts: JobPost[];
    onInterviewClick: (interview: Interview) => void;
}

const WeekView: React.FC<WeekViewProps> = ({ currentDate, interviews, applications, candidates, jobPosts, onInterviewClick }) => {
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
                                const application = applications.find(a => a.id === interview.applicationId);
                                const candidate = candidates.find(c => c.id === application?.candidateId);
                                const jobPost = jobPosts.find(post => post.id === application?.jobPostId);
                                const firstName = candidate?.firstName || 'Unknown';
                                const position = jobPost?.title || 'Position unavailable';
                                const time = new Date(interview.scheduledStart).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                                return (
                                    <button key={interview.id} type="button" onClick={() => onInterviewClick(interview)} className="block w-full cursor-pointer rounded-md border-l-4 border-blue-500 bg-blue-50 p-2 text-left hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-blue-900/30 dark:hover:bg-blue-900/50" title={`${firstName} — ${position}`}>
                                        <p className="truncate text-xs font-semibold text-blue-800 dark:text-blue-200"><span className="font-mono font-medium">{time}</span> {firstName} — {position}</p>
                                    </button>
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
