
import React, { useState, useMemo, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { mockEvaluations, mockEvaluationSubmissions, mockUsers, mockEvaluationQuestions } from '../../services/mockData';
import { Evaluation, User, EvaluationSubmission, RaterGroup } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import Textarea from '../../components/ui/Textarea';
import { logActivity } from '../../services/auditService';

// Icons
const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;
const CheckCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>;


const PerformEvaluation: React.FC = () => {
    const { evaluationId } = useParams<{ evaluationId: string }>();
    const { user } = useAuth();
    const { isUserEligibleEvaluator } = usePermissions();
    const navigate = useNavigate();

    // Data fetching
    const evaluation = useMemo(() => mockEvaluations.find(e => e.id === evaluationId), [evaluationId]);
    
    // Filter targets: The user must be an eligible evaluator for the target
    const targetUsers = useMemo(() => {
        if (!evaluation || !user) return [];
        return mockUsers.filter(u => 
            evaluation.targetEmployeeIds.includes(u.id) && 
            isUserEligibleEvaluator(user, evaluation, u.id)
        );
    }, [evaluation, user, isUserEligibleEvaluator]);

    const questions = useMemo(() => {
        if (!evaluation) return [];
        return mockEvaluationQuestions.filter(q => evaluation.questionSetIds.includes(q.questionSetId) && !q.isArchived);
    }, [evaluation]);

    // State
    // NOTE: We use state to track submissions so UI updates immediately upon save
    const [submissions, setSubmissions] = useState<EvaluationSubmission[]>(() => 
        mockEvaluationSubmissions.filter(s => s.evaluationId === evaluationId && s.raterId === user?.id)
    );
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
    const [scores, setScores] = useState<Record<string, number | string>>({});

    // Effect: Select first user or ensure valid selection
    useEffect(() => {
        if (targetUsers.length > 0 && !selectedEmployeeId) {
            // Find the first employee this user hasn't evaluated yet, or default to first
            const firstUnevaluated = targetUsers.find(u => !submissions.some(s => s.subjectEmployeeId === u.id));
            setSelectedEmployeeId(firstUnevaluated?.id || targetUsers[0].id);
        }
    }, [targetUsers, submissions, selectedEmployeeId]);
    
    // Effect: Load existing data when employee changes
    useEffect(() => {
        if (selectedEmployeeId && user) {
            const existingSubmission = submissions.find(s => s.subjectEmployeeId === selectedEmployeeId && s.raterId === user.id);
            
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
    }, [selectedEmployeeId, submissions, user]);

    const submittedEmployeeIds = useMemo(() => new Set(submissions.map(s => s.subjectEmployeeId)), [submissions]);
    const selectedEmployee = useMemo(() => targetUsers.find(u => u.id === selectedEmployeeId), [selectedEmployeeId, targetUsers]);
    
    const isDeadlinePassed = useMemo(() => {
        if (!evaluation?.dueDate) return false;
        return new Date() > new Date(evaluation.dueDate);
    }, [evaluation]);

    if (!evaluation || !user) {
        return <div>Loading or evaluation not found...</div>;
    }
    
    if (targetUsers.length === 0) {
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

    const handleAnswerChange = (questionId: string, answer: number | string) => {
        setScores(prev => ({ ...prev, [questionId]: answer }));
    };

    const handleSubmit = () => {
        if (Object.keys(scores).length !== questions.length) {
            alert('Please answer all questions before submitting.');
            return;
        }
        
        const existingIndex = submissions.findIndex(s => s.subjectEmployeeId === selectedEmployeeId && s.raterId === user.id);
        
        const formattedScores = questions.map(q => {
            const answer = scores[q.id];
            if (q.questionType === 'paragraph') {
                return { questionId: q.id, answer: String(answer || '') };
            }
            return { questionId: q.id, score: Number(answer || 0) };
        });

        if (existingIndex > -1) {
            // Update Existing
            const updatedSubmission = {
                ...submissions[existingIndex],
                scores: formattedScores,
                submittedAt: new Date(),
            };
            
            // Update Local State
            const newSubmissions = [...submissions];
            newSubmissions[existingIndex] = updatedSubmission;
            setSubmissions(newSubmissions);

            // Update Mock Data
            const mockIndex = mockEvaluationSubmissions.findIndex(s => s.id === updatedSubmission.id);
            if (mockIndex > -1) mockEvaluationSubmissions[mockIndex] = updatedSubmission;

            logActivity(user, 'UPDATE', 'EvaluationSubmission', updatedSubmission.id, `Updated evaluation for ${selectedEmployee?.name}`);
            alert("Evaluation updated successfully.");

        } else {
            // Create New
            const newSubmission: EvaluationSubmission = {
                id: `SUB-${Date.now()}`,
                evaluationId: evaluation.id,
                subjectEmployeeId: selectedEmployeeId!,
                raterId: user.id,
                raterGroup: RaterGroup.DirectSupervisor, // Legacy field
                scores: formattedScores,
                submittedAt: new Date(),
            };

            mockEvaluationSubmissions.push(newSubmission);
            setSubmissions(prev => [...prev, newSubmission]);
            
            logActivity(user, 'CREATE', 'EvaluationSubmission', newSubmission.id, `Submitted evaluation for ${selectedEmployee?.name}`);
            
            // Auto-navigate to the next user only on NEW submission
            const currentIndex = targetUsers.findIndex(u => u.id === selectedEmployeeId);
            const nextUser = targetUsers.find((u, index) => index > currentIndex && !submittedEmployeeIds.has(u.id));
            
            if (nextUser) {
                setSelectedEmployeeId(nextUser.id);
                setScores({}); // Clear scores for the next user
            } else {
                // If no next user, stay or check unfinished
                const firstUnevaluated = targetUsers.find(u => !submittedEmployeeIds.has(u.id) && u.id !== selectedEmployeeId);
                 if(firstUnevaluated) {
                    setSelectedEmployeeId(firstUnevaluated.id);
                    setScores({});
                 }
            }
            alert("Evaluation submitted successfully.");
        }
    };
    
    const allEvaluationsCompleted = targetUsers.length > 0 && submittedEmployeeIds.size === targetUsers.length;
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
                <p className="text-gray-600 dark:text-gray-400 mt-1">You have completed {submittedEmployeeIds.size} of {targetUsers.length} evaluations.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <Card className="lg:col-span-1">
                    <h2 className="font-bold mb-3">Employees to Evaluate</h2>
                    <ul className="space-y-2">
                        {targetUsers.map(employee => {
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
                                            disabled={Object.keys(scores).length !== questions.length}
                                        >
                                            {isEditing ? 'Update Submission' : `Submit for ${selectedEmployee.name}`}
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
