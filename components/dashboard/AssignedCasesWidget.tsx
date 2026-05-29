import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { IncidentReport, IRStatus, NTE, NTEStatus, ApproverStatus, ResolutionStatus } from '../../types';
import Card from '../ui/Card';
import { fetchIncidentReports } from '../../services/incidentReportService';
import { fetchNTEs } from '../../services/nteService';
import { fetchResolutions } from '../../services/resolutionService';
import { useAuth } from '../../hooks/useAuth';

type DisplayItem = {
    id: string;
    type: 'ir' | 'nte-approval' | 'res-approval';
    caseIdStr: string;
    category: string;
    involvedNames: string;
    stageLabel: string;
    dateTime: Date;
    link: string;
    colorClass: string;
};

interface AssignedCasesWidgetProps {
    userId?: string;
}

const AssignedCasesWidget: React.FC<AssignedCasesWidgetProps> = ({ userId }) => {
    const { user } = useAuth();
    const effectiveUserId = userId || user?.id;
    const [items, setItems] = useState<DisplayItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!user || !effectiveUserId) return;
        let cancelled = false;
        
        Promise.all([
            fetchIncidentReports(),
            fetchNTEs(),
            fetchResolutions()
        ])
        .then(([irData, nteData, resData]) => {
            if (!cancelled) {
                const displayItems: DisplayItem[] = [];

                const myCases = irData.filter(ir => 
                    ir.assignedToId === effectiveUserId && 
                    ir.status !== IRStatus.Closed && 
                    ir.status !== IRStatus.NoAction
                );

                myCases.forEach(ir => {
                    const caseIdStr = (ir as any).nteNumber ? `TNGNTE-${String((ir as any).nteNumber).padStart(5, '0')}` : ir.caseNumber ? `TNGIR-${String(ir.caseNumber).padStart(5, '0')}` : 'Case';
                    displayItems.push({
                        id: `ir-${ir.id}`,
                        type: 'ir',
                        caseIdStr,
                        category: ir.category,
                        involvedNames: ir.involvedEmployeeNames.join(', '),
                        stageLabel: getStageLabel(ir.pipelineStage),
                        dateTime: new Date(ir.dateTime),
                        link: '/feedback/cases',
                        colorClass: 'border-red-500'
                    });
                });

                const myPendingNTEs = nteData.filter(nte => 
                    nte.status === NTEStatus.PendingApproval &&
                    nte.approverSteps?.some(step => step.userId === effectiveUserId && step.status === ApproverStatus.Pending)
                );

                myPendingNTEs.forEach(nte => {
                    const caseIdStr = nte.nteNumber ? `TNGNTE-${String(nte.nteNumber).padStart(5, '0')}` : 'NTE';
                    displayItems.push({
                        id: `nte-${nte.id}`,
                        type: 'nte-approval',
                        caseIdStr,
                        category: 'NTE Approval Required',
                        involvedNames: nte.employeeName,
                        stageLabel: 'Pending Your Approval',
                        dateTime: new Date(nte.issuedDate),
                        link: `/feedback/nte/${nte.id}`,
                        colorClass: 'border-orange-500'
                    });
                });

                const myPendingResolutions = resData.filter(res => 
                    res.status === ResolutionStatus.PendingApproval &&
                    res.approverSteps?.some(step => step.userId === effectiveUserId && step.status === ApproverStatus.Pending)
                );

                myPendingResolutions.forEach(res => {
                    const ir = irData.find(i => i.id === res.incidentReportId);
                    const caseIdStr = ir?.caseNumber ? `TNGIR-${String(ir.caseNumber).padStart(5, '0')}` : 'Case';
                    displayItems.push({
                        id: `res-${res.id}`,
                        type: 'res-approval',
                        caseIdStr,
                        category: 'Resolution Approval Required',
                        involvedNames: res.employeeName,
                        stageLabel: 'Pending Your Approval',
                        dateTime: new Date(res.dateIssued),
                        link: `/feedback/cases?action=approve_resolution&caseId=${res.incidentReportId}&employeeId=${res.employeeId}`,
                        colorClass: 'border-yellow-500'
                    });
                });

                setItems(displayItems);
            }
        })
        .catch(() => {
            if (!cancelled) setItems([]);
        })
        .finally(() => {
            if (!cancelled) setIsLoading(false);
        });
            
        return () => { cancelled = true; };
    }, [effectiveUserId, user]);

    const sortedItems = items.sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime());

    const getStageLabel = (stage: string) => {
        switch (stage) {
            case 'ir-review': return "New Incident Review";
            case 'nte-for-approval': return "NTE Review Required";
            case 'hr-review-response': return "Review Employee Response";
            case 'nte-sent': return "Awaiting NTE Response";
            default: return "Assigned Case Review";
        }
    };

    return (
        <Card title={`Assigned Disciplinary Cases (${isLoading ? '…' : sortedItems.length})`}>
            {isLoading ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">Loading…</p>
            ) : sortedItems.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">No cases assigned to you.</p>
            ) : (
                <>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                        {sortedItems.map(item => {
                            return (
                                <Link to={item.link} key={item.id} className={`block hover:bg-gray-50 dark:hover:bg-gray-700/50 p-3 rounded-md border-l-4 ${item.colorClass}`}>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-semibold text-gray-800 dark:text-gray-200">
                                                {item.caseIdStr} • {item.category}
                                            </p>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">Involved: {item.involvedNames}</p>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex justify-between items-center text-xs">
                                        <span className={`px-2 py-0.5 font-semibold rounded-full ${item.type === 'nte-approval' ? 'bg-orange-100 text-orange-800' : item.type === 'res-approval' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                            {item.stageLabel}
                                        </span>
                                        <span className="text-gray-400">{item.dateTime.toLocaleDateString()}</span>
                                    </div>
                                </Link>
                            )
                        })}
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-right">
                        <Link to="/feedback/cases" className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                            Manage Cases &rarr;
                        </Link>
                    </div>
                </>
            )}
        </Card>
    );
};

export default AssignedCasesWidget;
