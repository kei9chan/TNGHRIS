import React, { useState } from 'react';
import { ApplicationStage } from '../../types';
import { EnrichedApplication } from '../../pages/recruitment/Applicants';
import ApplicantKanbanCard from './ApplicantKanbanCard';

interface ApplicantKanbanColumnProps {
  stage: ApplicationStage;
  applications: EnrichedApplication[];
  onUpdateStage: (applicationId: string, newStage: ApplicationStage) => void;
  onCardClick: (application: EnrichedApplication) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, applicationId: string) => void;
  onDragEnd: () => void;
  draggedItemId: string | null;
}

const ApplicantKanbanColumn: React.FC<ApplicantKanbanColumnProps> = ({ stage, applications, onUpdateStage, onCardClick, onDragStart, onDragEnd, draggedItemId }) => {
    const [isDragOver, setIsDragOver] = useState(false);

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const applicationId = e.dataTransfer.getData('text/plain');
        const targetId = draggedItemId || applicationId;
        if (targetId) {
             onUpdateStage(targetId, stage);
        }
        setIsDragOver(false);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(true);
    };
    
    const handleDragLeave = () => {
        setIsDragOver(false);
    };
    
    return (
        <div className="flex-shrink-0 w-80">
            <div className="mb-4 px-2 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{stage}</h3>
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    {applications.length}
                </span>
            </div>
            <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`bg-gray-100 dark:bg-gray-800 rounded-lg p-2 space-y-3 min-h-[60vh] transition-colors ${isDragOver ? 'bg-indigo-100 dark:bg-indigo-900/50 ring-2 ring-indigo-400' : ''}`}
            >
                {applications.map(app => (
                    <ApplicantKanbanCard
                        key={app.id}
                        application={app}
                        onCardClick={onCardClick}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        isDragging={draggedItemId === app.id}
                    />
                ))}
                {applications.length === 0 && (
                    <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm p-4">
                        Drop applicants here
                    </div>
                )}
            </div>
        </div>
    );
};

export default ApplicantKanbanColumn;
