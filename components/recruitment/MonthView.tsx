import React from 'react';
import { Application, Candidate, Interview, JobPost } from '../../types';
import { getInterviewLabel, getInterviewTime } from './interviewDisplay';

interface MonthViewProps {
  currentDate: Date;
  interviews: Interview[];
  applications: Application[];
  candidates: Candidate[];
  jobPosts?: JobPost[];
  onDateClick: (date: Date) => void;
  onInterviewClick: (interview: Interview) => void;
}

const MonthView: React.FC<MonthViewProps> = ({ currentDate, interviews, applications, candidates, jobPosts = [], onDateClick, onInterviewClick }) => {
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const startDate = new Date(monthStart);
  startDate.setDate(startDate.getDate() - startDate.getDay());
  const endDate = new Date(monthEnd);
  endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

  const days: Date[] = [];
  let day = new Date(startDate);
  while (day <= endDate) {
    days.push(new Date(day));
    day.setDate(day.getDate() + 1);
  }

  const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div>
      <div className="grid grid-cols-7 border-b text-center text-xs font-semibold text-gray-500 dark:border-gray-700 dark:text-gray-400">
        {dayHeaders.map((header) => <div key={header} className="py-2">{header}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((date) => {
          const interviewsForDay = interviews
            .filter((item) => new Date(item.scheduledStart).toDateString() === date.toDateString())
            .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
          const isCurrentMonth = date.getMonth() === currentDate.getMonth();
          const isToday = new Date().toDateString() === date.toDateString();
          return (
            <div key={date.toString()} className={`relative min-h-32 cursor-pointer border-b border-r p-2 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-700/50 ${isCurrentMonth ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'}`} onClick={() => onDateClick(date)}>
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${isToday ? 'bg-indigo-600 font-bold text-white' : !isCurrentMonth ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>{date.getDate()}</div>
              {interviewsForDay.length > 0 && <div className="mt-1 space-y-1 overflow-hidden">
                {interviewsForDay.slice(0, 2).map((interview) => <button key={interview.id} type="button" title={`${getInterviewLabel(interview, applications, candidates, jobPosts)} at ${getInterviewTime(interview)}`} onClick={(event) => { event.stopPropagation(); onInterviewClick(interview); }} className="block w-full rounded bg-indigo-50 px-1 py-1 text-left text-[11px] text-indigo-800 hover:bg-indigo-100 dark:bg-indigo-900/40 dark:text-indigo-200 dark:hover:bg-indigo-900/70"><span className="block truncate font-semibold">{getInterviewLabel(interview, applications, candidates, jobPosts)}</span><span className="block text-[10px]">{getInterviewTime(interview)}</span></button>)}
                {interviewsForDay.length > 2 && <button type="button" className="text-xs text-indigo-600 hover:underline dark:text-indigo-300" onClick={(event) => { event.stopPropagation(); onDateClick(date); }}>+ {interviewsForDay.length - 2} more</button>}
              </div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MonthView;
