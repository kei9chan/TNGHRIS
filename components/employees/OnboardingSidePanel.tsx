import React from 'react';
import { Link } from 'react-router-dom';
import { OnboardingChecklist, OnboardingTaskStatus, OnboardingTaskType } from '../../types';
import Button from '../ui/Button';
import OnboardingStatusBadge from './OnboardingStatusBadge';

interface OnboardingSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  checklist: OnboardingChecklist | null;
  onUpdateTask: (taskId: string, status: OnboardingTaskStatus) => void;
}

const XIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>);

const OnboardingSidePanel: React.FC<OnboardingSidePanelProps> = ({ isOpen, onClose, checklist, onUpdateTask }) => {
  if (!checklist) return null;
  
  const canQuickComplete = (taskType: OnboardingTaskType) => {
      return [OnboardingTaskType.Read, OnboardingTaskType.Video].includes(taskType);
  }

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      ></div>

      {/* Side Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="side-panel-title"
      >
        <div className="flex flex-col h-full">
          <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 id="side-panel-title" className="text-xl font-semibold text-gray-900 dark:text-white">
              My Lifecycle Tasks
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <XIcon />
            </button>
          </div>

          <div className="flex-grow overflow-y-auto p-4">
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {checklist.tasks.map(task => (
                <li key={task.id} className="py-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{task.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Due: {new Date(task.dueDate).toLocaleDateString()}</p>
                    </div>
                    <OnboardingStatusBadge status={task.status} />
                  </div>
                  <div className="mt-2 flex justify-end space-x-2">
                    <Link to={`/employees/onboarding/task/${task.id}`}>
                        <Button variant="secondary" size="sm">View</Button>
                    </Link>
                    {task.status === OnboardingTaskStatus.Pending && canQuickComplete(task.taskType) && (
                        <Button size="sm" onClick={() => onUpdateTask(task.id, OnboardingTaskStatus.Completed)}>Quick Complete</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

export default OnboardingSidePanel;