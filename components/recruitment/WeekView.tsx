import React from 'react';
import { Interview, Application, Candidate, JobPost } from '../../types';
import { getInterviewLabel, getInterviewTime } from './interviewDisplay';

interface WeekViewProps {
  currentDate: Date;
  interviews: Interview[];
  applications: Application[];
  candidates: Candidate[];
  jobPosts?: JobPost[];
  onInterviewClick: (interview: Interview) => void;
}

const WeekView: React.FC<WeekViewProps> = ({ currentDate, interviews, applications, candidates, jobPosts = [], onInterviewClick }) => {
  const weekDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() - date.getDay() + index);
    return date;
  });

  return <div className="grid grid-cols-7 divide-x divide-gray-200 dark:divide-gray-700">
    {weekDates.map((date) => {
      const interviewsForDay = interviews.filter((item) => new Date(item.scheduledStart).toDateString() === date.toDateString()).sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
      return <div key={date.toISOString()} className="p-2">
        <div className="mb-2 text-center"><p className="text-sm font-medium text-gray-500 dark:text-gray-400">{date.toLocaleDateString('en-US', { weekday: 'short' })}</p><p className={`text-lg font-bold ${new Date().toDateString() === date.toDateString() ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-white'}`}>{date.getDate()}</p></div>
        <div className="min-h-[40vh] space-y-2">
          {interviewsForDay.map((interview) => <button type="button" key={interview.id} title={getInterviewLabel(interview, applications, candidates, jobPosts)} onClick={() => onInterviewClick(interview)} className="block w-full rounded-md border-l-4 border-indigo-500 bg-indigo-50 p-2 text-left hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50"><p className="truncate text-sm font-semibold text-indigo-800 dark:text-indigo-200">{getInterviewLabel(interview, applications, candidates, jobPosts)}</p><p className="text-xs text-indigo-600 dark:text-indigo-400">{getInterviewTime(interview)} · {interview.interviewType}</p></button>)}
        </div>
      </div>;
    })}
  </div>;
};

export default WeekView;
