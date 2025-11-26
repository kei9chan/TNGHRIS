
import React from 'react';
import { IncidentReport, IRStatus, ResolutionStatus } from '../../types';
import { mockNTEs, mockResolutions } from '../../services/mockData';
import Card from '../ui/Card';

interface CaseListTableProps {
  reports: IncidentReport[];
  onRowClick: (report: IncidentReport) => void;
}

const getTag = (report: IncidentReport) => {
    const resolution = mockResolutions.find(r => r.id === report.resolutionId || r.incidentReportId === report.id.split('_VIRTUAL_')[0]);

    if (resolution && resolution.status === ResolutionStatus.Rejected) {
        return { text: 'Rejected', color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' };
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

const CaseListTable: React.FC<CaseListTableProps> = ({ reports, onRowClick }) => {
    return (
        <Card>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Case ID</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee(s)</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Category</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Handler</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {reports.map(report => {
                            const tag = getTag(report);
                            const nte = report.nteIds.length > 0 ? mockNTEs.find(n => n.id === report.nteIds[0]) : null;
                            const displayId = (report.pipelineStage === 'nte-sent' || report.pipelineStage === 'hr-review-response') && nte ? nte.id : report.id.split('_VIRTUAL_')[0];

                            return (
                                <tr key={report.id} onClick={() => onRowClick(report)} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">{displayId}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{report.involvedEmployeeNames.join(', ')}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{report.category}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{report.assignedToName || 'Unassigned'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(report.dateTime).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${tag.color}`}>
                                            {tag.text}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                        {reports.length === 0 && (
                            <tr>
                                <td colSpan={6} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                    No cases match the current filters.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

export default CaseListTable;
