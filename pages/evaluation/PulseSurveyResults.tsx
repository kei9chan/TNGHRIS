
import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { mockPulseSurveys, mockSurveyResponses, mockUsers } from '../../services/mockData';
import Card from '../../components/ui/Card';
import PulseHeatmap from '../../components/evaluation/PulseHeatmap';
import { useAuth } from '../../hooks/useAuth';

const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;

const PulseSurveyResults: React.FC = () => {
    const { surveyId } = useParams<{ surveyId: string }>();
    const [activeTab, setActiveTab] = useState<'overview' | 'heatmap' | 'feedback'>('overview');

    const survey = useMemo(() => {
        return mockPulseSurveys.find(s => s.id === surveyId);
    }, [surveyId]);

    const responses = useMemo(() => {
        return mockSurveyResponses.filter(r => r.surveyId === surveyId);
    }, [surveyId]);

    // Helper to process data
    const { sectionScores, departmentData, overallAverage, responseCount, textComments } = useMemo(() => {
        if (!survey) return { sectionScores: [], departmentData: [], overallAverage: 0, responseCount: 0, textComments: [] };

        const sectionMap: Record<string, { total: number, count: number, title: string }> = {};
        const deptMap: Record<string, Record<string, { total: number, count: number }>> = {};
        const comments: { text: string, department: string, date: Date }[] = [];

        // Initialize section map
        survey.sections.forEach(s => {
            sectionMap[s.id] = { total: 0, count: 0, title: s.title };
        });

        responses.forEach(response => {
            const employee = mockUsers.find(u => u.id === response.respondentId);
            const dept = employee?.department || 'Unknown';

            if (!deptMap[dept]) {
                deptMap[dept] = {};
                survey.sections.forEach(s => {
                    deptMap[dept][s.id] = { total: 0, count: 0 };
                });
            }

            if (response.comments) {
                comments.push({ text: response.comments, department: dept, date: response.submittedAt });
            }

            response.answers.forEach(ans => {
                // Find which section this question belongs to
                const section = survey.sections.find(s => s.questions.some(q => q.id === ans.questionId));
                
                if (section && typeof ans.value === 'number') {
                    // Global Section aggregation
                    sectionMap[section.id].total += ans.value;
                    sectionMap[section.id].count += 1;

                    // Department aggregation
                    if (deptMap[dept][section.id]) {
                        deptMap[dept][section.id].total += ans.value;
                        deptMap[dept][section.id].count += 1;
                    }
                }
            });
        });

        // Final Calculations
        const finalSectionScores = Object.entries(sectionMap).map(([id, data]) => ({
            id,
            title: data.title,
            score: data.count > 0 ? data.total / data.count : 0
        }));

        const overallSum = finalSectionScores.reduce((sum, s) => sum + s.score, 0);
        const overallAvg = finalSectionScores.length > 0 ? overallSum / finalSectionScores.length : 0;

        const finalDepartmentData = Object.entries(deptMap).map(([deptName, sections]) => {
            const scores: Record<string, number> = {};
            Object.entries(sections).forEach(([secId, data]) => {
                scores[secId] = data.count > 0 ? data.total / data.count : 0;
            });
            return { department: deptName, sectionScores: scores };
        });

        return {
            sectionScores: finalSectionScores,
            departmentData: finalDepartmentData,
            overallAverage: overallAvg,
            responseCount: responses.length,
            textComments: comments
        };
    }, [survey, responses]);

    if (!survey) return <div>Survey not found</div>;

    const getTabClass = (tabName: string) => `px-4 py-2 font-medium text-sm rounded-md transition-colors ${activeTab === tabName ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`;

    return (
        <div className="space-y-6">
            <div>
                <Link to="/evaluation/pulse" className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-2">
                    <ArrowLeftIcon />
                    Back to Pulse Surveys
                </Link>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{survey.title} - Results</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                    Analysing {responseCount} response(s). Overall Engagement Score: <span className="font-bold text-indigo-600 dark:text-indigo-400">{overallAverage.toFixed(2)} / 5.0</span>
                </p>
            </div>

            <div className="flex space-x-2 border-b border-gray-200 dark:border-gray-700 pb-2">
                <button className={getTabClass('overview')} onClick={() => setActiveTab('overview')}>Overview</button>
                <button className={getTabClass('heatmap')} onClick={() => setActiveTab('heatmap')}>Department Heatmap</button>
                <button className={getTabClass('feedback')} onClick={() => setActiveTab('feedback')}>Qualitative Feedback</button>
            </div>

            {activeTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sectionScores.map(section => (
                        <Card key={section.id}>
                            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{section.title}</h3>
                            <div className="mt-4 flex items-end justify-between">
                                <span className="text-4xl font-bold text-gray-900 dark:text-white">{section.score.toFixed(1)}</span>
                                <span className="text-sm text-gray-500 dark:text-gray-400">/ 5.0</span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mt-4">
                                <div 
                                    className={`h-2.5 rounded-full ${section.score >= 4 ? 'bg-green-500' : section.score >= 3 ? 'bg-yellow-500' : 'bg-red-500'}`} 
                                    style={{ width: `${(section.score / 5) * 100}%` }}
                                ></div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {activeTab === 'heatmap' && (
                <Card title="Department Breakdown">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Scores represent the average rating for each section by department. Hover over cells for details.</p>
                    <PulseHeatmap sections={survey.sections} data={departmentData} />
                </Card>
            )}

            {activeTab === 'feedback' && (
                <div className="space-y-4">
                    {textComments.map((comment, index) => (
                        <Card key={index}>
                            <div className="flex justify-between items-start">
                                <p className="text-gray-800 dark:text-gray-200 italic">"{comment.text}"</p>
                            </div>
                            <div className="mt-2 pt-2 border-t dark:border-gray-700 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                                <span>Department: {comment.department}</span>
                                <span>{new Date(comment.date).toLocaleDateString()}</span>
                            </div>
                        </Card>
                    ))}
                    {textComments.length === 0 && (
                        <p className="text-center py-10 text-gray-500 dark:text-gray-400">No text comments received yet.</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default PulseSurveyResults;
