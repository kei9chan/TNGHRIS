import React, { useState, useMemo } from 'react';
import { CalendarEvent, Permission, Role } from '../../types';
import { mockCalendarEvents } from '../../services/mockData';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../hooks/useAuth';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import EventModal from '../../components/helpdesk/EventModal';

const Calendar: React.FC = () => {
    const { can } = usePermissions();
    const { user } = useAuth();
    const canManage = can('Helpdesk', Permission.Edit);
    const [currentDate, setCurrentDate] = useState(new Date('2025-11-04'));
    const [events, setEvents] = useState<CalendarEvent[]>(mockCalendarEvents);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<Partial<CalendarEvent> | null>(null);

    const visibleEvents = useMemo(() => {
        if (!user) return [];

        const privilegedRoles = [Role.Admin, Role.BOD, Role.GeneralManager, Role.HRManager, Role.HRStaff];
        
        if (privilegedRoles.includes(user.role)) {
            return events;
        }

        return events.filter(event => {
            const isBirthday = event.id.startsWith('bday-');
            const isAnniversary = event.id.startsWith('anniv-');

            if (isBirthday) {
                return event.id === `bday-${user.id}`;
            }
            if (isAnniversary) {
                return event.id === `anniv-${user.id}`;
            }
            // General event, visible to all
            return true;
        });
    }, [user, events]);

    const { days, monthName, year } = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const dayArray: (Date | null)[] = [];
        // Add padding for previous month
        for (let i = 0; i < firstDayOfMonth; i++) {
            dayArray.push(null);
        }
        // Add days of the current month
        for (let i = 1; i <= daysInMonth; i++) {
            dayArray.push(new Date(year, month, i));
        }

        return {
            days: dayArray,
            monthName: currentDate.toLocaleString('default', { month: 'long' }),
            year: year
        };
    }, [currentDate]);

    const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    const handleToday = () => setCurrentDate(new Date());

    const handleOpenModal = (event: Partial<CalendarEvent> | null) => {
        // Allow viewing birthdays for all, but only HR can manage other events
        if (!canManage && !event?.id?.startsWith('bday-') && !event?.id?.startsWith('anniv-')) return;
        setSelectedEvent(event);
        setIsModalOpen(true);
    };

    const handleSaveEvent = (eventToSave: CalendarEvent) => {
        if (eventToSave.id) {
            setEvents(prev => prev.map(e => e.id === eventToSave.id ? eventToSave : e));
        } else {
            const newEvent = { ...eventToSave, id: `event-${Date.now()}` };
            setEvents(prev => [...prev, newEvent]);
        }
        setIsModalOpen(false);
    };

    const handleDeleteEvent = (eventId: string) => {
        setEvents(prev => prev.filter(e => e.id !== eventId));
        setIsModalOpen(false);
    };

    const eventColors = {
        blue: 'bg-blue-500 hover:bg-blue-600 text-white',
        green: 'bg-green-500 hover:bg-green-600 text-white',
        red: 'bg-red-500 hover:bg-red-600 text-white',
        yellow: 'bg-yellow-400 hover:bg-yellow-500 text-black',
        purple: 'bg-purple-500 hover:bg-purple-600 text-white',
    };
    
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Calendar</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
                📆 <strong>Calendar</strong><br />
                Track scheduled maintenance, HR events, or support deadlines — visualize upcoming tasks and helpdesk commitments.
            </p>
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center space-x-2">
                    <Button variant="secondary" onClick={handlePrevMonth}>&larr;</Button>
                    <Button variant="secondary" onClick={handleToday}>Today</Button>
                    <Button variant="secondary" onClick={handleNextMonth}>&rarr;</Button>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 ml-4">{monthName} {year}</h2>
                </div>
                {canManage && <Button onClick={() => handleOpenModal({ start: new Date(), end: new Date() })}>New Event</Button>}
            </div>

            <Card className="!p-0">
                <div className="grid grid-cols-7 text-center font-semibold text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className="py-2">{day}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7">
                    {days.map((day, index) => {
                        if (!day) return <div key={`empty-${index}`} className="border-r border-b border-gray-200 dark:border-gray-700"></div>;

                        const eventsForDay = visibleEvents.filter(e => new Date(e.start).toDateString() === day.toDateString());
                        const isToday = new Date().toDateString() === day.toDateString();

                        return (
                            <div key={day.toISOString()} className="h-40 border-r border-b border-gray-200 dark:border-gray-700 p-2 flex flex-col cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50" onClick={() => handleOpenModal({ start: day, end: day })}>
                                <span className={`self-end flex items-center justify-center h-7 w-7 rounded-full text-sm ${isToday ? 'bg-indigo-600 text-white font-bold' : ''}`}>
                                    {day.getDate()}
                                </span>
                                <div className="flex-grow overflow-y-auto space-y-1 mt-1">
                                    {eventsForDay.map(event => (
                                        <div key={event.id} className={`p-1 rounded text-xs truncate ${eventColors[event.color]}`} onClick={(e) => { e.stopPropagation(); handleOpenModal(event); }}>
                                            {event.title}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Card>

            <EventModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                event={selectedEvent}
                onSave={handleSaveEvent}
                onDelete={handleDeleteEvent}
                isReadOnly={selectedEvent?.id?.startsWith('bday-') || selectedEvent?.id?.startsWith('anniv-')}
            />
        </div>
    );
};

export default Calendar;