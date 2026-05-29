import React, { useState } from 'react';
import { IncidentReport, PipelineStage } from '../../types';
import KanbanCard from './KanbanCard';

interface KanbanColumnProps {
  stage: PipelineStage;
  reports: IncidentReport[];
  onUpdateStage: (reportId: string, newStage: string) => void;
  onCardClick: (report: IncidentReport) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, reportId: string) => void;
  onDragEnd: () => void;
  draggedItemId: string | null;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ stage, reports, onUpdateStage, onCardClick, onDragStart, onDragEnd, draggedItemId }) => {
    const [isDragOver, setIsDragOver] = useState(false);

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const reportId = e.dataTransfer.getData('text/plain');
        if (reportId && reportId !== draggedItemId) { // Ensure it's a new item or from another list
             onUpdateStage(reportId, stage.code || stage.id);
        } else if (draggedItemId) { // Handle drop within the same list or from another
             onUpdateStage(draggedItemId, stage.code || stage.id);
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
    
    const [isExpanded, setIsExpanded] = useState(false);
    const visibleReports = isExpanded ? reports : reports.slice(0, 5);
    
    return (
        <div className="flex flex-col">
            <div className="mb-4 px-2 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{stage.name}</h3>
                <span className="px-2.5 py-1 text-xs font-bold text-white bg-blue-600 rounded-full">{reports.length}</span>
            </div>
            <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`space-y-4 min-h-[400px] transition-colors rounded-lg ${isDragOver ? 'bg-gray-200 dark:bg-gray-700/50' : ''}`}
            >
                {visibleReports.map(report => (
                    <KanbanCard
                        key={report.id}
                        report={report}
                        onCardClick={onCardClick}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        isDragging={draggedItemId === report.id}
                    />
                ))}
                
                {reports.length > 5 && (
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="w-full py-2 mt-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 dark:text-gray-300 dark:hover:text-white dark:bg-gray-800 dark:hover:bg-gray-700 rounded-md transition-colors border border-transparent"
                    >
                        {isExpanded ? 'See less' : `See more (${reports.length - 5})`}
                    </button>
                )}
            </div>
        </div>
    );
};

export default KanbanColumn;