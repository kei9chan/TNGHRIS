import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { IncidentReport, IRStatus } from '../../types';
import Card from '../ui/Card';
import { fetchIncidentReports } from '../../services/incidentReportService';
import { useAuth } from '../../hooks/useAuth';

const AssignedCasesWidget: React.FC = () => {
    const { user } = useAuth();
    const [cases, setCases] = useState<IncidentReport[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        
        fetchIncidentReports()
            .then(data => {
                if (!cancelled) {
                    const myCases = data.filter(ir => 
                        ir.assignedToId === user.id && 
                        ir.status !== IRStatus.Closed && 
                        ir.status !== IRStatus.NoAction && 
                        ir.status !== IRStatus.Converted
                    );
                    setCases(myCases);
                }
            })
            .catch(() => {
                if (!cancelled) setCases([]);
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
            
        return () => { cancelled = true; };
    }, [user]);

    const sortedCases = cases.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

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
        <Card title={`Assigned Disciplinary Cases (${isLoading ? '…' : sortedCases.length})`}>
            {isLoading ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">Loading…</p>
            ) : sortedCases.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">No cases assigned to you.</p>
            ) : (
                <>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                        {sortedCases.map(ir => {
                            const caseIdStr = ir.nteNumber ? `TNGNTE-${String(ir.nteNumber).padStart(5, '0')}` : ir.caseNumber ? `TNGIR-${String(ir.caseNumber).padStart(5, '0')}` : 'Case';
                            return (
                                <Link to="/feedback/cases" key={ir.id} className="block hover:bg-gray-50 dark:hover:bg-gray-700/50 p-3 rounded-md border-l-4 border-red-500">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-semibold text-gray-800 dark:text-gray-200">
                                                {caseIdStr} • {ir.category}
                                            </p>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">Involved: {ir.involvedEmployeeNames.join(', ')}</p>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex justify-between items-center text-xs">
                                        <span className="px-2 py-0.5 font-semibold rounded-full bg-red-100 text-red-800">
                                            {getStageLabel(ir.pipelineStage)}
                                        </span>
                                        <span className="text-gray-400">{new Date(ir.dateTime).toLocaleDateString()}</span>
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
