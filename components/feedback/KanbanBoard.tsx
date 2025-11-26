import React, { useState } from 'react';
import { IncidentReport, PipelineStage } from '../../types';
import KanbanColumn from './KanbanColumn';

interface KanbanBoardProps {
  reports: IncidentReport[];
  stages: PipelineStage[];
  onUpdateStage: (reportId: string, newStage: string) => void;
  onCardClick: (report: IncidentReport) => void;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({ reports, stages, onUpdateStage, onCardClick }) => {
    const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

    const columns = stages; // Display all stages including 'Closed'

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, reportId: string) => {
        e.dataTransfer.setData('text/plain', reportId);
        setDraggedItemId(reportId);
    };
    
    const handleDragEnd = () => {
        setDraggedItemId(null);
    };

    return (
        <div className="flex space-x-6 overflow-x-auto pb-6 items-start">
            {columns.map(stage => (
                <div key={stage.id} className="w-80 flex-shrink-0">
                    <KanbanColumn
                        stage={stage}
                        reports={reports.filter(r => r.pipelineStage === stage.id)}
                        onUpdateStage={onUpdateStage}
                        onCardClick={onCardClick}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        draggedItemId={draggedItemId}
                    />
                </div>
            ))}
        </div>
    );
};

export default KanbanBoard;