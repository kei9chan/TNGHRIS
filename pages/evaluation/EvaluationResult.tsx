
import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { mockEvaluations, mockEvaluationSubmissions, mockUsers, mockEvaluationQuestions, mockBusinessUnits, mockDepartments } from '../../services/mockData';
import { Evaluation, EvaluationSubmission, User, EvaluationQuestion, Role, Permission, EvaluatorType, EvaluatorConfig } from '../../types';

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
}

const BreakdownItem: React.FC<BreakdownItemProps> = ({ item }) => {
    const [isOpen, setIsOpen] = useState(false);

    const renderConfigName = (config: EvaluatorConfig) => {
        if (config.type === EvaluatorType.Individual) {
            const rater = mockUsers.find(u => u.id === config.userId);
            return rater ? `Individual: ${rater.name}` : 'Unknown Individual';
        } else {
            const buName = mockBusinessUnits.find(b => b.id === config.groupFilter?.businessUnitId)?.name || 'All BUs';
            const deptName = mockDepartments.find(d => d.id === config.groupFilter?.departmentId)?.name || 'All Depts';
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
    const [selectedUserForDetails, setSelectedUserForDetails] = useState<User | null>(null);

    const evaluation = useMemo(() => mockEvaluations.find(e => e.id === evaluationId), [evaluationId]);
    const submissions = useMemo(() => mockEvaluationSubmissions.filter(s => s.evaluationId === evaluationId), [evaluationId]);
    const questions = useMemo(() => {
        if (!evaluation) return [];
        return mockEvaluationQuestions.filter(q => evaluation.questionSetIds.includes(q.questionSetId));
    }, [evaluation]);
    const targetUsers = useMemo(() => mockUsers.filter(u => evaluation?.targetEmployeeIds.includes(u.id)), [evaluation]);
    
    const [isEmployeeVisible, setIsEmployeeVisible] = useState(evaluation?.isEmployeeVisible || false);
    const [hasAcknowledged, setHasAcknowledged] = useState(evaluation?.acknowledgedBy?.includes(user?.id || '') || false);

    const handleVisibilityToggle = () => {
        const newValue = !isEmployeeVisible;
        setIsEmployeeVisible(newValue);
        const index = mockEvaluations.findIndex(e => e.id === evaluationId);
        if (index > -1) {
            mockEvaluations[index].isEmployeeVisible = newValue;
        }
    };

    const handleAcknowledge = () => {
        if (!evaluation || !user) return;
        
        const index = mockEvaluations.findIndex(e => e.id === evaluation.id);
        if (index > -1) {
            const updatedEval = { ...mockEvaluations[index] };
            if (!updatedEval.acknowledgedBy) {
                updatedEval.acknowledgedBy = [];
            }
            if (!updatedEval.acknowledgedBy.includes(user.id)) {
                updatedEval.acknowledgedBy.push(user.id);
                mockEvaluations[index] = updatedEval;
                setHasAcknowledged(true);
            }
        }
    };
    
    // --- PHASE 4: SCORING ENGINE ---
    const results = useMemo(() => {
        if (!evaluation) return { employeeScores: [], overallAverage: 0, questionAverages: {} };

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
                const rater = mockUsers.find(u => u.id === sub.raterId);
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
                        const buName = mockBusinessUnits.find(b => b.id === filter.businessUnitId)?.name;
                        const deptName = mockDepartments.find(d => d.id === filter.departmentId)?.name;

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

            return { user: employee, finalScore, breakdown, usedWeight };
        });

        const overallAverage = employeeScores.length > 0 
            ? employeeScores.reduce((sum, es) => sum + es.finalScore, 0) / employeeScores.length 
            : 0;
        
        const questionAverages: Record<string, number> = {};
        questions.filter(q => q.questionType === 'rating').forEach(q => {
            const scoresForQuestion = submissions.flatMap(s => s.scores).filter(s => s.questionId === q.id && s.score !== undefined);
            const avg = scoresForQuestion.length > 0 
                ? scoresForQuestion.reduce((sum, s) => sum + s.score!, 0) / scoresForQuestion.length 
                : 0;
            questionAverages[q.id] = avg;
        });

        return { employeeScores, overallAverage, questionAverages };
    }, [evaluation, submissions, targetUsers, questions]);
    
    if (!evaluation || !user) return <div>Loading...</div>;
    
    const isAdminView = can('Evaluation', Permission.Manage);
    const isEvaluatedEmployee = evaluation.targetEmployeeIds.includes(user.id);

    const selectedEmployeeScores = selectedUserForDetails ? results.employeeScores.find(es => es.user.id === selectedUserForDetails.id) : null;

    const renderAdminView = () => (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card title="Completion">{submissions.length} Submissions</Card>
                <Card title="Overall Average Score">{results.overallAverage.toFixed(2)} / 5.0</Card>
                <Card title="Participants">{targetUsers.length} Employees</Card>
            </div>

            <Card title="Employee Results">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase">Employee</th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase">Final Score</th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase w-1/3">Performance</th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase">Data Integrity</th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase">Status</th>
                                <th className="relative px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {results.employeeScores.map(es => {
                                const hasAcknowledged = evaluation.acknowledgedBy?.includes(es.user.id);
                                return (
                                <tr key={es.user.id}>
                                    <td className="px-4 py-4 whitespace-nowrap font-medium">{es.user.name}</td>
                                    <td className="px-4 py-4 whitespace-nowrap font-bold text-lg">{es.finalScore.toFixed(2)}</td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <div className="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-600">
                                            <div className="bg-indigo-600 h-4 rounded-full" style={{ width: `${(es.finalScore / 5) * 100}%` }}></div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                                        {es.usedWeight < 100 ? (
                                            <span className="text-yellow-600 dark:text-yellow-400 font-semibold" title="Score is calculated based on partial data">Based on {es.usedWeight}% Weight</span>
                                        ) : (
                                            <span className="text-green-600 dark:text-green-400">Complete (100%)</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                                        {hasAcknowledged ? (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                                                Acknowledged
                                            </span>
                                        ) : (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300">
                                                Pending
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-right">
                                        <Button size="sm" onClick={() => { setSelectedUserForDetails(es.user); setIsDetailsModalOpen(true); }}>View Details</Button>
                                    </td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </div>
            </Card>
            
            <Card title="Question Analysis">
                <ul className="space-y-4">
                    {questions.filter(q => q.questionType === 'rating').map(q => (
                        <li key={q.id}>
                            <div className="flex justify-between items-center">
                                <span className="font-medium">{q.title}</span>
                                <span className="font-bold text-indigo-600 dark:text-indigo-400">{results.questionAverages[q.id]?.toFixed(2) || 'N/A'}</span>
                            </div>
                        </li>
                    ))}
                </ul>
            </Card>
        </div>
    );
    
    const renderEmployeeView = () => {
        if (!isEmployeeVisible) {
             return <Card><p className="text-center">Results for this evaluation have not been released by HR yet.</p></Card>;
        }
        const myScores = results.employeeScores.find(es => es.user.id === user.id);
        if (!myScores) return <Card><p>Your results could not be found.</p></Card>;

        return (
            <Card title={`My Results for: ${evaluation.name}`}>
                <div className="text-center mb-6">
                    <p className="text-gray-500">Your Final Score</p>
                    <p className="text-5xl font-bold text-indigo-600 dark:text-indigo-400">{myScores.finalScore.toFixed(2)}</p>
                    {myScores.usedWeight < 100 && <p className="text-xs text-yellow-500 mt-2">Note: Based on {myScores.usedWeight}% of weighted evaluators.</p>}
                </div>
                 <div className="mb-6">
                     <h4 className="font-semibold mb-4 text-lg border-b pb-2 dark:border-gray-700">Performance Breakdown</h4>
                     <div className="space-y-4">
                         {myScores.breakdown.map(item => (
                             <BreakdownItem key={item.config.id} item={item} />
                         ))}
                     </div>
                 </div>
                 
                {isEvaluatedEmployee && isEmployeeVisible && (
                    <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 text-center">
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
                )}
            </Card>
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
                 {isAdminView && (
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
            
            {isAdminView ? renderAdminView() : isEvaluatedEmployee ? renderEmployeeView() : <Card><p>You do not have permission to view these results.</p></Card>}
            
            {selectedUserForDetails && (
                <Modal 
                    isOpen={isDetailsModalOpen} 
                    onClose={() => setIsDetailsModalOpen(false)} 
                    title={`Detailed Scores for ${selectedUserForDetails.name}`}
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
                                <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200 border-b dark:border-gray-600 pb-2">Breakdown by Component</h4>
                                {selectedEmployeeScores.breakdown.map(item => (
                                    <BreakdownItem key={item.config.id} item={item} />
                                ))}
                            </div>
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
