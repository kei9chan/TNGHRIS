
import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { mockPulseSurveys, mockSurveyResponses } from '../../services/mockData';
import { PulseSurvey, SurveyResponse, PulseSurveyStatus, SurveySection } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Textarea from '../../components/ui/Textarea';
import { supabase } from '../../services/supabaseClient';

const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;

const TakePulseSurvey: React.FC = () => {
    const { surveyId } = useParams<{ surveyId: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();
    
    const [answers, setAnswers] = useState<Record<string, number | string>>({});
    const [comment, setComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [survey, setSurvey] = useState<PulseSurvey | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [respondentId, setRespondentId] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        let active = true;
        const resolveRespondentId = async () => {
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
            if (active) setRespondentId(resolvedId || user.id || null);
        };
        resolveRespondentId();
        return () => {
            active = false;
        };
    }, [user]);

    useEffect(() => {
        if (!surveyId) return;
        let active = true;
        const loadSurvey = async () => {
            setIsLoading(true);
            setLoadError(null);
            try {
                const { data: surveyRow, error: surveyErr } = await supabase
                    .from('pulse_surveys')
                    .select('*')
                    .eq('id', surveyId)
                    .maybeSingle();
                if (surveyErr) throw surveyErr;

                if (surveyRow) {
                    const { data: sectionRows, error: secErr } = await supabase
                        .from('pulse_survey_sections')
                        .select('*')
                        .eq('survey_id', surveyId)
                        .order('sort_order');
                    if (secErr) throw secErr;
                    const sectionIds = (sectionRows || []).map((s: any) => s.id);
                    const { data: questionRows, error: qErr } = sectionIds.length > 0
                        ? await supabase
                              .from('pulse_survey_questions')
                              .select('*')
                              .in('section_id', sectionIds)
                              .order('sort_order')
                        : { data: [], error: null };
                    if (qErr) throw qErr;

                    const sectionMap: Record<string, SurveySection> = {};
                    (sectionRows || []).forEach((s: any) => {
                        sectionMap[s.id] = {
                            id: s.id,
                            title: s.title,
                            description: s.description || '',
                            questions: [],
                        };
                    });
                    (questionRows || []).forEach((q: any) => {
                        const container = sectionMap[q.section_id];
                        if (container) {
                            container.questions.push({
                                id: q.id,
                                text: q.text,
                                type: q.question_type,
                            });
                        }
                    });

                    const mappedSurvey: PulseSurvey = {
                        id: surveyRow.id,
                        title: surveyRow.title,
                        description: surveyRow.description || '',
                        startDate: surveyRow.start_date ? new Date(surveyRow.start_date) : new Date(),
                        endDate: surveyRow.end_date ? new Date(surveyRow.end_date) : undefined,
                        status: surveyRow.status as PulseSurveyStatus,
                        isAnonymous: !!surveyRow.is_anonymous,
                        sections: Object.values(sectionMap),
                        targetDepartments: surveyRow.target_department_ids || [],
                        createdByUserId: surveyRow.created_by_user_id || '',
                        createdAt: surveyRow.created_at ? new Date(surveyRow.created_at) : new Date(),
                    };
                    if (active) {
                        setSurvey(mappedSurvey);
                        setIsLoading(false);
                    }
                    return;
                }

                const fallback = mockPulseSurveys.find(s => s.id === surveyId) || null;
                if (active) {
                    setSurvey(fallback);
                    setIsLoading(false);
                }
            } catch (err) {
                console.error('Failed to load pulse survey', err);
                if (active) {
                    setLoadError('Failed to load survey.');
                    setIsLoading(false);
                }
            }
        };
        loadSurvey();
        return () => {
            active = false;
        };
    }, [surveyId]);

    useEffect(() => {
        if (!survey || !respondentId) return;
        let active = true;
        const checkResponse = async () => {
            try {
                const { data, error } = await supabase
                    .from('pulse_survey_responses')
                    .select('id')
                    .eq('survey_id', survey.id)
                    .eq('respondent_id', respondentId)
                    .limit(1);
                if (error) throw error;
                if (!active) return;
                if (data && data.length > 0) {
                    alert('You have already submitted a response for this survey.');
                    navigate('/dashboard');
                }
            } catch (err) {
                const fallback = mockSurveyResponses.find(r => r.surveyId === survey.id && r.respondentId === respondentId);
                if (fallback) {
                    alert('You have already submitted a response for this survey.');
                    navigate('/dashboard');
                }
            }
        };
        checkResponse();
        return () => {
            active = false;
        };
    }, [survey, respondentId, navigate]);

    useEffect(() => {
        if (!survey) return;
        if (survey.status !== PulseSurveyStatus.Active) {
            alert('This survey is not currently active.');
            navigate('/dashboard');
        }
    }, [survey, navigate]);

    if (isLoading) return <div>Loading...</div>;
    if (loadError) return <div>{loadError}</div>;
    if (!survey || !user) return <div>Survey not found.</div>;

    const handleRatingChange = (questionId: string, rating: number) => {
        setAnswers(prev => ({ ...prev, [questionId]: rating }));
    };

    const handleTextChange = (questionId: string, text: string) => {
        setAnswers(prev => ({ ...prev, [questionId]: text }));
    };

    const isSubmitDisabled = () => {
        // Check if all required questions are answered.
        // For simplicity, assume all RATING questions are required. Text questions are optional unless specified.
        for (const section of survey.sections) {
            for (const question of section.questions) {
                if (question.type === 'rating' && !answers[question.id]) {
                    return true;
                }
            }
        }
        return false;
    };

    const handleSubmit = () => {
        setIsSubmitting(true);
        
        const formattedAnswers = Object.entries(answers).map(([qId, val]) => ({
            questionId: qId,
            value: val as string | number
        }));

        const response: SurveyResponse = {
            id: `RES-${Date.now()}`,
            surveyId: survey.id,
            respondentId: respondentId || user.id,
            submittedAt: new Date(),
            answers: formattedAnswers,
            comments: comment
        };

        const submitToSupabase = async () => {
            const { error } = await supabase
                .from('pulse_survey_responses')
                .insert({
                    survey_id: survey.id,
                    respondent_id: response.respondentId,
                    submitted_at: response.submittedAt.toISOString(),
                    answers: response.answers,
                    comments: response.comments,
                });
            if (error) throw error;
        };

        submitToSupabase()
            .then(() => {
                setIsSubmitting(false);
                alert('Thank you for your feedback!');
                navigate('/dashboard');
            })
            .catch((err) => {
                console.error('Failed to submit pulse survey', err);
                mockSurveyResponses.push(response);
                setIsSubmitting(false);
                alert('Thank you for your feedback!');
                navigate('/dashboard');
            });
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6 pb-10">
            <Link to="/dashboard" className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                <ArrowLeftIcon />
                Back to Dashboard
            </Link>
            
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg shadow-lg p-8 text-white">
                <h1 className="text-3xl font-bold">{survey.title}</h1>
                <p className="mt-2 opacity-90 text-lg">{survey.description}</p>
                <div className="mt-4 flex items-center">
                     {survey.isAnonymous && (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-white/20 text-white backdrop-blur-sm">
                            🔒 Anonymous Response
                        </span>
                     )}
                </div>
            </div>

            {survey.sections.map((section) => (
                <Card key={section.id} title={section.title}>
                    {section.description && <p className="text-gray-500 mb-4 -mt-2">{section.description}</p>}
                    <div className="space-y-8">
                        {section.questions.map((q) => (
                            <div key={q.id} className="border-b border-gray-100 dark:border-gray-700 pb-6 last:border-0 last:pb-0">
                                <p className="text-lg font-medium text-gray-900 dark:text-white mb-4">{q.text}</p>
                                {q.type === 'rating' ? (
                                    <div className="flex justify-between items-center max-w-md mx-auto md:mx-0">
                                        {[1, 2, 3, 4, 5].map((rating) => {
                                            const isSelected = answers[q.id] === rating;
                                            let colorClass = 'bg-gray-100 text-gray-500 hover:bg-gray-200';
                                            if (isSelected) {
                                                if (rating <= 2) colorClass = 'bg-red-500 text-white ring-2 ring-red-300';
                                                else if (rating === 3) colorClass = 'bg-yellow-500 text-white ring-2 ring-yellow-300';
                                                else colorClass = 'bg-green-500 text-white ring-2 ring-green-300';
                                            }
                                            
                                            return (
                                                <button
                                                    key={rating}
                                                    type="button"
                                                    onClick={() => handleRatingChange(q.id, rating)}
                                                    className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg transition-all duration-200 ${colorClass}`}
                                                >
                                                    {rating}
                                                </button>
                                            );
                                        })}
                                        <div className="hidden md:flex text-xs text-gray-400 ml-4 flex-col justify-center">
                                            <span>1 - Strongly Disagree</span>
                                            <span>5 - Strongly Agree</span>
                                        </div>
                                    </div>
                                ) : (
                                    <Textarea
                                        label="Your Answer"
                                        value={String(answers[q.id] || '')}
                                        onChange={(e) => handleTextChange(q.id, e.target.value)}
                                        rows={3}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </Card>
            ))}

            <Card>
                 <Textarea 
                    label="Additional Comments (Optional)" 
                    value={comment} 
                    onChange={e => setComment(e.target.value)}
                    rows={3}
                    placeholder="Any other feedback you'd like to share?"
                />
            </Card>

            <div className="flex justify-end gap-4">
                <Button variant="secondary" onClick={() => navigate('/dashboard')}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={isSubmitDisabled()} isLoading={isSubmitting} size="lg">
                    Submit Survey
                </Button>
            </div>
        </div>
    );
};

export default TakePulseSurvey;
