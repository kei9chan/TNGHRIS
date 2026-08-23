
import React, { useState, useMemo, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Evaluation, User, EvaluationSubmission, RaterGroup, EvaluationQuestion, EvaluatorConfig, EvaluatorType } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import Textarea from '../../components/ui/Textarea';
import { logActivity } from '../../services/auditService';
import { supabase } from '../../services/supabaseClient';
import { formatEmployeeName } from '../../services/formatEmployeeName';
import { resolveCurrentHrisUserId } from '../../services/evaluationService';

// Icons
const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;
const CheckCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>;


const PerformEvaluation: React.FC = () => {
    const { evaluationId } = useParams<{ evaluationId: string }>();
    const { user } = useAuth();
    const { isUserEligibleEvaluator } = usePermissions();
    const navigate = useNavigate();

    const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
    const [questions, setQuestions] = useState<EvaluationQuestion[]>([]);
    const [targetUsers, setTargetUsers] = useState<User[]>([]);
    const [submissions, setSubmissions] = useState<EvaluationSubmission[]>([]);
    const [raterProfileId, setRaterProfileId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
    const [scores, setScores] = useState<Record<string, number | string>>({});

    useEffect(() => {
        if (!user) return;
        let active = true;
        const resolveRaterProfileId = async () => {
            try {
                const resolvedId = await resolveCurrentHrisUserId(user.id);
                if (active) setRaterProfileId(resolvedId);
            } catch (profileError: any) {
                if (active) {
                    setRaterProfileId(user.id || null);
                    setLoadError(profileError?.message || 'Unable to resolve your HRIS account.');
                }
            }
        };
        resolveRaterProfileId();
        return () => {
            active = false;
        };
    }, [user]);

    useEffect(() => {
        if (!evaluationId) return;
        let active = true;
        const loadEvaluation = async () => {
            setIsLoading(true);
            setLoadError(null);
            try {
                const [{ data: evalRow, error: evalErr }, { data: evalers, error: evalerErr }] = await Promise.all([
                    supabase
                        .from('evaluations')
                        .select('id, name, timeline_id, target_business_unit_ids, target_employee_ids, question_set_ids, status, created_at, due_date, is_employee_visible, acknowledged_by')
                        .eq('id', evaluationId)
                        .maybeSingle(),
                    supabase
                        .from('evaluation_evaluators')
                        .select('id, evaluation_id, type, user_id, weight, business_unit_id, department_id, is_anonymous, exclude_subject')
                        .eq('evaluation_id', evaluationId),
                ]);
                if (evalErr) throw evalErr;
                if (!evalRow) {
                    if (active) {
                        setEvaluation(null);
                        setLoadError('This evaluation is unavailable or is not assigned to your account.');
                    }
                    return;
                }
                if (evalerErr) throw evalerErr;

                const evaluators: EvaluatorConfig[] = (evalers || []).map((row: any, index: number) => {
                    const normalizedType = String(row.type || '').toLowerCase();
                    return {
                        id: row.id || `${evaluationId}-${row.user_id || 'group'}-${index}`,
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
                });

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
                const [{ data: questionRows, error: questionErr }, { data: employeeRows, error: empErr }] = await Promise.all([
                    questionSetIds.length > 0
                        ? supabase
                              .from('evaluation_questions')
                              .select('*')
                              .in('question_set_id', questionSetIds)
                        : Promise.resolve({ data: [], error: null }),
                    mappedEvaluation.targetEmployeeIds.length > 0
                        ? supabase
                              .from('hris_users')
                              .select('id, full_name, email, role, status, business_unit, business_unit_id, department, department_id, position')
                              .in('id', mappedEvaluation.targetEmployeeIds)
                        : Promise.resolve({ data: [], error: null }),
                ]);
                if (questionErr) throw questionErr;
                if (empErr) throw empErr;

                const mappedQuestions: EvaluationQuestion[] =
                    (questionRows || []).map((q: any) => ({
                        id: q.id,
                        questionSetId: q.question_set_id,
                        title: q.title,
                        description: q.description || '',
                        questionType: q.question_type,
                        isArchived: !!q.is_archived,
                        targetEmployeeLevels: q.target_employee_levels || [],
                        targetEvaluatorRoles: q.target_evaluator_roles || [],
                    })) || [];

                const mappedEmployees: User[] =
                    (employeeRows || []).map((u: any) => ({
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

                if (!active) return;
                setEvaluation(mappedEvaluation);
                setQuestions(mappedQuestions.filter(q => !q.isArchived));
                setTargetUsers(mappedEmployees);
            } catch (err) {
                console.error('Failed to load evaluation', err);
                if (active) {
                    setEvaluation(null);
                    setLoadError((err as any)?.message || 'Failed to load this evaluation.');
                }
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
        if (!evaluationId || !raterProfileId) return;
        let active = true;
        const loadSubmissions = async () => {
            try {
                const { data, error } = await supabase
                    .from('evaluation_submissions')
                    .select('*')
                    .eq('evaluation_id', evaluationId)
                    .eq('rater_id', raterProfileId);
                if (error) throw error;
                if (!active) return;
                const mapped =
                    (data || []).map((row: any) => ({
                        id: row.id,
                        evaluationId: row.evaluation_id,
                        subjectEmployeeId: row.subject_employee_id,
                        raterId: row.rater_id,
                        raterGroup: (row.rater_group as RaterGroup) || RaterGroup.DirectSupervisor,
                        scores: row.scores || [],
                        submittedAt: row.submitted_at ? new Date(row.submitted_at) : new Date(),
                    })) || [];
                setSubmissions(mapped);
            } catch (err) {
                console.error('Failed to load evaluation submissions', err);
                if (active) setSubmissions([]);
            }
        };
        loadSubmissions();
        return () => {
            active = false;
        };
    }, [evaluationId, raterProfileId]);

    const eligibleTargets = useMemo(() => {
        if (!evaluation || !user) return [];
        const effectiveUser = { ...user, id: raterProfileId || user.id };
        return targetUsers.filter(u =>
            evaluation.targetEmployeeIds.includes(u.id) &&
            isUserEligibleEvaluator(effectiveUser, evaluation, u.id)
        );
    }, [evaluation, user, raterProfileId, targetUsers, isUserEligibleEvaluator]);

    // Effect: Select first user or ensure valid selection
    useEffect(() => {
        if (eligibleTargets.length > 0 && !selectedEmployeeId) {
            const firstUnevaluated = eligibleTargets.find(u => !submissions.some(s => s.subjectEmployeeId === u.id));
            setSelectedEmployeeId(firstUnevaluated?.id || eligibleTargets[0].id);
        }
    }, [eligibleTargets, submissions, selectedEmployeeId]);
    
    // Effect: Load existing data when employee changes
    useEffect(() => {
        if (selectedEmployeeId && user) {
            const raterId = raterProfileId || user.id;
            const existingSubmission = submissions.find(s => s.subjectEmployeeId === selectedEmployeeId && s.raterId === raterId);
            
            if (existingSubmission) {
                // Pre-fill form with existing data
                const loadedScores: Record<string, number | string> = {};
                existingSubmission.scores.forEach(item => {
                    loadedScores[item.questionId] = item.score !== undefined ? item.score : (item.answer || '');
                });
                setScores(loadedScores);
            } else {
                // Clear form for new entry
                setScores({});
            }
        }
    }, [selectedEmployeeId, submissions, user, raterProfileId]);

    const submittedEmployeeIds = useMemo(() => new Set(submissions.map(s => s.subjectEmployeeId)), [submissions]);
    const selectedEmployee = useMemo(() => eligibleTargets.find(u => u.id === selectedEmployeeId), [selectedEmployeeId, eligibleTargets]);
    
    const isDeadlinePassed = useMemo(() => {
        if (!evaluation?.dueDate) return false;
        const deadline = new Date(evaluation.dueDate);
        deadline.setHours(23, 59, 59, 999);
        return new Date() > deadline;
    }, [evaluation]);

    if (isLoading) {
        return (
            <div className="flex min-h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-b-indigo-600" />
            </div>
        );
    }

    if (!evaluation || !user) {
        return (
            <div className="space-y-6">
                <Link to="/evaluation/reviews" className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                    <ArrowLeftIcon /> Back to Evaluations
                </Link>
                <Card>
                    <div className="py-12 text-center">
                        <p className="font-medium text-gray-700 dark:text-gray-200">
                            {loadError || 'This evaluation is unavailable or is not assigned to your account.'}
                        </p>
                    </div>
                </Card>
            </div>
        );
    }
    
    if (eligibleTargets.length === 0) {
        return (
            <div className="space-y-6">
                <Link to="/evaluation/reviews" className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-2">
                    <ArrowLeftIcon /> Back to Evaluations
                </Link>
                <Card>
                    <div className="text-center py-12">
                        <p className="text-gray-600 dark:text-gray-400">You are not assigned to evaluate any employees in this cycle.</p>
                    </div>
                </Card>
            </div>
        );
    }

    if (evaluation.status !== 'InProgress') {
        return (
            <div className="space-y-6">
                <Link to="/evaluation/reviews" className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-2">
                    <ArrowLeftIcon /> Back to Evaluations
                </Link>
                <Card>
                    <div className="py-12 text-center">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            This evaluation is {evaluation.status}.
                        </h2>
                        <p className="mt-2 text-gray-600 dark:text-gray-400">
                            It can no longer be completed or changed from this form.
                        </p>
                        {submissions.length > 0 && (
                            <Link to={`/evaluation/report/${evaluation.id}`} className="mt-4 inline-block">
                                <Button variant="secondary">View Submitted Evaluation</Button>
                            </Link>
                        )}
                    </div>
                </Card>
            </div>
        );
    }

    const handleAnswerChange = (questionId: string, answer: number | string) => {
        setScores(prev => ({ ...prev, [questionId]: answer }));
    };

    const handleSubmit = async () => {
        if (Object.keys(scores).length !== questions.length) {
            alert('Please answer all questions before submitting.');
            return;
        }
        if (isSubmitting) return;

        setIsSubmitting(true);
        try {
            const raterId = raterProfileId || user.id;
            const existingIndex = submissions.findIndex(
                submission => submission.subjectEmployeeId === selectedEmployeeId && submission.raterId === raterId
            );

            const formattedScores = questions.map(question => {
                const answer = scores[question.id];
                if (question.questionType === 'paragraph') {
                    return { questionId: question.id, answer: String(answer || '') };
                }
                return { questionId: question.id, score: Number(answer || 0) };
            });

            if (existingIndex > -1) {
                const existing = submissions[existingIndex];
                const { data, error } = await supabase
                    .from('evaluation_submissions')
                    .update({
                        scores: formattedScores,
                        submitted_at: new Date().toISOString(),
                        rater_group: selectedEmployeeId === raterId ? RaterGroup.Self : RaterGroup.DirectSupervisor,
                    })
                    .eq('id', existing.id)
                    .select('id, evaluation_id, subject_employee_id, rater_id, rater_group, scores, submitted_at')
                    .single();
                if (error) throw error;

                const updatedSubmission: EvaluationSubmission = {
                    id: data.id,
                    evaluationId: data.evaluation_id,
                    subjectEmployeeId: data.subject_employee_id,
                    raterId: data.rater_id,
                    raterGroup: (data.rater_group as RaterGroup) || RaterGroup.DirectSupervisor,
                    scores: data.scores || [],
                    submittedAt: data.submitted_at ? new Date(data.submitted_at) : new Date(),
                };
                const nextSubmissions = [...submissions];
                nextSubmissions[existingIndex] = updatedSubmission;
                setSubmissions(nextSubmissions);

                await logActivity(user, 'UPDATE', 'EvaluationSubmission', updatedSubmission.id, `Updated evaluation for ${selectedEmployee?.name}`);
                alert('Evaluation updated successfully.');
                return;
            }

            const { data, error } = await supabase
                .from('evaluation_submissions')
                .insert({
                    evaluation_id: evaluation.id,
                    subject_employee_id: selectedEmployeeId,
                    rater_id: raterId,
                    rater_group: selectedEmployeeId === raterId ? RaterGroup.Self : RaterGroup.DirectSupervisor,
                    scores: formattedScores,
                    submitted_at: new Date().toISOString(),
                })
                .select('id, evaluation_id, subject_employee_id, rater_id, rater_group, scores, submitted_at')
                .single();
            if (error) throw error;

            const newSubmission: EvaluationSubmission = {
                id: data.id,
                evaluationId: data.evaluation_id,
                subjectEmployeeId: data.subject_employee_id,
                raterId: data.rater_id,
                raterGroup: (data.rater_group as RaterGroup) || RaterGroup.DirectSupervisor,
                scores: data.scores || [],
                submittedAt: data.submitted_at ? new Date(data.submitted_at) : new Date(),
            };
            setSubmissions(previous => [...previous, newSubmission]);
            await logActivity(user, 'CREATE', 'EvaluationSubmission', newSubmission.id, `Submitted evaluation for ${selectedEmployee?.name}`);

            const currentIndex = eligibleTargets.findIndex(target => target.id === selectedEmployeeId);
            const nextUser = eligibleTargets.find(
                (target, index) => index > currentIndex && !submittedEmployeeIds.has(target.id)
            );
            const firstUnevaluated = eligibleTargets.find(
                target => !submittedEmployeeIds.has(target.id) && target.id !== selectedEmployeeId
            );
            const nextTarget = nextUser || firstUnevaluated;
            if (nextTarget) {
                setSelectedEmployeeId(nextTarget.id);
                setScores({});
            }
            alert('Evaluation submitted successfully.');
        } catch (submitError: any) {
            alert(submitError?.message || 'Failed to submit evaluation.');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const allEvaluationsCompleted = eligibleTargets.length > 0 && submittedEmployeeIds.size === eligibleTargets.length;
    const isEditing = submittedEmployeeIds.has(selectedEmployeeId || '');

    return (
        <div className="space-y-6">
            <div>
                <Link to="/evaluation/reviews" className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-2">
                    <ArrowLeftIcon />
                    Back to Evaluations
                </Link>
                <div className="flex justify-between items-center">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{evaluation.name}</h1>
                    {isDeadlinePassed && <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-bold">Deadline Passed</span>}
                </div>
                <p className="text-gray-600 dark:text-gray-400 mt-1">You have completed {submittedEmployeeIds.size} of {eligibleTargets.length} evaluations.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <Card className="lg:col-span-1">
                    <h2 className="font-bold mb-3">Employees to Evaluate</h2>
                    <ul className="space-y-2">
                        {eligibleTargets.map(employee => {
                            const isSubmitted = submittedEmployeeIds.has(employee.id);
                            return (
                                <li key={employee.id}>
                                    <button 
                                        onClick={() => setSelectedEmployeeId(employee.id)}
                                        className={`w-full text-left p-2 rounded-md flex items-center justify-between transition-colors ${
                                            selectedEmployeeId === employee.id ? 'bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-500' : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 border border-transparent'
                                        }`}
                                    >
                                        <span>{employee.name}</span>
                                        {isSubmitted && <CheckCircleIcon />}
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                </Card>

                <div className="lg:col-span-3">
                    {selectedEmployee ? (
                        <Card title={`Evaluating: ${selectedEmployee.name}`}>
                            {isEditing && !isDeadlinePassed && (
                                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-sm rounded-md border border-blue-200 dark:border-blue-800">
                                    You have already submitted this evaluation. You can update your answers until the deadline.
                                </div>
                            )}
                            {isDeadlinePassed && (
                                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 text-sm rounded-md border border-red-200 dark:border-red-800">
                                    The deadline for this evaluation has passed. You can view your submission but cannot make changes.
                                </div>
                            )}

                            <div className="space-y-6">
                                {questions.map((q, index) => (
                                    <div key={q.id}>
                                        <h3 className="font-semibold text-gray-800 dark:text-gray-200">{index + 1}. {q.title}</h3>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{q.description}</p>
                                        {q.questionType === 'rating' ? (
                                            <div className="flex space-x-2">
                                                {[1,2,3,4,5].map(num => (
                                                    <button 
                                                        key={num} 
                                                        onClick={() => !isDeadlinePassed && handleAnswerChange(q.id, num)}
                                                        disabled={isDeadlinePassed}
                                                        className={`h-10 w-10 rounded-full border flex items-center justify-center transition-colors ${
                                                            scores[q.id] === num 
                                                            ? 'bg-indigo-600 text-white border-indigo-600' 
                                                            : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                                                        } ${isDeadlinePassed ? 'cursor-not-allowed opacity-80' : ''}`}
                                                    >
                                                        {num}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <Textarea 
                                                label=""
                                                id={`q-text-${q.id}`}
                                                value={String(scores[q.id] || '')}
                                                onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                                                rows={5}
                                                placeholder="Your detailed feedback..."
                                                disabled={isDeadlinePassed}
                                            />
                                        )}
                                    </div>
                                ))}
                                <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                                    {!isDeadlinePassed && (
                                        <Button 
                                            onClick={handleSubmit} 
                                            disabled={isSubmitting || Object.keys(scores).length !== questions.length}
                                        >
                                            {isSubmitting
                                                ? 'Submitting…'
                                                : (isEditing ? 'Update Submission' : `Submit for ${selectedEmployee.name}`)}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </Card>
                    ) : allEvaluationsCompleted ? (
                        <Card>
                             <div className="text-center py-12">
                                <h3 className="text-xl font-bold text-green-500">All evaluations completed!</h3>
                                <p className="mt-2 text-gray-600 dark:text-gray-400">Thank you. Your feedback has been submitted.</p>
                                <Link to="/evaluation/reviews" className="mt-4 inline-block">
                                    <Button variant="secondary">Back to Reviews</Button>
                                </Link>
                            </div>
                        </Card>
                    ) : (
                         <Card>
                            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                                <p>Select an employee from the left to begin.</p>
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PerformEvaluation;
