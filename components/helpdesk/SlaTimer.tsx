import React, { useState, useEffect } from 'react';
import { TicketStatus } from '../../types';

interface SlaTimerProps {
  deadline?: Date;
  assignedAt?: Date;
  resolvedAt?: Date;
  status: TicketStatus;
}

const SlaTimer: React.FC<SlaTimerProps> = ({ deadline, assignedAt, resolvedAt, status }) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [colorClass, setColorClass] = useState('text-gray-800 dark:text-gray-200');

  useEffect(() => {
    if (status === TicketStatus.Resolved && resolvedAt && assignedAt) {
      const resolutionTime = new Date(resolvedAt).getTime() - new Date(assignedAt).getTime();
      const hours = Math.floor(resolutionTime / 3600000);
      const minutes = Math.floor((resolutionTime % 3600000) / 60000);
      setTimeLeft(`Resolved in ${hours}h ${minutes}m`);
      setColorClass('text-green-600 dark:text-green-400');
      return;
    }

    if (status === TicketStatus.Closed) {
      setTimeLeft('Closed');
      setColorClass('text-gray-500 dark:text-gray-400');
      return;
    }

    if (!deadline) {
      setTimeLeft('N/A');
      setColorClass('text-gray-500 dark:text-gray-400');
      return;
    }

    const timer = setInterval(() => {
      const now = new Date();
      const distance = new Date(deadline).getTime() - now.getTime();

      if (distance < 0) {
        const overdueDistance = now.getTime() - new Date(deadline).getTime();
        const days = Math.floor(overdueDistance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((overdueDistance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        setTimeLeft(`Overdue by ${days > 0 ? `${days}d ` : ''}${hours}h`);
        setColorClass('text-red-600 dark:text-red-400 font-bold animate-pulse');
        return;
      }
      
      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      
      setTimeLeft(`Due in ${days > 0 ? `${days}d ` : ''}${hours}h ${minutes}m`);
      
      const hoursLeft = distance / (1000 * 60 * 60);
      if (hoursLeft <= 4) {
        setColorClass('text-red-600 dark:text-red-400');
      } else if (hoursLeft <= 24) {
        setColorClass('text-yellow-600 dark:text-yellow-400');
      } else {
        setColorClass('text-gray-800 dark:text-gray-200');
      }

    }, 1000 * 60); // Update every minute

    // Initial call
    const now = new Date();
    const distance = new Date(deadline).getTime() - now.getTime();
    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    setTimeLeft(`Due in ${days > 0 ? `${days}d ` : ''}${hours}h ${minutes}m`);

    return () => clearInterval(timer);
  }, [deadline, status, resolvedAt, assignedAt]);
  
  return (
    <div className={`text-sm font-semibold ${colorClass}`}>
        <p>{timeLeft}</p>
        {deadline && status !== TicketStatus.Resolved && status !== TicketStatus.Closed && <p className="text-xs font-normal text-gray-500">{new Date(deadline).toLocaleString()}</p>}
    </div>
  );
};

export default SlaTimer;