import React, { useMemo } from 'react';
import { OnboardingChecklist, OnboardingTaskStatus } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { mockOnboardingTemplates } from '../../services/mockData';

interface OnboardingProgressCardProps {
  checklist?: OnboardingChecklist;
  onViewTasks: () => void;
}

const ClipboardCheckIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 0 1 9 9v.375M10.125 2.25A3.375 3.375 0 0 1 13.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375M9 15l2.25 2.25L15 12" /></svg>);

const OnboardingProgressCard: React.FC<OnboardingProgressCardProps> = ({ checklist, onViewTasks }) => {
  const { progress, overdueCount, templateName } = useMemo(() => {
    if (!checklist) {
        return { progress: 0, overdueCount: 0, templateName: '' };
    }
    const template = mockOnboardingTemplates.find(t => t.id === checklist.templateId);
    
    const totalPoints = checklist.tasks.reduce((sum, task) => sum + (task.points || 0), 0);
    const completedPoints = checklist.tasks
      .filter(task => task.status === OnboardingTaskStatus.Completed)
      .reduce((sum, task) => sum + (task.points || 0), 0);
    
    const overdue = checklist.tasks.filter(
      task => task.status === OnboardingTaskStatus.Pending && new Date(task.dueDate) < new Date()
    ).length;

    const progressPercentage = totalPoints > 0 ? (completedPoints / totalPoints) * 100 : 0;

    return { 
      progress: progressPercentage, 
      overdueCount: overdue,
      templateName: template?.name || 'My Checklist'
    };
  }, [checklist]);

  if (!checklist) {
      return (
        <Card>
            <div className="text-center py-4">
                <p className="text-gray-600 dark:text-gray-400">Your lifecycle checklist will appear here once assigned.</p>
            </div>
        </Card>
      )
  }

  return (
    <Card>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div className="flex-grow">
          <div className="flex items-center mb-2">
            <ClipboardCheckIcon className="w-6 h-6 text-indigo-500 mr-3" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{templateName} Progress</h2>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 my-2">
            <div className="bg-green-500 h-3 rounded-full" style={{ width: `${progress}%` }}></div>
          </div>
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>{Math.round(progress)}% Complete</span>
            {overdueCount > 0 ? (
                <span className="font-bold text-red-500">{overdueCount} Task(s) Overdue</span>
            ) : (
                <span>All tasks on track!</span>
            )}
          </div>
        </div>
        <div className="mt-4 md:mt-0 md:ml-6 flex-shrink-0">
            <Button onClick={onViewTasks} size="lg">View Tasks</Button>
        </div>
      </div>
    </Card>
  );
};

export default OnboardingProgressCard;