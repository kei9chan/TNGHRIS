import React from 'react';
import { OnboardingTaskStatus } from '../../types';

interface OnboardingStatusBadgeProps {
  status: OnboardingTaskStatus | 'Approved' | 'Rejected' | 'InProgress';
}

const OnboardingStatusBadge: React.FC<OnboardingStatusBadgeProps> = ({ status }) => {
  const styles: Record<string, string> = {
    [OnboardingTaskStatus.Pending]: 'bg-gray-100 text-gray-800 dark:bg-slate-700 dark:text-slate-200',
    [OnboardingTaskStatus.Completed]: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
    [OnboardingTaskStatus.Overdue]: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    [OnboardingTaskStatus.PendingApproval]: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
    Approved: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
    Rejected: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    InProgress: 'bg-gray-100 text-gray-800 dark:bg-slate-700 dark:text-slate-200',
  };

  const formattedStatus = status.replace(/([a-z])([A-Z])/g, '$1 $2').trim();

  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status] || styles[OnboardingTaskStatus.Pending]}`}>
      {formattedStatus}
    </span>
  );
};

export default OnboardingStatusBadge;
