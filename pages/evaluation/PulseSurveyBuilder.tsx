
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { PulseSurveyStatus, SurveySection, PulseSurveyQuestion, Permission } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../services/supabaseClient';

const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;


const PulseSurveyBuilder: React.FC = () => {
    const { surveyId } = useParams<{ surveyId: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { can } = usePermissions();
    const canManage = can('PulseSurvey', Permission.Manage);

    const [survey, setSurvey] = useState<{
        id?: string;
        title?: string;
        description?: string;
        startDate?: Date;
        endDate?: Date;
        status?: PulseSurveyStatus;
        isAnonymous?: boolean;
        sections?: SurveySection[];
    }>({
        title: '',
        description: '',
        startDate: new Date(),
        status: PulseSurveyStatus.Draft,
        isAnonymous: true,
        sections: []
    });
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    if (!canManage) {
        return (
            <div className="max-w-3xl mx-auto space-y-4">
                <Card>
                    <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                        You do not have permission to manage pulse surveys.
                    </div>
                </Card>
                <div className="text-center">
                    <Link to="/evaluation/pulse">
                        <Button variant="secondary">Back to Pulse Surveys</Button>
                    </Link>
                </div>
            </div>
        );
    }

    useEffect(() => {
        const loadExisting = async () => {
            if (!surveyId) return;
            setLoading(true);
            setError(null);
            const { data: surveyData, error: surveyErr } = await supabase.from('pulse_surveys').select('*').eq('id', surveyId).single();
            if (surveyErr || !surveyData) {
                setError(surveyErr?.message || 'Survey not found.');
                setLoading(false);
                return;
            }
            const { data: sectionRows, error: secErr } = await supabase.from('pulse_survey_sections').select('*').eq('survey_id', surveyId).order('sort_order');
            const sectionIds = (sectionRows || []).map((s: any) => s.id);
            const { data: questionRows, error: qErr } = sectionIds.length > 0
                ? await supabase.from('pulse_survey_questions').select('*').in('section_id', sectionIds).order('sort_order')
                : { data: [], error: null };
            if (secErr || qErr) {
                setError(secErr?.message || qErr?.message || 'Failed to load survey.');
                setLoading(false);
                return;
            }
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
            setSurvey({
                id: surveyData.id,
                title: surveyData.title,
                description: surveyData.description || '',
                startDate: surveyData.start_date ? new Date(surveyData.start_date) : undefined,
                endDate: surveyData.end_date ? new Date(surveyData.end_date) : undefined,
                status: surveyData.status || PulseSurveyStatus.Draft,
                isAnonymous: !!surveyData.is_anonymous,
                sections: Object.values(sectionMap),
            });
            setLoading(false);
        };
        loadExisting();
    }, [surveyId, navigate]);

    const handleSurveyChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
             setSurvey(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
        } else {
             setSurvey(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleDateChange = (name: string, value: string) => {
        setSurvey(prev => ({ ...prev, [name]: new Date(value) }));
    };

    // Section Handlers
    const addSection = () => {
        const newSection: SurveySection = {
            id: `sec-${Date.now()}`,
            title: 'New Section',
            description: '',
            questions: []
        };
        setSurvey(prev => ({ ...prev, sections: [...(prev.sections || []), newSection] }));
    };

    const removeSection = (sectionId: string) => {
        if (window.confirm("Delete this section and all its questions?")) {
            setSurvey(prev => ({ ...prev, sections: prev.sections?.filter(s => s.id !== sectionId) }));
        }
    };

    const updateSection = (sectionId: string, field: keyof SurveySection, value: string) => {
        setSurvey(prev => ({
            ...prev,
            sections: prev.sections?.map(s => s.id === sectionId ? { ...s, [field]: value } : s)
        }));
    };

    // Question Handlers
    const addQuestion = (sectionId: string) => {
        const newQuestion: PulseSurveyQuestion = {
            id: `q-${Date.now()}`,
            text: '',
            type: 'rating'
        };
        setSurvey(prev => ({
            ...prev,
            sections: prev.sections?.map(s => {
                if (s.id === sectionId) {
                    return { ...s, questions: [...s.questions, newQuestion] };
                }
                return s;
            })
        }));
    };

    const removeQuestion = (sectionId: string, questionId: string) => {
         setSurvey(prev => ({
            ...prev,
            sections: prev.sections?.map(s => {
                if (s.id === sectionId) {
                    return { ...s, questions: s.questions.filter(q => q.id !== questionId) };
                }
                return s;
            })
        }));
    };

    const updateQuestion = (sectionId: string, questionId: string, field: keyof PulseSurveyQuestion, value: string) => {
        setSurvey(prev => ({
            ...prev,
            sections: prev.sections?.map(s => {
                if (s.id === sectionId) {
                    return {
                        ...s,
                        questions: s.questions.map(q => q.id === questionId ? { ...q, [field]: value } : q)
                    };
                }
                return s;
            })
        }));
    };

    const handleSave = async () => {
        if (!survey.title || !survey.sections || survey.sections.length === 0) {
            alert("Title and at least one section are required.");
            return;
        }
        setLoading(true);
        setError(null);
        
        // Insert/update survey
        const surveyPayload = {
            title: survey.title,
            description: survey.description || '',
            start_date: survey.startDate ? survey.startDate.toISOString().split('T')[0] : null,
            end_date: survey.endDate ? survey.endDate.toISOString().split('T')[0] : null,
            status: survey.status || PulseSurveyStatus.Draft,
            is_anonymous: survey.isAnonymous ?? true,
            created_by_user_id: user?.id || null,
        };

        let surveyRecordId = surveyId || survey.id;

        if (surveyRecordId) {
            const { error: updateErr } = await supabase.from('pulse_surveys').update(surveyPayload).eq('id', surveyRecordId);
            if (updateErr) {
                setError(updateErr.message);
                setLoading(false);
                return;
            }
            // Replace sections/questions to keep it simple
            await supabase.from('pulse_survey_sections').delete().eq('survey_id', surveyRecordId);
        } else {
            const { data, error: insertErr } = await supabase.from('pulse_surveys').insert(surveyPayload).select('id').single();
            if (insertErr || !data) {
                setError(insertErr?.message || 'Failed to create survey.');
                setLoading(false);
                return;
            }
            surveyRecordId = data.id;
        }

        // Re-insert sections and questions letting Supabase generate UUIDs
        const sectionPayloads = (survey.sections || []).map((s, idx) => ({
            survey_id: surveyRecordId,
            title: s.title || 'Untitled Section',
            description: s.description || '',
            sort_order: idx,
        }));

        if (sectionPayloads.length > 0) {
            const { data: insertedSections, error: secErr } = await supabase
                .from('pulse_survey_sections')
                .insert(sectionPayloads)
                .select('id, sort_order');
            if (secErr) {
                setError(secErr.message);
                setLoading(false);
                return;
            }
            const sectionIdByOrder: Record<number, string> = {};
            (insertedSections || []).forEach((row: any) => {
                sectionIdByOrder[row.sort_order] = row.id;
            });

            const questionPayloads: any[] = [];
            (survey.sections || []).forEach((section, idx) => {
                const sectionId = sectionIdByOrder[idx];
                if (!sectionId) return;
                (section.questions || []).forEach((q, qIdx) => {
                    questionPayloads.push({
                        section_id: sectionId,
                        text: q.text,
                        question_type: q.type,
                        sort_order: qIdx,
                    });
                });
            });

            if (questionPayloads.length > 0) {
                const { error: qErr } = await supabase.from('pulse_survey_questions').insert(questionPayloads);
                if (qErr) {
                    setError(qErr.message);
                    setLoading(false);
                    return;
                }
            }
        }

        setLoading(false);
        navigate('/evaluation/pulse');
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
             <div>
                <Link to="/evaluation/pulse" className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-2">
                    <ArrowLeftIcon />
                    Back to List
                </Link>
                <div className="flex justify-between items-center">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{surveyId ? 'Edit Survey' : 'Create Engagement Survey'}</h1>
                    <div className="flex space-x-2">
                        <Button variant="secondary" onClick={() => navigate('/evaluation/pulse')}>Cancel</Button>
                        <Button onClick={handleSave} disabled={!canManage || loading}>
                            {loading ? 'Saving...' : 'Save Survey'}
                        </Button>
                    </div>
                </div>
            </div>

            {!canManage && (
                <Card>
                    <div className="p-4 text-sm text-gray-600 dark:text-gray-300">
                        You do not have permission to manage pulse surveys.
                    </div>
                </Card>
            )}
            {error && (
                <Card>
                    <div className="p-4 text-sm text-red-600 dark:text-red-400">{error}</div>
                </Card>
            )}

            <Card title="Survey Settings">
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input label="Survey Title" name="title" value={survey.title || ''} onChange={handleSurveyChange} required />
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                            <select name="status" value={survey.status} onChange={handleSurveyChange} className="mt-1 block w-full pl-3 pr-10 py-2 border-gray-300 rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                {Object.values(PulseSurveyStatus).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>
                    <Textarea label="Description / Welcome Message" name="description" value={survey.description || ''} onChange={handleSurveyChange} rows={3} />
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Input 
                            label="Start Date" 
                            type="date" 
                            value={survey.startDate ? new Date(survey.startDate).toISOString().split('T')[0] : ''} 
                            onChange={(e) => handleDateChange('startDate', e.target.value)} 
                        />
                        <Input 
                            label="End Date" 
                            type="date" 
                            value={survey.endDate ? new Date(survey.endDate).toISOString().split('T')[0] : ''} 
                            onChange={(e) => handleDateChange('endDate', e.target.value)} 
                        />
                        <div className="flex items-center h-full pt-6">
                             <input id="isAnonymous" name="isAnonymous" type="checkbox" checked={survey.isAnonymous || false} onChange={handleSurveyChange} className="h-4 w-4 text-indigo-600 border-gray-300 rounded" />
                             <label htmlFor="isAnonymous" className="ml-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Anonymous Responses</label>
                        </div>
                    </div>
                </div>
            </Card>

            <div className="space-y-6">
                <div className="flex justify-between items-center">
                     <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">Questionnaire Builder</h2>
                     <Button variant="secondary" onClick={addSection}><PlusIcon /> Add Section</Button>
                </div>
                
                {survey.sections?.map((section, sectionIndex) => (
                    <div key={section.id} className="border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
                        <div className="bg-gray-100 dark:bg-slate-700 p-4 flex justify-between items-start border-b dark:border-gray-600">
                            <div className="flex-grow space-y-2 mr-4">
                                <Input 
                                    label="" 
                                    value={section.title} 
                                    onChange={(e) => updateSection(section.id, 'title', e.target.value)} 
                                    className="font-bold text-lg"
                                    placeholder="Section Title (e.g., Leadership)"
                                />
                                <input 
                                    type="text" 
                                    value={section.description || ''} 
                                    onChange={(e) => updateSection(section.id, 'description', e.target.value)}
                                    className="w-full bg-transparent text-sm text-gray-600 dark:text-gray-400 border-none focus:ring-0 p-0"
                                    placeholder="Add optional section description..."
                                />
                            </div>
                            <button onClick={() => removeSection(section.id)} className="text-red-500 hover:text-red-700 p-1"><TrashIcon /></button>
                        </div>
                        
                        <div className="p-4 space-y-3">
                            {section.questions.map((question, qIndex) => (
                                <div key={question.id} className="flex items-center gap-3">
                                    <div className="flex-grow">
                                        <Input 
                                            label="" 
                                            value={question.text} 
                                            onChange={(e) => updateQuestion(section.id, question.id, 'text', e.target.value)} 
                                            placeholder={`Question ${qIndex + 1}`}
                                        />
                                    </div>
                                    <div className="w-40">
                                        <select 
                                            value={question.type} 
                                            onChange={(e) => updateQuestion(section.id, question.id, 'type', e.target.value as any)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-slate-700 dark:border-gray-600 dark:text-white text-sm"
                                        >
                                            <option value="rating">Rating (1-5)</option>
                                            <option value="text">Free Text</option>
                                        </select>
                                    </div>
                                    <button onClick={() => removeQuestion(section.id, question.id)} className="text-gray-400 hover:text-red-500 p-2"><TrashIcon /></button>
                                </div>
                            ))}
                            <div className="pt-2">
                                <button onClick={() => addQuestion(section.id)} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline flex items-center font-medium">
                                    <PlusIcon /> Add Question
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
                
                {survey.sections?.length === 0 && (
                    <div className="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
                        <p className="text-gray-500 dark:text-gray-400">Start by adding a section to group your questions.</p>
                        <Button className="mt-4" variant="secondary" onClick={addSection}>Add First Section</Button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PulseSurveyBuilder;
