// Phase A complete: mockDataCompat removed from UpcomingEventsWidget
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarEvent, Role } from '../../types';
import Card from '../ui/Card';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabaseClient';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const getStartOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1);
};

const getEndOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
};

// Map a DB row to the CalendarEvent shape used by the rest of the app.
// The DB stores start/end as ISO strings; we promote them to Date objects
// and normalise the color to the known union.
const VALID_COLORS: CalendarEvent['color'][] = ['blue', 'green', 'red', 'yellow', 'purple'];
const safeColor = (raw: string | null | undefined): CalendarEvent['color'] =>
    VALID_COLORS.includes(raw as CalendarEvent['color']) ? (raw as CalendarEvent['color']) : 'blue';

const mapRow = (row: Record<string, unknown>): CalendarEvent => ({
    id: row.id as string,
    title: row.title as string,
    start: new Date((row.start_date ?? row.start) as string),
    end: new Date((row.end_date ?? row.end ?? row.start_date ?? row.start) as string),
    color: safeColor(row.color as string ?? row.event_type as string),
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const UpcomingEventsWidget: React.FC = () => {
    const { user } = useAuth();
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const today = new Date();
        const startOfMonth = getStartOfMonth(today);
        startOfMonth.setHours(0, 0, 0, 0);
        const endOfMonth = getEndOfMonth(today);
        endOfMonth.setHours(23, 59, 59, 999);

        supabase
            .from('helpdesk_calendar_events')
            .select('*')
            .gte('start', startOfMonth.toISOString())
            .lte('start', endOfMonth.toISOString())
            .order('start', { ascending: true })
            .then(({ data, error }) => {
                if (cancelled) return;
                if (!error && data) {
                    setEvents((data as Record<string, unknown>[]).map(mapRow));
                }
                setIsLoading(false);
            });

        return () => { cancelled = true; };
    }, []);

    const upcomingEvents = useMemo(() => {
        if (!user) return [];
        const privilegedRoles = [Role.Admin, Role.BOD, Role.GeneralManager, Role.HRManager, Role.HRStaff];
        if (privilegedRoles.includes(user.role)) return events;
        return events.filter(e => !e.id.startsWith('bday-') && !e.id.startsWith('anniv-'));
    }, [user, events]);

    const eventColors: { [key in CalendarEvent['color']]: string } = {
        blue: 'border-blue-500',
        green: 'border-green-500',
        red: 'border-red-500',
        yellow: 'border-yellow-400',
        purple: 'border-purple-500',
    };

    return (
        <Card title="This Month's Events">
            {isLoading ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">Loading…</p>
            ) : upcomingEvents.length > 0 ? (
                <ul className="space-y-3">
                    {upcomingEvents.map(event => (
                        <li key={event.id} className={`p-3 rounded-md border-l-4 ${eventColors[event.color]} bg-gray-50 dark:bg-slate-800/50`}>
                            <Link to="/helpdesk/calendar" className="block hover:bg-gray-100 dark:hover:bg-slate-700/50 -m-3 p-3 rounded-md">
                                <div className="flex justify-between items-center">
                                    <p className="font-semibold text-gray-800 dark:text-gray-200">{event.title}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        {new Date(event.start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                    </p>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">No events scheduled for this month.</p>
            )}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-right">
                <Link to="/helpdesk/calendar" className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                    View Full Calendar &rarr;
                </Link>
            </div>
        </Card>
    );
};

export default UpcomingEventsWidget;