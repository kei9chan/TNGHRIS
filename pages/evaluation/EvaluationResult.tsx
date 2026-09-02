// Phase F: mockDataCompat removed from EvaluationResult — live Supabase data

import React, { useState, useMemo, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { Evaluation, EvaluationSubmission, User, EvaluationQuestion, Role, Permission, EvaluatorType, EvaluatorConfig, RaterGroup } from '../../types';
import { supabase } from '../../services/supabaseClient';
import { formatEmployeeName } from '../../services/formatEmployeeName';
import { hasEvaluationOversightAccess, isEvaluationSubject } from '../../utils/evaluationAccess';
import EvaluationResultSummary, { EvaluationCategoryScore } from '../../components/evaluation/EvaluationResultSummary';
import { downloadEvaluationResultPdf } from '../../services/evaluationResultPdf';

const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;
const ChevronDownIcon = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;

// --- Helper Component for Drill-Down ---
interface BreakdownItemProps {
    item: {
        config: EvaluatorConfig;
        submissions: (EvaluationSubmission & { raterName: string; submissionAverage: number })[];
        totalRawScore: number;
        groupAverage: number;
    };
    businessUnits: Array<{ id: string; name: string }>;
    departments: Array<{ id: string; name: string }>;
    users: User[];
}

const BreakdownItem: React.FC<BreakdownItemProps> = ({ item, businessUnits, departments, users }) => {
    const [isOpen, setIsOpen] = useState(false);

    const renderConfigName = (config: EvaluatorConfig) => {
        if (config.type === EvaluatorType.Individual) {
            const rater = users.find(u => u.id === config.userId);
            return rater ? `Individual: ${rater.name}` : 'Unknown Individual';
        } else {
            const buName = businessUnits.find(b => b.id === config.groupFilter?.businessUnitId)?.name || 'All BUs';
            const deptName = departments.find(d => d.id === config.groupFilter?.departmentId)?.name || 'All Depts';
            const label = config.type === EvaluatorType.Group ? `Group Review` : 'Group';
            return `${label}: ${buName} - ${deptName}`;
        }
    };

    return (
        <div className="border rounded-lg dark:border-gray-600 bg-white dark:bg-slate-800 overflow-hidden mb-4">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex flex-col md:flex-row justify-between items-start md:items-center p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-left"
            >
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-900 dark:text-white text-lg">{renderConfigName(item.config)}</p>
                        {item.config.isAnonymous && (
                            <span className="px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-300 font-medium">Anonymous</span>
                        )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Weight: {item.config.weight}% | Responses: {item.submissions.length}
                    </p>
                </div>
                <div className="mt-2 md:mt-0 flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Avg Score</p>
                        <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{item.groupAverage > 0 ? item.groupAverage.toFixed(2) : 'Pending'}</p>
                    </div>
                    <ChevronDownIcon className={isOpen ? 'rotate-180' : ''} />
                </div>
            </button>

            {isOpen && (
                <div className="border-t dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 p-4">
                    {item.submissions.length > 0 ? (
                        <div className="space-y-2">
                            <p className="text-xs font-bold text-gray-500 uppercase mb-2">Individual Ratings</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {item.submissions.map((sub, idx) => {
                                    // Phase 5: Anonymity Logic
                                    const displayName = item.config.isAnonymous 
                                        ? `Anonymous Evaluator ${idx + 1}` 
                                        : sub.raterName;
                                    
                                    return (
                                        <div key={idx} className="flex justify-between items-center text-sm p-3 bg-white dark:bg-slate-700 rounded shadow-sm border dark:border-gray-600">
                                            <span className={`truncate mr-2 ${item.config.isAnonymous ? 'italic text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                                                {displayName}
                                            </span>
                                            <span className="font-bold font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-indigo-600 dark:text-indigo-300">
                                                {sub.submissionAverage.toFixed(2)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500 italic text-center py-2">No submissions received for this component yet.</p>
                    )}
                </div>
            )}
        </div>
    );
};


const EvaluationResult: React.FC = () => {
    const { evaluationId } = useParams<{ evaluationId: string }>();
    const { user } = useAuth();
    const { can } = usePermissions();

    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [detailsMode, setDetailsMode] = useState<'summary' | 'full'>('summary');
    const [selectedUserForDetails, setSelectedUserForDetails] = useState<User | null>(null);
    const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
    const [submissions, setSubmissions] = useState<EvaluationSubmission[]>([]);
    const [questions, setQuestions] = useState<EvaluationQuestion[]>([]);
    const [targetUsers, setTargetUsers] = useState<User[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [businessUnits, setBusinessUnits] = useState<Array<{ id: string; name: string }>>([]);
    const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
    const [questionSets, setQuestionSets] = useState<Array<{ id: string; name: string; description: string }>>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isSupabaseEvaluation, setIsSupabaseEvaluation] = useState(false);

    const [isEmployeeVisible, setIsEmployeeVisible] = useState(false);
    const [hasAcknowledged, setHasAcknowledged] = useState(false);

    useEffect(() => {
        if (!evaluationId) return;
        let active = true;
        const loadEvaluation = async () => {
            setIsLoading(true);
            setLoadError(null);
            try {
                const { data: evalRow, error: evalErr } = await supabase
                    .from('evaluations')
                    .select('*')
                    .eq('id', evaluationId)
                    .maybeSingle();
                if (evalErr) throw evalErr;

                if (evalRow) {
                    setIsSupabaseEvaluation(true);
                    const { data: evalerRows, error: evalerErr } = await supabase
                        .from('evaluation_evaluators')
                        .select('evaluation_id, type, user_id, weight, business_unit_id, department_id, is_anonymous, exclude_subject')
                        .eq('evaluation_id', evaluationId);
                    if (evalerErr) throw evalerErr;

                    const evaluators: EvaluatorConfig[] =
                        (evalerRows || []).map((row: any) => {
                            const normalizedType = String(row.type || '').toLowerCase();
                            return {
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
                            };
                        }) || [];

                    const mappedEvaluation: Evaluation = {
                        id: evalRow.id,
                        name: evalRow.name,
                        timelineId: evalRow.timeline_id || '',
                        targetBusinessUnitIds: evalRow.target_business_unit_ids || [],
                        targetEmployeeIds: evalRow.target_employee_ids || [],
                        questionSetIds: evalRow.question_set_ids || [],
                        evaluators,
                        status: evalRow.status || 'InProgress',
                        createdAt: evalRow.created_at ? new Date(evalRow.created_at) : new Date(),
                        dueDate: evalRow.due_date ? new Date(evalRow.due_date) : undefined,
                        isEmployeeVisible: !!evalRow.is_employee_visible,
                        acknowledgedBy: evalRow.acknowledged_by || [],
                    };

                    const questionSetIds = mappedEvaluation.questionSetIds || [];
                    const targetIds = mappedEvaluation.targetEmployeeIds || [];

                    const [
                        submissionsRes,
                        questionsRes,
                        employeesRes,
                        buRes,
                        deptRes,
                        questionSetsRes,
                    ] = await Promise.all([
                        supabase
                            .from('evaluation_submissions')
                            .select('*')
                            .eq('evaluation_id', evaluationId),
                        questionSetIds.length > 0
                            ? supabase
                                .from('evaluation_questions')
                                .select('*')
                                .in('question_set_id', questionSetIds)
                            : Promise.resolve({ data: [], error: null }),
                        targetIds.length > 0
                            ? supabase
                                .from('hris_users')
                                .select('id, full_name, email, role, status, business_unit, business_unit_id, department, department_id, position')
                                .in('id', targetIds)
                            : Promise.resolve({ data: [], error: null }),
                        supabase.from('business_units').select('id, name'),
                        supabase.from('departments').select('id, name'),
                        questionSetIds.length > 0
                            ? supabase.from('evaluation_question_sets').select('id, name, description').in('id', questionSetIds)
                            : Promise.resolve({ data: [], error: null }),
                    ]);

                    if (submissionsRes.error) throw submissionsRes.error;
                    if ((questionsRes as any).error) throw (questionsRes as any).error;
                    if ((employeesRes as any).error) throw (employeesRes as any).error;
                    if (buRes.error) throw buRes.error;
                    if (deptRes.error) throw deptRes.error;
                    if ((questionSetsRes as any).error) throw (questionSetsRes as any).error;

                    const mappedSubmissions: EvaluationSubmission[] =
                        (submissionsRes.data || []).map((row: any) => ({
                            id: row.id,
                            evaluationId: row.evaluation_id,
                            subjectEmployeeId: row.subject_employee_id,
                            raterId: row.rater_id,
                            raterGroup: (row.rater_group as RaterGroup) || RaterGroup.DirectSupervisor,
                            scores: row.scores || [],
                            submittedAt: row.submitted_at ? new Date(row.submitted_at) : new Date(),
                        })) || [];

                    const mappedQuestions: EvaluationQuestion[] =
                        ((questionsRes as any).data || []).map((q: any) => ({
                            id: q.id,
                            questionSetId: q.question_set_id,
                            title: q.title,
                            description: q.description || '',
                            questionType: q.question_type,
                            isArchived: !!q.is_archived,
                            targetEmployeeLevels: q.target_employee_levels || [],
                            targetEvaluatorRoles: q.target_evaluator_roles || [],
                        })) || [];

                    let mappedEmployees: User[] =
                        ((employeesRes as any).data || []).map((u: any) => ({
                            id: u.id,
                            name: formatEmployeeName(u.full_name || 'Unknown'),
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
                            position: u.position || '',
                            managerId: undefined,
                            activeDeviceId: undefined,
                            isGoogleConnected: false,
                            profilePictureUrl: undefined,
                            signatureUrl: undefined,
                        } as User)) || [];

                    if (mappedEmployees.length === 0 && targetIds.length > 0) {
                        const { data: authRows, error: authErr } = await supabase
                            .from('hris_users')
                            .select('id, full_name, email, role, status, business_unit, business_unit_id, department, department_id, position, auth_user_id')
                            .in('auth_user_id', targetIds);
                        if (authErr) throw authErr;
                        mappedEmployees = (authRows || []).map((u: any) => ({
                            id: u.id,
                            name: formatEmployeeName(u.full_name || 'Unknown'),
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
                            position: u.position || '',
                            managerId: undefined,
                            activeDeviceId: undefined,
                            isGoogleConnected: false,
                            profilePictureUrl: undefined,
                            signatureUrl: undefined,
                        } as User));
                    }

                    if (mappedEmployees.length === 0 && targetIds.length > 0) {
                        mappedEmployees = targetIds.map(id => ({
                            id,
                            name: `Employee ${id.slice(0, 8)}`,
                            email: '',
                            role: Role.Employee,
                            department: '',
                            businessUnit: '',
                            status: 'Active',
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
                    }

                    // Fetch additional rater users (may not be in targetEmployeeIds)
                    const raterIds = [...new Set(mappedSubmissions.map(s => s.raterId))].filter(id => id && !targetIds.includes(id));
                    let raterUsers: User[] = [];
                    if (raterIds.length > 0) {
                        const { data: raterRows } = await supabase
                            .from('hris_users')
                            .select('id, full_name, email, role, status, business_unit, business_unit_id, department, department_id, position')
                            .in('id', raterIds);
                        raterUsers = (raterRows || []).map((u: any) => ({
                            id: u.id,
                            name: formatEmployeeName(u.full_name || 'Unknown'),
                            email: u.email || '',
                            role: u.role,
                            department: u.department || '',
                            businessUnit: u.business_unit || '',
                            status: u.status || 'Active',
                            employmentStatus: undefined,
                            isPhotoEnrolled: false,
                            dateHired: new Date(),
                            position: u.position || '',
                            managerId: undefined,
                            activeDeviceId: undefined,
                            isGoogleConnected: false,
                        } as User));
                    }

                    if (!active) return;
                    setEvaluation(mappedEvaluation);
                    setSubmissions(mappedSubmissions);
                    setQuestions(mappedQuestions.filter(q => !q.isArchived));
                    setTargetUsers(mappedEmployees);
                    setAllUsers([...mappedEmployees, ...raterUsers]);
                    setBusinessUnits((buRes.data || []).map((b: any) => ({ id: b.id, name: b.name || 'Unknown BU' })));
                    setDepartments((deptRes.data || []).map((d: any) => ({ id: d.id, name: d.name || 'Unknown Dept' })));
                    setQuestionSets(((questionSetsRes as any).data || []).map((set: any) => ({
                        id: set.id,
                        name: set.name || 'Evaluation category',
                        description: set.description || '',
                    })));
                    return;
                }

                // No Supabase record found — evaluation does not exist
                if (!active) return;
                setEvaluation(null);
            } catch (err) {
                console.error('Failed to load evaluation results', err);
                if (!active) return;
                setLoadError('Failed to load evaluation results.');
            } finally {
                if (active) setIsLoading(false);
            }
        };
        loadEvaluation();
        return () => {
            active = false;
        };
    }, [evaluationId]);

    useEffect(() => {
        setIsEmployeeVisible(!!evaluation?.isEmployeeVisible);
        setHasAcknowledged(!!evaluation?.acknowledgedBy?.includes(user?.id || ''));
    }, [evaluation?.isEmployeeVisible, evaluation?.acknowledgedBy, user?.id]);

    const handleVisibilityToggle = async () => {
        const newValue = !isEmployeeVisible;
        setIsEmployeeVisible(newValue);
        if (!evaluation) return;
        const { error } = await supabase
            .from('evaluations')
            .update({ is_employee_visible: newValue })
            .eq('id', evaluation.id);
        if (error) {
            console.error('Failed to update evaluation visibility', error);
        }
    };

    const handleAcknowledge = async () => {
        if (!evaluation || !user) return;
        
        const currentAcknowledgedBy = evaluation.acknowledgedBy ? [...evaluation.acknowledgedBy] : [];
        if (!currentAcknowledgedBy.includes(user.id)) {
            currentAcknowledgedBy.push(user.id);
        }
        const { error } = await supabase
            .from('evaluations')
            .update({ acknowledged_by: currentAcknowledgedBy })
            .eq('id', evaluation.id);
        if (error) {
            console.error('Failed to acknowledge evaluation', error);
            return;
        }
        setEvaluation(prev => prev ? { ...prev, acknowledgedBy: currentAcknowledgedBy } : prev);
        setHasAcknowledged(true);
    };
    
    // --- PHASE 4: SCORING ENGINE ---
    const results = useMemo(() => {
        if (!evaluation) return { employeeScores: [], overallAverage: 0, questionAverages: {} };

        const ratingQuestions = questions.filter(question => question.questionType === 'rating');
        const categoryDefinitions = questionSets.length > 0
            ? questionSets
            : [{ id: 'all-ratings', name: 'Overall Rating Criteria', description: 'All scored evaluation questions.' }];

        const employeeScores = targetUsers.map(employee => {
            // Get all raw submissions for this employee
            const submissionsForEmployee = submissions.filter(s => s.subjectEmployeeId === employee.id);
            
            // Map to hold aggregated data per EvaluatorConfig
            const configResults = new Map<string, {
                config: EvaluatorConfig,
                submissions: (EvaluationSubmission & { raterName: string; submissionAverage: number })[],
                totalRawScore: number
            }>();

            // Initialize map with all configs to track missing ones
            evaluation.evaluators.forEach(config => {
                configResults.set(config.id, { config, submissions: [], totalRawScore: 0 });
            });

            // Distribute submissions to their matching config
            submissionsForEmployee.forEach(sub => {
                const rater = allUsers.find(u => u.id === sub.raterId);
                if (!rater) return;

                // Calculate raw average for this specific submission
                const ratingScores = sub.scores.filter(s => s.score !== undefined);
                const submissionAverage = ratingScores.length > 0 
                    ? ratingScores.reduce((sum, s) => sum + s.score!, 0) / ratingScores.length 
                    : 0;

                const enrichedSubmission = { ...sub, raterName: rater.name, submissionAverage };

                // Find which config this rater belongs to.
                // Priority: Individual Assignment > Group Assignment
                
                let matchedConfig = evaluation.evaluators.find(e => e.type === EvaluatorType.Individual && e.userId === sub.raterId);

                if (!matchedConfig) {
                    // Check groups
                    matchedConfig = evaluation.evaluators.find(e => {
                        if (e.type !== EvaluatorType.Group) return false;
                        if (e.excludeSubject && sub.raterId === employee.id) return false; // Skip self in group if excluded

                        const filter = e.groupFilter;
                        if (!filter) return false;

                        // Resolve IDs to Names
                        const buName = businessUnits.find(b => b.id === filter.businessUnitId)?.name;
                        const deptName = departments.find(d => d.id === filter.departmentId)?.name;

                        if (filter.businessUnitId && rater.businessUnit !== buName) return false;
                        if (filter.departmentId && rater.department !== deptName) return false;
                        
                        return true;
                    });
                }

                if (matchedConfig) {
                    const groupData = configResults.get(matchedConfig.id);
                    if (groupData) {
                        groupData.submissions.push(enrichedSubmission);
                        groupData.totalRawScore += submissionAverage;
                    }
                }
            });

            // Calculate Final Weighted Score
            let weightedScoreSum = 0;
            let usedWeight = 0;

            const breakdown = Array.from(configResults.values()).map(item => {
                const count = item.submissions.length;
                // Method A: Average of Group
                const groupAverage = count > 0 ? item.totalRawScore / count : 0;
                
                if (count > 0) {
                    weightedScoreSum += groupAverage * (item.config.weight / 100);
                    usedWeight += item.config.weight;
                }

                return {
                    ...item,
                    groupAverage
                };
            });

            // Normalize score if not all weights are present (e.g., if a group failed to submit)
            // Logic: Disregard empty groups and divide by the weight that DID answer.
            const finalScore = usedWeight > 0 ? (weightedScoreSum / (usedWeight / 100)) : 0;

            const categoryScores: EvaluationCategoryScore[] = categoryDefinitions.map(category => {
                const questionIds = new Set(
                    ratingQuestions
                        .filter(question => category.id === 'all-ratings' || question.questionSetId === category.id)
                        .map(question => question.id)
                );
                let categoryWeightedScore = 0;
                let categoryUsedWeight = 0;

                breakdown.forEach(item => {
                    const submissionAverages = item.submissions.flatMap(submission => {
                        const categoryRatings = submission.scores
                            .filter(score => questionIds.has(score.questionId) && score.score !== undefined)
                            .map(score => score.score as number);
                        if (categoryRatings.length === 0) return [];
                        return [categoryRatings.reduce((total, score) => total + score, 0) / categoryRatings.length];
                    });
                    if (submissionAverages.length === 0) return;
                    const componentAverage = submissionAverages.reduce((total, score) => total + score, 0) / submissionAverages.length;
                    categoryWeightedScore += componentAverage * (item.config.weight / 100);
                    categoryUsedWeight += item.config.weight;
                });

                return {
                    id: category.id,
                    name: category.name,
                    description: category.description || `${questionIds.size} rating criteria`,
                    score: categoryUsedWeight > 0 ? categoryWeightedScore / (categoryUsedWeight / 100) : 0,
                    maxScore: 5,
                    usedWeight: categoryUsedWeight,
                };
            }).filter(category => ratingQuestions.some(question => category.id === 'all-ratings' || question.questionSetId === category.id));

            const employeeQuestionAverages = Object.fromEntries(ratingQuestions.map(question => {
                const questionScores = submissionsForEmployee.flatMap(submission =>
                    submission.scores
                        .filter(score => score.questionId === question.id && score.score !== undefined)
                        .map(score => score.score as number)
                );
                return [question.id, questionScores.length > 0
                    ? questionScores.reduce((total, score) => total + score, 0) / questionScores.length
                    : 0];
            }));

            return {
                user: employee,
                finalScore,
                breakdown,
                usedWeight,
                categoryScores,
                completedComponents: breakdown.filter(item => item.submissions.length > 0).length,
                totalComponents: breakdown.length,
                questionAverages: employeeQuestionAverages,
            };
        });

        const scoredEmployees = employeeScores.filter(es => es.usedWeight > 0);
        const overallAverage = scoredEmployees.length > 0
            ? scoredEmployees.reduce((sum, es) => sum + es.finalScore, 0) / scoredEmployees.length
            : 0;
        
        const questionAverages: Record<string, number> = {};
        questions.filter(q => q.questionType === 'rating').forEach(q => {
            const scoresForQuestion = submissions.flatMap(s => s.scores).filter(s => s.questionId === q.id && s.score !== undefined);
            const avg = scoresForQuestion.length > 0 
                ? scoresForQuestion.reduce((sum, s) => sum + s.score!, 0) / scoresForQuestion.length 
                : 0;
            questionAverages[q.id] = avg;
        });

        return { employeeScores, overallAverage, overallAverageCount: scoredEmployees.length, questionAverages };
    }, [evaluation, submissions, targetUsers, questions, questionSets, allUsers, businessUnits, departments]);
    
    if (isLoading) return <div>Loading...</div>;
    if (loadError) return <div>{loadError}</div>;
    if (!evaluation || !user) return <div>Evaluation not found.</div>;
    
    const canManageEvaluation = can('Evaluation', Permission.Manage);
    const isEvaluationOversight = hasEvaluationOversightAccess(user);
    const isEvaluatedEmployee = isEvaluationSubject(user.id, evaluation.targetEmployeeIds);
    // Oversight roles can inspect an internal cycle even when they were not
    // configured as an evaluator. A target employee must still wait for the
    // normal released-results flow, even if they also hold an HR/BOD role.
    const canViewAllResults = !isEvaluatedEmployee && (canManageEvaluation || isEvaluationOversight);
    const canChangeResultVisibility = canManageEvaluation && !isEvaluatedEmployee;

    const selectedEmployeeScores = selectedUserForDetails ? results.employeeScores.find(es => es.user.id === selectedUserForDetails.id) : null;

    const openDetails = (employee: User, mode: 'summary' | 'full') => {
        setSelectedUserForDetails(employee);
        setDetailsMode(mode);
        setIsDetailsModalOpen(true);
    };

    const downloadSummary = async (employeeScores: typeof results.employeeScores[number]) => {
        try {
            await downloadEvaluationResultPdf({
                evaluationName: evaluation.name,
                employeeName: employeeScores.user.name,
                score: employeeScores.finalScore,
                usedWeight: employeeScores.usedWeight,
                completedComponents: employeeScores.completedComponents,
                totalComponents: employeeScores.totalComponents,
                status: evaluation.acknowledgedBy?.includes(employeeScores.user.id) ? 'Acknowledged' : 'Pending',
                categories: employeeScores.categoryScores,
            });
        } catch (pdfError: any) {
            alert(pdfError?.message || 'Unable to download the evaluation PDF.');
        }
    };

    const renderAdminView = () => (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card title="Completion">{submissions.length} Submissions</Card>
                <Card title="Overall Average Score">
                    {results.overallAverageCount > 0 ? `${results.overallAverage.toFixed(2)} / 5.0` : 'Pending'}
                </Card>
                <Card title="Participants">{targetUsers.length} Employees</Card>
            </div>

            <div className="space-y-5">
                {results.employeeScores.map(employeeScores => (
                    <EvaluationResultSummary
                        key={employeeScores.user.id}
                        employeeName={employeeScores.user.name}
                        score={employeeScores.finalScore}
                        usedWeight={employeeScores.usedWeight}
                        completedComponents={employeeScores.completedComponents}
                        totalComponents={employeeScores.totalComponents}
                        status={evaluation.acknowledgedBy?.includes(employeeScores.user.id) ? 'Acknowledged' : 'Pending'}
                        categories={employeeScores.categoryScores}
                        onViewDetails={() => openDetails(employeeScores.user, 'summary')}
                        onViewFull={() => openDetails(employeeScores.user, 'full')}
                        onDownloadPdf={employeeScores.usedWeight > 0 ? () => void downloadSummary(employeeScores) : undefined}
                    />
                ))}
            </div>
        </div>
    );
    
    const renderEmployeeView = () => {
        if (!isEmployeeVisible) {
             return <Card><p className="text-center">Results for this evaluation have not been released by HR yet.</p></Card>;
        }
        const myScores = results.employeeScores.find(es => es.user.id === user.id);
        if (!myScores) return <Card><p>Your results could not be found.</p></Card>;

        return (
            <div className="space-y-6">
                <EvaluationResultSummary
                    employeeName={myScores.user.name}
                    score={myScores.finalScore}
                    usedWeight={myScores.usedWeight}
                    completedComponents={myScores.completedComponents}
                    totalComponents={myScores.totalComponents}
                    status={hasAcknowledged ? 'Acknowledged' : 'Pending'}
                    categories={myScores.categoryScores}
                    onViewDetails={() => openDetails(myScores.user, 'summary')}
                    onViewFull={() => openDetails(myScores.user, 'full')}
                    onDownloadPdf={myScores.usedWeight > 0 ? () => void downloadSummary(myScores) : undefined}
                />
                {isEvaluatedEmployee && isEmployeeVisible && (
                    <Card>
                    <div className="text-center">
                        {hasAcknowledged ? (
                             <div className="flex items-center justify-center text-green-600 dark:text-green-400 font-semibold">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                You have acknowledged these results.
                            </div>
                        ) : (
                            <Button onClick={handleAcknowledge} size="lg">
                                Acknowledge & Confirm Review
                            </Button>
                        )}
                    </div>
                    </Card>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                 <div>
                    <Link to="/evaluation/reviews" className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-2">
                        <ArrowLeftIcon />
                        Back to Evaluations
                    </Link>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{evaluation.name} - Results</h1>
                </div>
                 {canChangeResultVisibility && (
                    <div className="flex items-center">
                        <span className="mr-3 text-sm font-medium">Allow Employees to View Results</span>
                        <label htmlFor="visibility-toggle" className="flex items-center cursor-pointer">
                            <div className="relative">
                                <input type="checkbox" id="visibility-toggle" className="sr-only" checked={isEmployeeVisible} onChange={handleVisibilityToggle} />
                                <div className={`block w-14 h-8 rounded-full ${isEmployeeVisible ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                                <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${isEmployeeVisible ? 'translate-x-6' : ''}`}></div>
                            </div>
                        </label>
                    </div>
                )}
            </div>
            
            {canViewAllResults ? renderAdminView() : isEvaluatedEmployee ? renderEmployeeView() : <Card><p>You do not have permission to view these results.</p></Card>}
            
            {selectedUserForDetails && (
                <Modal 
                    isOpen={isDetailsModalOpen} 
                    onClose={() => setIsDetailsModalOpen(false)} 
                    title={`${detailsMode === 'full' ? 'Full Evaluation' : 'Detailed Summary'} for ${selectedUserForDetails.name}`}
                    size="4xl"
                >
                    {selectedEmployeeScores ? (
                        <div className="space-y-6">
                            <div className="text-center p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Final Weighted Score</p>
                                <p className="text-5xl font-bold text-indigo-600 dark:text-indigo-400">{selectedEmployeeScores.finalScore.toFixed(2)}</p>
                                {selectedEmployeeScores.usedWeight < 100 && (
                                    <p className="text-xs text-yellow-600 mt-2">Based on {selectedEmployeeScores.usedWeight}% of available data.</p>
                                )}
                            </div>
                            
                            <div className="space-y-6">
                                <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200 border-b dark:border-gray-600 pb-2">Breakdown by Evaluator Component</h4>
                                 {selectedEmployeeScores.breakdown.map(item => (
                                    <BreakdownItem key={item.config.id} item={item} businessUnits={businessUnits} departments={departments} users={allUsers} />
                                ))}
                            </div>
                            {detailsMode === 'full' && (
                                <div className="space-y-3">
                                    <h4 className="border-b pb-2 text-lg font-semibold text-gray-800 dark:border-gray-600 dark:text-gray-200">Full Question Analysis</h4>
                                    {questions.filter(question => question.questionType === 'rating').map(question => (
                                        <div key={question.id} className="flex items-start justify-between gap-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                                            <div>
                                                <p className="font-medium text-slate-900 dark:text-white">{question.title}</p>
                                                {question.description && <p className="mt-1 text-xs text-slate-500">{question.description}</p>}
                                            </div>
                                            <span className="shrink-0 font-bold text-violet-700 dark:text-violet-300">{selectedEmployeeScores.questionAverages[question.id] > 0 ? selectedEmployeeScores.questionAverages[question.id].toFixed(2) : 'Pending'} / 5.0</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <p>No score details available.</p>
                    )}
                </Modal>
            )}

        </div>
    );
};

export default EvaluationResult;
