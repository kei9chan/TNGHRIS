
import React, { useMemo } from 'react';
import { OTRequest, OTStatus } from '../../types';
import StatCard from '../dashboard/StatCard';

interface OTStatsProps {
    requests: OTRequest[];
}

const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const CalendarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
const TrendingUpIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>;

const OTStats: React.FC<OTStatsProps> = ({ requests }) => {
    
    const calculateDuration = (start: string, end: string): number => {
        if (!start || !end) return 0;
        const startTime = new Date(`1970-01-01T${start}:00`);
        const endTime = new Date(`1970-01-01T${end}:00`);
        if (endTime <= startTime) return 0;
        const diffMs = endTime.getTime() - startTime.getTime();
        return diffMs / (1000 * 60 * 60);
    };

    const stats = useMemo(() => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        let currentCutoffHours = 0;
        let pendingHours = 0;
        let ytdHours = 0;

        requests.forEach(req => {
            const reqDate = new Date(req.date);
            // Use approved hours if available, otherwise calculate from planned time
            const hours = req.approvedHours || calculateDuration(req.startTime, req.endTime);

            if (req.status === OTStatus.Submitted) {
                pendingHours += hours;
            }

            if (req.status === OTStatus.Approved && reqDate.getFullYear() === currentYear) {
                ytdHours += hours;
                
                // Simplified "Current Cutoff" logic: Current Month
                if (reqDate.getMonth() === currentMonth) {
                    currentCutoffHours += hours;
                }
            }
        });

        return {
            currentCutoff: currentCutoffHours.toFixed(1),
            pending: pendingHours.toFixed(1),
            ytd: ytdHours.toFixed(1)
        };
    }, [requests]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <StatCard 
                title="This Month (Approved)" 
                value={`${stats.currentCutoff} Hrs`} 
                icon={<ClockIcon />} 
                colorClass="bg-indigo-500" 
            />
            <StatCard 
                title="Pending Approval" 
                value={`${stats.pending} Hrs`} 
                icon={<CalendarIcon />} 
                colorClass="bg-yellow-500" 
            />
             <StatCard 
                title="YTD Overtime" 
                value={`${stats.ytd} Hrs`} 
                icon={<TrendingUpIcon />} 
                colorClass="bg-green-500" 
            />
        </div>
    );
};

export default OTStats;
