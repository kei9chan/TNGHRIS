
import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Evaluation, Role, EvaluatorType, User, Permission } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import ComplianceModal from '../../components/evaluation/ComplianceModal';
import { supabase } from '../../services/supabaseClient';

const Evaluations: React.FC = () => {
    const { user } = useAuth();
    const { getVisibleEmployeeIds, getAccessibleBusinessUnits, isUserEligibleEvaluator, can } = usePermissions();
    const canView = can('Evaluation', Permission.View);
    const canManage = can('Evaluation', Permission.Manage);
    
    const [yearFilter, setYearFilter] = useState<string>('all');
    const [monthFilter, setMonthFilter] = useState<string>('all');
    const [buFilter, setBuFilter] = useState<string>('all');
    const [businessUnits, setBusinessUnits] = useState<{id:string; name:string}[]>([]);
    const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
    const [evaluatorsByEval, setEvaluatorsByEval] = useState<Record<string, { type: string; userId?: string | null }[]>>({});
    const [error, setError] = useState<string | null>(null);

    // Compliance Modal State
    const [isComplianceModalOpen, setIsComplianceModalOpen] = useState(false);
    const [selectedEvaluationForCompliance, setSelectedEvaluationForCompliance] = useState<Evaluation | null>(null);
    const [missingEvaluators, setMissingEvaluators] = useState<{ user: User; subjectName: string }[]>([]);


    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(businessUnits), [getAccessibleBusinessUnits, businessUnits]);

    useEffect(() => {
        const loadData = async () => {
            setError(null);
            const [{ data: buData, error: buErr }, { data: evalData, error: evalErr }, { data: evalersData, error: evErr }] = await Promise.all([
                supabase.from('business_units').select('id, name').order('name'),
                supabase.from('evaluations').select('*').order('created_at', { ascending: false }),
                supabase.from('evaluation_evaluators').select('evaluation_id, type, user_id'),
            ]);
            if (buErr || evalErr || evErr) {
                setError(buErr?.message || evalErr?.message || evErr?.message || 'Failed to load evaluations.');
                setBusinessUnits([]);
                setEvaluations([]);
                setEvaluatorsByEval({});
                return;
            }
            setBusinessUnits((buData || []).map((b:any)=>({id:b.id,name:b.name||'Unknown BU'})));

            const evalerMap: Record<string, { type: string; userId?: string | null }[]> = {};
            (evalersData || []).forEach((row:any) => {
                if (!evalerMap[row.evaluation_id]) evalerMap[row.evaluation_id] = [];
                evalerMap[row.evaluation_id].push({ type: row.type, userId: row.user_id });
            });
            setEvaluatorsByEval(evalerMap);

            setEvaluations((evalData || []).map((e:any)=>({
                id: e.id,
                name: e.name,
                timelineId: e.timeline_id || '',
                targetBusinessUnitIds: e.target_business_unit_ids || [],
                targetEmployeeIds: e.target_employee_ids || [],
                questionSetIds: e.question_set_ids || [],
                evaluators: evalerMap[e.id] || [],
                status: e.status || 'InProgress',
                createdAt: e.created_at ? new Date(e.created_at) : new Date(),
                dueDate: e.due_date ? new Date(e.due_date) : undefined,
                isEmployeeVisible: e.is_employee_visible || false,
                acknowledgedBy: e.acknowledged_by || [],
            } as Evaluation)));
        };
        loadData();
    }, []);

    const yearOptions = useMemo(() => {
        const years = new Set<number>();
        evaluations.forEach(e => {
            if (e.createdAt) years.add(new Date(e.createdAt).getFullYear());
        });
        const currentYear = new Date().getFullYear();
        years.add(currentYear);
        return Array.from(years).sort((a, b) => b - a);
    }, [evaluations]);

    const monthOptions = [
        { value: '1', name: 'January' }, { value: '2', name: 'February' }, { value: '3', name: 'March' },
        { value: '4', name: 'April' }, { value: '5', name: 'May' }, { value: '6', name: 'June' },
        { value: '7', name: 'July' }, { value: '8', name: 'August' }, { value: '9', name: 'September' },
        { value: '10', name: 'October' }, { value: '11', name: 'November' }, { value: '12', name: 'December' }
    ];

    const calculateProgress = (evaluation: Evaluation) => {
        const evalers = evaluatorsByEval[evaluation.id] || [];
        const totalSubmissions = evaluation.targetEmployeeIds.length * Math.max(evalers.length || 0, 1);
        const completedSubmissions = 0; // submissions table not yet wired
        const percentage = totalSubmissions ? (completedSubmissions / totalSubmissions) * 100 : 0;
        return { completed: completedSubmissions, total: totalSubmissions, percentage };
    };

    const viewableEvaluations = React.useMemo(() => {
        if (!user || !canView) return [];

        const accessibleBuIds = new Set(accessibleBus.map(b => b.id));

        let filteredByDateAndBU = evaluations.filter(evaluation => {
            const evalDate = evaluation.createdAt ? new Date(evaluation.createdAt) : null;
            const yearMatch = yearFilter === 'all' || (evalDate && evalDate.getFullYear().toString() === yearFilter);
            const monthMatch = monthFilter === 'all' || (evalDate && (evalDate.getMonth() + 1).toString() === monthFilter);
            const hasBuTargets = (evaluation.targetBusinessUnitIds || []).length > 0;
            const buMatch =
              buFilter === 'all'
                ? true
                : evaluation.targetBusinessUnitIds.includes(buFilter);
            // If no BU targets specified, treat as all-accessible
            const accessibleMatch =
              accessibleBuIds.size === 0 ||
              !hasBuTargets ||
              evaluation.targetBusinessUnitIds.some(id => accessibleBuIds.has(id));
            
            return yearMatch && monthMatch && buMatch && accessibleMatch;
        });

        const isAdminOrHR = [Role.Admin, Role.HRManager, Role.HRStaff].includes(user.role);
        
        if (isAdminOrHR) {
            return filteredByDateAndBU;
        }

        const visibleIds = new Set(getVisibleEmployeeIds());

        return evaluations.filter(evaluation => {
            const evalDate = evaluation.createdAt ? new Date(evaluation.createdAt) : null;
            if (yearFilter !== 'all' && (!evalDate || evalDate.getFullYear().toString() !== yearFilter)) return false;
            if (monthFilter !== 'all' && (!evalDate || (evalDate.getMonth() + 1).toString() !== monthFilter)) return false;

            if (evaluation.status === 'InProgress') {
                const canEvaluateSomeone = evaluation.targetEmployeeIds.some(targetId => 
                    isUserEligibleEvaluator(user, evaluation, targetId)
                );
                if (canEvaluateSomeone) return true;
            }

            const isTarget = evaluation.targetEmployeeIds.includes(user.id);
            if (isTarget && evaluation.status === 'Completed' && evaluation.isEmployeeVisible) {
                return true;
            }

            return false;
        });
    }, [user, getVisibleEmployeeIds, yearFilter, monthFilter, buFilter, accessibleBus, isUserEligibleEvaluator]);

    const handleViewCompliance = (evaluation: Evaluation) => {
        // Placeholder: compliance check requires evaluator configs and submissions; not yet wired to Supabase
        setMissingEvaluators([]);
        setSelectedEvaluationForCompliance(evaluation);
        setIsComplianceModalOpen(true);
    };

    const selectClasses = "block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white";
    const isAdminView = [Role.Admin, Role.HRManager, Role.HRStaff].includes(user?.role as Role);

    if (!canView) {
        return (
            <div className="p-6">
                <Card>
                    <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                        You do not have permission to view evaluations.
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Evaluations</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">View ongoing and completed performance reviews across all business units — track progress and access results in real time.</p>
                </div>
                 <Link to="/evaluation/new">
                    <Button>Create New Evaluation</Button>
                </Link>
            </div>
            
            <Card>
                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label htmlFor="year-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Year</label>
                        <select id="year-filter" value={yearFilter} onChange={e => setYearFilter(e.target.value)} className={selectClasses}>
                            <option value="all">All Years</option>
                            {yearOptions.map(year => <option key={year} value={year}>{year}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="month-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Month</label>
                        <select id="month-filter" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className={selectClasses}>
                            <option value="all">All Months</option>
                            {monthOptions.map(month => <option key={month.value} value={month.value}>{month.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="bu-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                        <select id="bu-filter" value={buFilter} onChange={e => setBuFilter(e.target.value)} className={selectClasses}>
                            <option value="all">All Accessible BUs</option>
                            {accessibleBus.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                        </select>
                    </div>
                </div>
            </Card>

            {viewableEvaluations.length > 0 ? (
                <div className="space-y-4">
                    {viewableEvaluations.map(evaluation => {
                        const { completed, total, percentage } = calculateProgress(evaluation);
                        const isOverdue = evaluation.dueDate && new Date() > new Date(evaluation.dueDate) && percentage < 100;
                        
                        const cardContent = (
                            <Card key={evaluation.id}>
                                <div className="flex flex-col md:flex-row justify-between md:items-center">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{evaluation.name}</h2>
                                            {isOverdue && <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-bold">Overdue</span>}
                                        </div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Status: {evaluation.status} | Created: {new Date(evaluation.createdAt).toLocaleDateString()}</p>
                                    </div>
                                    <div className="mt-4 md:mt-0 md:ml-6 flex items-center space-x-2">
                                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 mr-2">{completed} / {total} Completed</span>
                                        {isAdminView && evaluation.status === 'InProgress' && (
                                            <Button size="sm" variant="secondary" onClick={(e) => { e.preventDefault(); handleViewCompliance(evaluation); }}>
                                                Compliance Report
                                            </Button>
                                        )}
                                        <Link to={`/evaluation/report/${evaluation.id}`}>
                                            <Button variant={percentage === 100 ? "success" : "secondary"} disabled={completed === 0}>
                                                View Results
                                            </Button>
                                        </Link>
                                    </div>
                                </div>
                                <div className="mt-4">
                                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                                        <div className={`h-2.5 rounded-full ${isOverdue ? 'bg-red-500' : 'bg-indigo-600'}`} style={{ width: `${percentage}%` }}></div>
                                    </div>
                                    <p className="text-right text-xs text-gray-500 mt-1">{Math.round(percentage)}%</p>
                                </div>
                            </Card>
                        );

                        if (evaluation.status === 'InProgress') {
                            return (
                                <div key={evaluation.id}>
                                   {/* Wrap in div to avoid link wrapping the button handlers */}
                                   <Link to={`/evaluation/perform/${evaluation.id}`} className="block hover:shadow-lg transition-shadow rounded-lg mb-4">
                                       {cardContent}
                                   </Link>
                                </div>
                            )
                        }
                        return <div key={evaluation.id} className="mb-4">{cardContent}</div>;
                    })}
                </div>
            ) : (
                <Card>
                    <div className="text-center py-12">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">No evaluations found for the selected filters.</h3>
                         <Link to="/dashboard" className="mt-4 inline-block">
                            <Button>Return to Dashboard</Button>
                        </Link>
                    </div>
                </Card>
            )}

            {selectedEvaluationForCompliance && (
                <ComplianceModal
                    isOpen={isComplianceModalOpen}
                    onClose={() => setIsComplianceModalOpen(false)}
                    title={`Missing Evaluations: ${selectedEvaluationForCompliance.name}`}
                    dueDate={selectedEvaluationForCompliance.dueDate || new Date()}
                    missingUsers={missingEvaluators}
                    type="Evaluation"
                />
            )}
        </div>
    );
};

export default Evaluations;
