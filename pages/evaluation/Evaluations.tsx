
import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Evaluation, Role, EvaluatorType, User, Permission, EvaluatorConfig } from '../../types';
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
    const [evaluatorsByEval, setEvaluatorsByEval] = useState<Record<string, EvaluatorConfig[]>>({});
    const [submissionsByEval, setSubmissionsByEval] = useState<Record<string, Set<string>>>({});
    const [error, setError] = useState<string | null>(null);
    const [employeeProfileId, setEmployeeProfileId] = useState<string | null>(null);

    // Compliance Modal State
    const [isComplianceModalOpen, setIsComplianceModalOpen] = useState(false);
    const [selectedEvaluationForCompliance, setSelectedEvaluationForCompliance] = useState<Evaluation | null>(null);
    const [missingEvaluators, setMissingEvaluators] = useState<{ user: User; subjectName: string }[]>([]);


    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(businessUnits), [getAccessibleBusinessUnits, businessUnits]);

    useEffect(() => {
        const loadData = async () => {
            setError(null);
            const [{ data: buData, error: buErr }, { data: evalData, error: evalErr }, { data: evalersData, error: evErr }, { data: submissionsData, error: subErr }] = await Promise.all([
                supabase.from('business_units').select('id, name').order('name'),
                supabase.from('evaluations').select('*').order('created_at', { ascending: false }),
                supabase.from('evaluation_evaluators').select('evaluation_id, type, user_id, weight, business_unit_id, department_id, is_anonymous, exclude_subject'),
                supabase.from('evaluation_submissions').select('evaluation_id, rater_id, subject_employee_id'),
            ]);
            if (buErr || evalErr || evErr || subErr) {
                setError(buErr?.message || evalErr?.message || evErr?.message || subErr?.message || 'Failed to load evaluations.');
                setBusinessUnits([]);
                setEvaluations([]);
                setEvaluatorsByEval({});
                setSubmissionsByEval({});
                return;
            }
            setBusinessUnits((buData || []).map((b:any)=>({id:b.id,name:b.name||'Unknown BU'})));

            const evalerMap: Record<string, EvaluatorConfig[]> = {};
            (evalersData || []).forEach((row:any) => {
                if (!evalerMap[row.evaluation_id]) evalerMap[row.evaluation_id] = [];
                const normalizedType = String(row.type || '').toLowerCase();
                evalerMap[row.evaluation_id].push({
                    id: `${row.evaluation_id}-${row.user_id || 'group'}-${row.type || 'unknown'}`,
                    type: normalizedType === 'group' ? EvaluatorType.Group : EvaluatorType.Individual,
                    weight: row.weight || 0,
                    userId: row.user_id || undefined,
                    groupFilter: row.business_unit_id || row.department_id ? {
                        businessUnitId: row.business_unit_id || undefined,
                        departmentId: row.department_id || undefined,
                    } : undefined,
                    isAnonymous: !!row.is_anonymous,
                    excludeSubject: row.exclude_subject ?? true,
                });
            });
            setEvaluatorsByEval(evalerMap);

            const submissionMap: Record<string, Set<string>> = {};
            (submissionsData || []).forEach((row: any) => {
                if (!submissionMap[row.evaluation_id]) {
                    submissionMap[row.evaluation_id] = new Set<string>();
                }
                submissionMap[row.evaluation_id].add(`${row.rater_id}:${row.subject_employee_id}`);
            });
            setSubmissionsByEval(submissionMap);

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

    useEffect(() => {
        if (!user) {
            setEmployeeProfileId(null);
            return;
        }
        let active = true;
        const resolveProfileId = async () => {
            let resolvedId: string | null = null;
            if (user.authUserId) {
                const { data } = await supabase
                    .from('hris_users')
                    .select('id')
                    .eq('auth_user_id', user.authUserId)
                    .maybeSingle();
                resolvedId = data?.id ?? null;
            }
            if (!resolvedId && user.email) {
                const { data } = await supabase
                    .from('hris_users')
                    .select('id')
                    .eq('email', user.email)
                    .maybeSingle();
                resolvedId = data?.id ?? null;
            }
            if (active) setEmployeeProfileId(resolvedId || user.id || null);
        };
        resolveProfileId();
        return () => {
            active = false;
        };
    }, [user]);

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
        const completedSubmissions = submissionsByEval[evaluation.id]?.size || 0;
        const percentage = totalSubmissions ? (completedSubmissions / totalSubmissions) * 100 : 0;
        return { completed: completedSubmissions, total: totalSubmissions, percentage };
    };

    const viewableEvaluations = React.useMemo(() => {
        if (!user || !canView) return [];
        const evaluatorUser = { ...user, id: employeeProfileId || user.id };

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
                    isUserEligibleEvaluator(evaluatorUser, evaluation, targetId)
                );
                if (canEvaluateSomeone) return true;
            }

            const isTarget = evaluation.targetEmployeeIds.includes(employeeProfileId || user.id);
            if (isTarget && evaluation.status === 'Completed' && evaluation.isEmployeeVisible) {
                return true;
            }

            return false;
        });
    }, [user, employeeProfileId, getVisibleEmployeeIds, yearFilter, monthFilter, buFilter, accessibleBus, isUserEligibleEvaluator]);

    const handleViewCompliance = async (evaluation: Evaluation) => {
        setSelectedEvaluationForCompliance(evaluation);
        setIsComplianceModalOpen(true);
        setMissingEvaluators([]);

        try {
            const needsDeptNames = evaluation.evaluators.some(
                ev => ev.type === EvaluatorType.Group && ev.groupFilter?.departmentId
            );
            const [{ data: userRows, error: userErr }, { data: submissionRows, error: subErr }, { data: deptRows, error: deptErr }] =
                await Promise.all([
                    supabase
                        .from('hris_users')
                        .select('id, full_name, email, role, department, business_unit, business_unit_id, department_id, status'),
                    supabase
                        .from('evaluation_submissions')
                        .select('subject_employee_id, rater_id')
                        .eq('evaluation_id', evaluation.id),
                    needsDeptNames
                        ? supabase.from('departments').select('id, name')
                        : Promise.resolve({ data: [], error: null }),
                ]);

            if (userErr || subErr || deptErr) {
                throw userErr || subErr || deptErr;
            }

            const departmentNameById = new Map(
                (deptRows || []).map((row: any) => [row.id, row.name])
            );

            const allUsers: User[] = (userRows || []).map((u: any) => ({
                id: u.id,
                name: u.full_name || 'Unknown',
                email: u.email || '',
                role: u.role,
                department: u.department || '',
                businessUnit: u.business_unit || '',
                departmentId: u.department_id || undefined,
                businessUnitId: u.business_unit_id || undefined,
                status: u.status || 'Active',
                employmentStatus: undefined,
                isPhotoEnrolled: false,
                dateHired: new Date(),
                position: '',
                managerId: undefined,
                activeDeviceId: undefined,
                isGoogleConnected: false,
                profilePictureUrl: undefined,
                signatureUrl: undefined,
            } as User));

            const userById = new Map(allUsers.map(user => [user.id, user]));
            const submittedPairs = new Set(
                (submissionRows || []).map((row: any) => `${row.rater_id}:${row.subject_employee_id}`)
            );

            const evaluatorUsersById = new Map<string, User>();
            const buNameById = new Map(businessUnits.map(bu => [bu.id, bu.name]));

            evaluation.evaluators.forEach(ev => {
                if (ev.type === EvaluatorType.Individual && ev.userId) {
                    const evaluator = userById.get(ev.userId);
                    if (evaluator) evaluatorUsersById.set(evaluator.id, evaluator);
                    return;
                }

                if (ev.type === EvaluatorType.Group && ev.groupFilter?.businessUnitId) {
                    const targetBuId = ev.groupFilter.businessUnitId;
                    const targetBuName = buNameById.get(targetBuId);
                    const targetDeptId = ev.groupFilter.departmentId;
                    const targetDeptName = targetDeptId ? departmentNameById.get(targetDeptId) : undefined;

                    allUsers.forEach(candidate => {
                        if ((candidate.status || '').toLowerCase() !== 'active') return;

                        const buMatch = candidate.businessUnitId
                            ? candidate.businessUnitId === targetBuId
                            : (targetBuName ? candidate.businessUnit === targetBuName : false);
                        if (!buMatch) return;

                        if (targetDeptId) {
                            const deptMatch = candidate.departmentId
                                ? candidate.departmentId === targetDeptId
                                : (targetDeptName ? candidate.department === targetDeptName : false);
                            if (!deptMatch) return;
                        }

                        evaluatorUsersById.set(candidate.id, candidate);
                    });
                }
            });

            const targetSubjects = evaluation.targetEmployeeIds
                .map(id => userById.get(id))
                .filter(Boolean) as User[];

            const missing: { user: User; subjectName: string }[] = [];

            targetSubjects.forEach(subject => {
                evaluatorUsersById.forEach(evaluator => {
                    if (!isUserEligibleEvaluator(evaluator, evaluation, subject.id)) {
                        return;
                    }
                    if (submittedPairs.has(`${evaluator.id}:${subject.id}`)) {
                        return;
                    }
                    missing.push({
                        user: evaluator,
                        subjectName: subject.name,
                    });
                });
            });

            setMissingEvaluators(missing);
        } catch (err: any) {
            console.error('Failed to load compliance report', err);
            setMissingEvaluators([]);
        }
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
