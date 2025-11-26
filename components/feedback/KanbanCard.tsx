
import React from 'react';
import { IncidentReport, IRStatus, NTEStatus, ResolutionStatus } from '../../types';
import { mockNTEs, mockResolutions } from '../../services/mockData';

interface KanbanCardProps {
    report: IncidentReport;
    onCardClick: (report: IncidentReport) => void;
    onDragStart: (e: React.DragEvent<HTMLDivElement>, reportId: string) => void;
    onDragEnd: () => void;
    isDragging: boolean;
}

const UserIcon = ({className}: {className?: string}) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>);
const CalendarIcon = ({className}: {className?: string}) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>);

const KanbanCard: React.FC<KanbanCardProps> = ({ report, onCardClick, onDragStart, onDragEnd, isDragging }) => {
    const nte = report.nteIds.length > 0 ? mockNTEs.find(n => n.id === report.nteIds[0]) : null;

    const getTag = () => {
        const resolution = mockResolutions.find(r => r.id === report.resolutionId || r.incidentReportId === report.id.split('_VIRTUAL_')[0]);
        
        if (resolution && resolution.status === ResolutionStatus.Rejected) {
            return { text: 'Rejected', color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' };
        }

        if (nte?.status === NTEStatus.HearingScheduled) {
             return { text: 'Hearing Set', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200' };
        }

        // Stage-specific overrides requested by user
        if (report.pipelineStage === 'nte-for-approval') {
             return { text: 'For Approval', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200' };
        }
        if (report.pipelineStage === 'bod-gm-approval') {
             return { text: 'For Approval', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200' };
        }
        if (report.pipelineStage === 'resolution') {
             return { text: 'Pending Employee Acknowledgment', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200' };
        }
        
        // Existing Logic
        if (report.pipelineStage === 'nte-sent') {
            return { text: 'Awaiting Response', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200' };
        }
        if (report.pipelineStage === 'hr-review-response') {
             return { text: 'HR Review', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200' };
        }
        if (report.status === IRStatus.HRReview) {
            return { text: 'HR Review', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200' };
        }
        if (report.status === IRStatus.Submitted) {
            return { text: 'New', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' };
        }
        // New status logic for Converted to Coaching
        if (report.status === IRStatus.Converted || report.pipelineStage === 'converted-coaching') {
            return { text: 'For Coaching', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200' };
        }

        return { text: report.status, color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' };
    };

    const tag = getTag();
    const displayId = (report.pipelineStage === 'nte-sent' || report.pipelineStage === 'hr-review-response') && nte ? nte.id : report.id;
    
    const getHearingDateStyle = (date: Date) => {
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const isPast = date < now;
        
        if (isToday) return 'text-orange-600 dark:text-orange-400 font-bold';
        if (isPast) return 'text-red-600 dark:text-red-400 font-bold'; // Overdue
        return 'text-gray-500 dark:text-gray-400';
    };

    return (
        <div
            draggable
            onDragStart={(e) => onDragStart(e, report.id)}
            onDragEnd={onDragEnd}
            onClick={() => onCardClick(report)}
            className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 p-4 cursor-pointer hover:shadow-md transition-shadow ${isDragging ? 'opacity-50 ring-2 ring-indigo-500' : ''}`}
        >
            <div className="flex justify-between items-start mb-2">
                <p className="text-xs font-mono text-gray-500 dark:text-gray-400">{displayId}</p>
                <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${tag.color}`}>
                    {tag.text}
                </span>
            </div>
            <h4 className="font-bold text-gray-800 dark:text-gray-200">{report.category}</h4>
            
            {nte?.hearingDetails && (
                <div className={`mt-2 flex items-center text-xs ${getHearingDateStyle(new Date(nte.hearingDetails.date))}`}>
                    <CalendarIcon className="h-4 w-4 mr-1.5" />
                    <span>{new Date(nte.hearingDetails.date).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}</span>
                </div>
            )}

            <div className="mt-3 flex justify-between items-center text-sm text-gray-500 dark:text-gray-400">
                <div className="flex items-center">
                    <UserIcon className="h-4 w-4 mr-1.5 text-gray-400" />
                    <span>{report.involvedEmployeeNames.join(', ')}</span>
                </div>
                <span>{new Date(report.dateTime).toLocaleDateString()}</span>
            </div>
            {report.assignedToName && (
                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700/50 flex items-center text-xs text-gray-500 dark:text-gray-400">
                    <UserIcon className="h-4 w-4 mr-1.5 text-gray-400" />
                    <span>Handled by: {report.assignedToName}</span>
                </div>
            )}
        </div>
    );
};

export default KanbanCard;
