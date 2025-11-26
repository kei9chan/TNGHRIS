import React, { useState } from 'react';
import { ApplicationStage } from '../../types';
import { EnrichedApplication } from '../../pages/recruitment/Applicants';
import ApplicantKanbanColumn from './ApplicantKanbanColumn';

interface ApplicantKanbanBoardProps {
  applications: EnrichedApplication[];
  onUpdateStage: (applicationId: string, newStage: ApplicationStage) => void;
  onCardClick: (application: EnrichedApplication) => void;
}

const ApplicantKanbanBoard: React.FC<ApplicantKanbanBoardProps> = ({ applications, onUpdateStage, onCardClick }) => {
    const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

    const columns = Object.values(ApplicationStage);

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, applicationId: string) => {
        e.dataTransfer.setData('text/plain', applicationId);
        setDraggedItemId(applicationId);
    };
    
    const handleDragEnd = () => {
        setDraggedItemId(null);
    };

    return (
        <div className="flex space-x-4 overflow-x-auto pb-4">
            {columns.map(stage => (
                <ApplicantKanbanColumn
                    key={stage}
                    stage={stage}
                    applications={applications.filter(app => app.stage === stage)}
                    onUpdateStage={onUpdateStage}
                    onCardClick={onCardClick}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    draggedItemId={draggedItemId}
                />
            ))}
        </div>
    );
};

export default ApplicantKanbanBoard;
