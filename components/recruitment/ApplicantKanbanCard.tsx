import React from 'react';
import { EnrichedApplication } from '../../pages/recruitment/Applicants';

interface ApplicantKanbanCardProps {
    application: EnrichedApplication;
    onCardClick: (application: EnrichedApplication) => void;
    onDragStart: (e: React.DragEvent<HTMLDivElement>, applicationId: string) => void;
    onDragEnd: () => void;
    isDragging: boolean;
}

const BriefcaseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
);


const ApplicantKanbanCard: React.FC<ApplicantKanbanCardProps> = ({ application, onCardClick, onDragStart, onDragEnd, isDragging }) => {
    
    return (
        <div
            draggable
            onDragStart={(e) => onDragStart(e, application.id)}
            onDragEnd={onDragEnd}
            onClick={() => onCardClick(application)}
            className={`bg-white dark:bg-gray-900 rounded-lg shadow-md p-3 cursor-grab hover:shadow-lg transition-shadow active:cursor-grabbing ${isDragging ? 'opacity-50 ring-2 ring-indigo-500' : ''}`}
            aria-grabbed={isDragging}
        >
            <h4 className="font-bold text-gray-800 dark:text-gray-200 text-base truncate">{application.candidateName}</h4>
            <div className="mt-2 flex items-center text-xs text-gray-500 dark:text-gray-400">
                <BriefcaseIcon />
                <span className="truncate">{application.jobTitle}</span>
            </div>
            <div className="mt-3 flex justify-between items-center text-xs text-gray-500 dark:text-gray-500">
                <span>Source: {application.ownerUserId ? 'Internal' : 'External'}</span>
                <span>{new Date(application.createdAt).toLocaleDateString()}</span>
            </div>
        </div>
    );
};

export default ApplicantKanbanCard;
