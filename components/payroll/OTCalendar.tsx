
import React, { useState, useMemo } from 'react';
import { OTRequest, OTStatus, ShiftAssignment, ShiftTemplate } from '../../types';
import Button from '../ui/Button';
import Modal from '../ui/Modal';

interface OTCalendarProps {
    requests: OTRequest[];
    shifts: ShiftAssignment[];
    templates: ShiftTemplate[];
}

// Icons
const ChevronLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>;
const ChevronRightIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>;

const OTCalendar: React.FC<OTCalendarProps> = ({ requests, shifts, templates }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    const getMonthData = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay(); // 0 (Sun) to 6 (Sat)

        const calendarDays: (Date | null)[] = [];
        
        // Pad empty days at start
        for (let i = 0; i < startingDayOfWeek; i++) {
            calendarDays.push(null);
        }
        
        // Fill actual days
        for (let i = 1; i <= daysInMonth; i++) {
            calendarDays.push(new Date(year, month, i));
        }

        return { year, month, calendarDays };
    }, [currentDate]);

    const handlePrevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const handleToday = () => {
        setCurrentDate(new Date());
    };

    const handleDayClick = (date: Date) => {
        setSelectedDate(date);
        setIsDetailModalOpen(true);
    };

    const getRequestsForDay = (date: Date) => {
        return requests.filter(req => new Date(req.date).toDateString() === date.toDateString());
    };

    const getShiftForDay = (date: Date) => {
        // Assuming shifts are for the current user or filtered context passed down
        // Ideally, we'd filter shifts by employee ID if we were showing a team calendar, 
        // but for visual simplicity in this MVP step, we just look for *any* matching assignment 
        // if 'requests' implies a "My OT" context, 'shifts' should be "My Shifts".
        const assignment = shifts.find(s => new Date(s.date).toDateString() === date.toDateString());
        if (!assignment) return null;
        return templates.find(t => t.id === assignment.shiftTemplateId);
    };

    const getStatusColor = (status: OTStatus) => {
        switch (status) {
            case OTStatus.Approved: return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/50 dark:text-green-200';
            case OTStatus.Rejected: return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/50 dark:text-red-200';
            case OTStatus.Submitted: return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-700 dark:text-gray-300';
        }
    };

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthName = currentDate.toLocaleString('default', { month: 'long' });

    // Detail Modal Content
    const renderDetailContent = () => {
        if (!selectedDate) return null;
        
        const dayRequests = getRequestsForDay(selectedDate);
        // For the modal, we might want to see whose shift it is if multiple people are in the list
        // But if we are in "My OT", it's just my shift. 
        // If "Team", we might show multiple. 
        // For simplicity, let's show all relevant items for that date.
        
        const dayAssignments = shifts.filter(s => new Date(s.date).toDateString() === selectedDate.toDateString());

        return (
            <div className="space-y-6">
                {/* Shift Context Section */}
                <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg border dark:border-gray-700">
                    <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Shift Schedule</h4>
                    {dayAssignments.length > 0 ? (
                        <div className="space-y-2">
                            {dayAssignments.map(assign => {
                                const template = templates.find(t => t.id === assign.shiftTemplateId);
                                return (
                                    <div key={assign.id} className="flex justify-between items-center">
                                        <span className="font-medium text-gray-900 dark:text-white">
                                            {/* In a real app, fetch employee name via ID if mixed view */}
                                            Shift
                                        </span>
                                        <span className="text-sm bg-white dark:bg-gray-700 px-2 py-1 rounded border dark:border-gray-600">
                                            {template ? `${template.name} (${template.startTime} - ${template.endTime})` : 'Unknown Shift'}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500 italic">No shift assigned for this date.</p>
                    )}
                </div>

                {/* OT Requests Section */}
                <div>
                    <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Overtime Requests</h4>
                    {dayRequests.length > 0 ? (
                        <div className="space-y-3">
                            {dayRequests.map(req => (
                                <div key={req.id} className="border dark:border-gray-700 rounded-lg p-3 shadow-sm">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <p className="font-bold text-gray-900 dark:text-white">{req.employeeName}</p>
                                            <p className="text-xs text-gray-500">{req.startTime} - {req.endTime}</p>
                                        </div>
                                        <span className={`px-2 py-1 text-xs font-bold rounded-full ${getStatusColor(req.status)}`}>
                                            {req.status}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">Reason: {req.reason}</p>
                                    {req.approvedHours && (
                                        <p className="text-xs font-semibold text-green-600 dark:text-green-400">
                                            Approved: {req.approvedHours} Hrs
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500 italic text-center py-4">No overtime requests for this date.</p>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                    <span className="mr-2">📅</span> {monthName} {getMonthData.year}
                </h2>
                <div className="flex space-x-2">
                    <Button variant="secondary" size="sm" onClick={handlePrevMonth}><ChevronLeftIcon/></Button>
                    <Button variant="secondary" size="sm" onClick={handleToday}>Today</Button>
                    <Button variant="secondary" size="sm" onClick={handleNextMonth}><ChevronRightIcon/></Button>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">
                {weekDays.map(day => (
                    <div key={day} className="py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {day}
                    </div>
                ))}
            </div>
            
            <div className="grid grid-cols-7 auto-rows-fr bg-gray-200 dark:bg-slate-700 gap-px border-b border-gray-200 dark:border-slate-700">
                {getMonthData.calendarDays.map((day, index) => {
                    if (!day) {
                        return <div key={`empty-${index}`} className="bg-white dark:bg-slate-800 min-h-[100px]"></div>;
                    }

                    const dayRequests = getRequestsForDay(day);
                    const dayShiftTemplate = getShiftForDay(day);
                    const isToday = new Date().toDateString() === day.toDateString();

                    return (
                        <div 
                            key={day.toISOString()} 
                            className="bg-white dark:bg-slate-800 min-h-[100px] p-2 relative hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                            onClick={() => handleDayClick(day)}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                                    {day.getDate()}
                                </span>
                                {dayShiftTemplate && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 truncate max-w-[60px]" title={dayShiftTemplate.name}>
                                        {dayShiftTemplate.name}
                                    </span>
                                )}
                            </div>
                            
                            <div className="space-y-1 mt-2">
                                {dayRequests.map(req => (
                                    <div 
                                        key={req.id} 
                                        className={`text-xs px-2 py-1 rounded truncate border-l-2 ${getStatusColor(req.status)}`}
                                        title={`${req.employeeName}: ${req.startTime}-${req.endTime} (${req.status})`}
                                    >
                                        {req.startTime}-{req.endTime}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
            
            {/* Legend */}
            <div className="p-4 bg-gray-50 dark:bg-slate-900/30 flex flex-wrap gap-4 text-xs text-gray-600 dark:text-gray-400">
                <div className="flex items-center"><span className="w-3 h-3 rounded-sm bg-yellow-100 border border-yellow-200 mr-2"></span> Pending</div>
                <div className="flex items-center"><span className="w-3 h-3 rounded-sm bg-green-100 border border-green-200 mr-2"></span> Approved</div>
                <div className="flex items-center"><span className="w-3 h-3 rounded-sm bg-red-100 border border-red-200 mr-2"></span> Rejected</div>
            </div>

            <Modal
                isOpen={isDetailModalOpen}
                onClose={() => setIsDetailModalOpen(false)}
                title={selectedDate ? selectedDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Details'}
                footer={<div className="flex justify-end"><Button onClick={() => setIsDetailModalOpen(false)}>Close</Button></div>}
            >
                {renderDetailContent()}
            </Modal>
        </div>
    );
};

export default OTCalendar;
