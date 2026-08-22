import React from 'react';
import { Interview, Application, Candidate, User, JobPost } from '../../types';
import { getInterviewLabel, getInterviewTime } from './interviewDisplay';

interface DayViewProps {
  currentDate: Date;
  interviews: Interview[];
  applications: Application[];
  candidates: Candidate[];
  users: User[];
  jobPosts?: JobPost[];
  onInterviewClick: (interview: Interview) => void;
}

const DayView: React.FC<DayViewProps> = ({ currentDate, interviews, applications, candidates, users, jobPosts = [], onInterviewClick }) => {
  const interviewsForDay = interviews.filter((item) => new Date(item.scheduledStart).toDateString() === currentDate.toDateString()).sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
  return <div className="p-4">
    {interviewsForDay.length ? <ul className="divide-y divide-gray-200 dark:divide-gray-700">{interviewsForDay.map((interview) => {
      const panel = users.filter((user) => interview.panelUserIds?.includes(user.id));
      return <li key={interview.id} onClick={() => onInterviewClick(interview)} className="cursor-pointer rounded-md px-2 py-4 hover:bg-gray-50 dark:hover:bg-gray-800"><div className="flex gap-4"><div className="w-28 text-right font-mono text-indigo-600 dark:text-indigo-400"><p>{getInterviewTime(interview)}</p><p className="text-xs text-gray-500">{interview.interviewType}</p></div><div className="flex-1"><p className="font-bold text-gray-900 dark:text-white">{getInterviewLabel(interview, applications, candidates, jobPosts)}</p><p className="text-sm text-gray-500 dark:text-gray-400">Panel: {panel.map((person) => person.name).join(', ') || 'Not assigned'}</p></div></div></li>;
    })}</ul> : <div className="py-16 text-center text-gray-500 dark:text-gray-400"><p>No interviews scheduled for this day.</p></div>}
  </div>;
};

export default DayView;
