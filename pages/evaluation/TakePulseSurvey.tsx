import PulseQuestionInput from '../../components/evaluation/PulseQuestionInput';
import { mapPulseQuestion, PulseAnswer, validateAnswer } from '../../services/pulseQuestionRules';

import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
    
    const [answers, setAnswers] = useState<Record<string, PulseAnswer>>({});
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
                            container.questions.push(mapPulseQuestion(q));
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

                if (active) {
                    setSurvey(null);
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
                if (!active) return;
                // If Supabase query failed, allow the user to still submit (don't block on network error)
                console.error('Could not verify prior submission:', err);
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

    const isSubmitDisabled = () => survey.sections.some(s => s.questions.some(q => Boolean(validateAnswer(q, answers[q.id]))));

    const handleSubmit = () => {
        if (isSubmitting || isSubmitDisabled()) return;
        setIsSubmitting(true);
        
        const formattedAnswers = Object.entries(answers).map(([qId, val]) => ({
            questionId: qId,
            value: val as PulseAnswer
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
                setIsSubmitting(false);
                alert('Submission failed. Please try again.');
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
                                <PulseQuestionInput question={q} value={answers[q.id]} onChange={value => setAnswers(prev => ({...prev,[q.id]:value}))} />
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
