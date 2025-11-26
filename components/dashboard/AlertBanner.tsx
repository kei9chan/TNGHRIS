import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { mockAnnouncements } from '../../services/mockData';
import { useAuth } from '../../hooks/useAuth';

const MegaphoneIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-2.236 9.168-5.584C18.354 1.832 18 1.65 18 1.5a.5.5 0 00-.5-.5H3a.5.5 0 00-.5.5c0 .15.354.332.832.667C5.375 5.236 7.9 7.5 11 7.5h1.832" />
    </svg>
);

const AlertBanner: React.FC = () => {
    const { user } = useAuth();

    const latestUnacknowledgedAlert = useMemo(() => {
        if (!user) return null;
        
        const relevantAlerts = mockAnnouncements.filter(a =>
            a.type === 'Policy' &&
            (a.targetGroup === 'All' || a.targetGroup === user.department) &&
            !a.acknowledgementIds.includes(user.id)
        );

        if (relevantAlerts.length === 0) return null;

        // Return the most recent one
        return relevantAlerts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    }, [user]);

    if (!latestUnacknowledgedAlert) {
        return null;
    }

    return (
        <div className="p-4 rounded-md bg-blue-50 dark:bg-blue-900/40 border border-blue-400 dark:border-blue-800 mb-6">
            <div className="flex">
                <div className="flex-shrink-0 text-blue-600 dark:text-blue-300">
                    <MegaphoneIcon />
                </div>
                <div className="ml-3 flex-1 md:flex md:justify-between">
                    <p className="text-sm text-blue-700 dark:text-blue-200">
                        <span className="font-bold">Policy Alert:</span> You have a new policy to review - "{latestUnacknowledgedAlert.title}"
                    </p>
                    <p className="mt-3 text-sm md:mt-0 md:ml-6">
                        <Link to="/helpdesk/announcements" className="whitespace-nowrap font-medium text-blue-700 hover:text-blue-600 dark:text-blue-200 dark:hover:text-blue-100">
                            Read & Acknowledge <span aria-hidden="true">&rarr;</span>
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AlertBanner;