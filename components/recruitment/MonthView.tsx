import React from 'react';
import { Interview } from '../../types';

interface MonthViewProps {
    currentDate: Date;
    interviews: Interview[];
    onDateClick: (date: Date) => void;
}

const MonthView: React.FC<MonthViewProps> = ({ currentDate, interviews, onDateClick }) => {
    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const startDate = new Date(monthStart);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    const endDate = new Date(monthEnd);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

    const days = [];
    let day = new Date(startDate);
    while (day <= endDate) {
        days.push(new Date(day));
        day.setDate(day.getDate() + 1);
    }

    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
        <div>
            <div className="grid grid-cols-7 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                {dayHeaders.map(day => <div key={day} className="py-2">{day}</div>)}
            </div>
            <div className="grid grid-cols-7">
                {days.map(day => {
                    const interviewsForDay = interviews.filter(i => new Date(i.scheduledStart).toDateString() === day.toDateString());
                    const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                    const isToday = new Date().toDateString() === day.toDateString();
                    
                    const dayClasses = `
                        relative h-32 p-2 border-r border-b dark:border-gray-700 
                        ${isCurrentMonth ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'}
                        hover:bg-gray-100 dark:hover:bg-gray-700/50 cursor-pointer transition-colors
                    `;
                    
                    const dayNumberClasses = `
                        flex items-center justify-center h-7 w-7 rounded-full text-sm
                        ${isToday ? 'bg-indigo-600 text-white font-bold' : ''}
                        ${!isCurrentMonth ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}
                    `;

                    return (
                        <div key={day.toString()} className={dayClasses} onClick={() => onDateClick(day)}>
                            <div className={dayNumberClasses}>
                                {day.getDate()}
                            </div>
                            {interviewsForDay.length > 0 && (
                                <div className="mt-1 space-y-1 overflow-hidden">
                                    {interviewsForDay.slice(0, 2).map(interview => (
                                         <div key={interview.id} className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 rounded px-1 truncate">
                                             {new Date(interview.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                         </div>
                                    ))}
                                    {interviewsForDay.length > 2 && (
                                        <div className="text-xs text-gray-500 dark:text-gray-400">+ {interviewsForDay.length - 2} more</div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default MonthView;
