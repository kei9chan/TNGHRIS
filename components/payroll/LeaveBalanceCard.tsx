import React from 'react';
import { LeaveBalance } from '../../types';

interface LeaveBalanceCardProps {
  balance: LeaveBalance & { available: number; name: string };
}

const LeaveBalanceCard: React.FC<LeaveBalanceCardProps> = ({ balance }) => {
  const isLowBalance = balance.available < 3;
  const totalPotential = balance.opening + balance.accrued + balance.adjusted;
  const percentage = totalPotential > 0 ? Math.min(100, Math.max(0, (balance.available / totalPotential) * 100)) : 0;

  return (
    <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-4 relative overflow-hidden">
      <div className="flex justify-between items-start relative z-10">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{balance.name}</h3>
        <div className={`text-3xl font-bold ${isLowBalance ? 'text-red-500' : 'text-indigo-600 dark:text-indigo-400'}`}>
          {balance.available.toFixed(1)}
        </div>
      </div>
      
      <p className={`text-right text-sm ${isLowBalance ? 'text-red-500 font-medium' : 'text-gray-500 dark:text-gray-400'} relative z-10`}>
          {isLowBalance ? 'Low Balance' : 'days available'}
      </p>

      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-3 mb-3">
            <div 
                className={`${isLowBalance ? 'bg-red-500' : 'bg-indigo-500'} h-1.5 rounded-full transition-all duration-500`} 
                style={{ width: `${percentage}%` }}
            ></div>
      </div>

      <div className="pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 grid grid-cols-3 gap-1 relative z-10">
        <div>
            <span className="block text-[10px] uppercase tracking-wider text-gray-400">Opening</span>
            <span className="font-medium text-sm">{balance.opening}</span>
        </div>
        <div className="text-center">
            <span className="block text-[10px] uppercase tracking-wider text-gray-400">Accrued</span>
            <span className="font-medium text-sm">{balance.accrued.toFixed(1)}</span>
        </div>
        <div className="text-right">
             <span className="block text-[10px] uppercase tracking-wider text-gray-400">Used</span>
             <span className="font-medium text-sm">{balance.used.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
};

export default LeaveBalanceCard;