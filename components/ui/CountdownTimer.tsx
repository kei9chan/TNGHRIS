import React, { useState, useEffect } from 'react';
import { NTEStatus } from '../../types';

interface CountdownTimerProps {
  deadline: Date;
  status: NTEStatus;
}

const CountdownTimer: React.FC<CountdownTimerProps> = ({ deadline, status }) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [colorClass, setColorClass] = useState('text-gray-800 dark:text-gray-200');

  useEffect(() => {
    if (status === NTEStatus.Waiver) {
      setTimeLeft('Waiver Acknowledged. No response required.');
      setColorClass('text-green-600 dark:text-green-400');
      return;
    }

    const timer = setInterval(() => {
      const now = new Date();
      const distance = new Date(deadline).getTime() - now.getTime();
      
      if (distance < 0) {
        setTimeLeft('Deadline has passed.');
        setColorClass('text-red-600 dark:text-red-400 font-bold');
        clearInterval(timer);
        return;
      }
      
      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);
      
      setTimeLeft(`${days}d ${hours}h ${minutes}m ${seconds}s remaining`);
      
      // Simulating reminders with color changes
      const hoursLeft = distance / (1000 * 60 * 60);
      if (hoursLeft <= 24) {
        setColorClass('text-red-600 dark:text-red-400'); // 24h reminder
      } else if (hoursLeft <= 72) {
        setColorClass('text-yellow-600 dark:text-yellow-400'); // 72h reminder
      } else {
        setColorClass('text-gray-800 dark:text-gray-200');
      }

    }, 1000);
    
    return () => clearInterval(timer);
  }, [deadline, status]);
  
  return (
    <div>
        <p className="font-semibold text-gray-800 dark:text-gray-300">
            Deadline: {new Date(deadline).toLocaleString()}
        </p>
        <p className={`mt-1 text-lg font-mono ${colorClass}`}>
            {timeLeft}
        </p>
    </div>
  );
};

export default CountdownTimer;