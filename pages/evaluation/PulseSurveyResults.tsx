import { mapPulseQuestion, formatPulseAnswer, csvCell } from '../../services/pulseQuestionRules';
import React, { useState, useMemo, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import PulseHeatmap from '../../components/evaluation/PulseHeatmap';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabaseClient';

const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;

const PulseSurveyResults: React.FC = () => {
    const { surveyId } = useParams<{ surveyId: string }>();
    const [activeTab, setActiveTab] = useState<'overview' | 'heatmap' | 'feedback'>('overview');
    const [survey, setSurvey] = useState<any | null>(null);
    const [responses, setResponses] = useState<any[]>([]);
    const [userDeptMap, setUserDeptMap] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        if (!surveyId) return;
        const load = async () => {
            setIsLoading(true);
            const [{ data: sv, error: svError }, { data: resp, error: respError }, { data: users }] = await Promise.all([
                supabase.from('pulse_surveys').select('*').eq('id', surveyId).single(),
                supabase.from('pulse_survey_responses').select('*').eq('survey_id', surveyId),
                supabase.from('hris_users').select('id, department'),
            ]);
            if (svError || respError) { setLoadError(svError?.message || respError?.message || 'Unable to load results'); setIsLoading(false); return; }
            const {data: sections, error: sectionError} = await supabase.from('pulse_survey_sections').select('*').eq('survey_id',surveyId).order('sort_order');
            const ids = (sections || []).map(s => s.id);
            const {data: questions, error: questionError} = ids.length ? await supabase.from('pulse_survey_questions').select('*').in('section_id',ids).order('sort_order') : {data:[],error:null};
            if (sectionError || questionError) { setLoadError('Could not load survey questions.'); setIsLoading(false); return; }
            setSurvey(sv ? {...sv,sections:(sections || []).map(section => ({...section,questions:(questions || []).filter(q => q.section_id === section.id).map(mapPulseQuestion)}))} : null);
            setResponses(resp || []);
            const deptMap: Record<string, string> = {};
            (users || []).forEach((u: any) => { deptMap[u.id] = u.department || 'Unknown'; });
            setUserDeptMap(deptMap);
            setIsLoading(false);
        };
        load();
    }, [surveyId]);

    // Helper to process data
    const { sectionScores, departmentData, overallAverage, responseCount, textComments } = useMemo(() => {
        if (loadError) return <div role="alert">{loadError}</div>;
    if (!survey) return { sectionScores: [], departmentData: [], overallAverage: 0, responseCount: 0, textComments: [] };

        const sectionMap: Record<string, { total: number, count: number, title: string }> = {};
        const deptMap: Record<string, Record<string, { total: number, count: number }>> = {};
        const comments: { text: string, department: string, date: Date }[] = [];

        // Initialize section map
        survey.sections.forEach(s => {
            sectionMap[s.id] = { total: 0, count: 0, title: s.title };
        });

        responses.forEach(response => {
            const dept = userDeptMap[response.respondent_id || response.respondentId] || 'Unknown';

            if (!deptMap[dept]) {
                deptMap[dept] = {};
                survey.sections.forEach(s => {
                    deptMap[dept][s.id] = { total: 0, count: 0 };
                });
            }

            if (response.comments) {
                comments.push({ text: response.comments, department: dept, date: new Date(response.submitted_at || response.submittedAt) });
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
        const rated = Object.values(sectionMap).reduce((acc,s) => ({total:acc.total+s.total,count:acc.count+s.count}),{total:0,count:0});
        const overallAvg = rated.count ? rated.total / rated.count : 0;

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
    }, [survey, responses, userDeptMap]);

    if (isLoading) return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading survey results…</div>;
    if (!survey) return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Survey not found.</div>;

    const questions = survey.sections.flatMap(s => s.questions);
    const exportReport = () => {
        const rows = [['Response', 'Submitted at', ...questions.map(q => q.text), 'Additional comments'], ...responses.map((r,i) => [survey.is_anonymous ? `Anonymous ${i+1}` : r.respondent_id, r.submitted_at, ...questions.map(q => formatPulseAnswer(q,(r.answers || []).find(a => a.questionId === q.id)?.value)),r.comments || ''])];
        const url = URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row => row.map(v => csvCell(String(v ?? ''))).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
        const a = document.createElement('a'); a.href=url; a.download='pulse-survey-results.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
    };

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

            <button type="button" className="rounded bg-indigo-600 px-4 py-2 text-white" onClick={exportReport}>Download responses (CSV)</button>
            <Card title="Responses by question"><div className="space-y-6">{questions.map(q => <section key={q.id}><h3 className="font-semibold">{q.text}</h3><p className="text-sm text-gray-500">{q.type.replace('_',' ')} · {responses.filter(r => formatPulseAnswer(q,(r.answers || []).find(a => a.questionId === q.id)?.value) !== '').length} answered</p><ul className="mt-2 space-y-2">{responses.map((r,i) => <li key={r.id} className="border-b py-2 break-words"><span className="text-sm">{survey.is_anonymous ? `Anonymous ${i+1}` : r.respondent_id}: </span>{formatPulseAnswer(q,(r.answers || []).find(a => a.questionId === q.id)?.value) || 'Not answered'}</li>)}</ul></section>)}</div></Card>
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
