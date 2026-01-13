import React, { useState, useMemo, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { QuestionSet, EvaluationQuestion } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import SectionModal from '../../components/evaluation/SectionModal';
import QuestionModal from '../../components/evaluation/QuestionModal';
import { supabase } from '../../services/supabaseClient';

const ArrowLeftIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>);
const EditIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>);
const TrashIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>);


const QuestionSetDetail: React.FC = () => {
    const { setId } = useParams<{ setId: string }>();
    const navigate = useNavigate();
    const [questionSet, setQuestionSet] = useState<QuestionSet | null>(null);
    const [questions, setQuestions] = useState<EvaluationQuestion[]>([]);
    const [error, setError] = useState<string | null>(null);

    const [isSetModalOpen, setSetModalOpen] = useState(false);
    const [isQuestionModalOpen, setQuestionModalOpen] = useState(false);
    const [selectedQuestion, setSelectedQuestion] = useState<EvaluationQuestion | null>(null);

    const loadData = async () => {
        if (!setId) return;
        setError(null);
        const [{ data: setData, error: setErr }, { data: qData, error: qErr }] = await Promise.all([
            supabase.from('evaluation_question_sets').select('*').eq('id', setId).maybeSingle(),
            supabase.from('evaluation_questions').select('*').eq('question_set_id', setId),
        ]);
        if (setErr || qErr) {
            setError(setErr?.message || qErr?.message || 'Failed to load question set.');
            setQuestionSet(null);
            setQuestions([]);
            return;
        }
        if (!setData) {
            setQuestionSet(null);
            setQuestions([]);
            return;
        }
        setQuestionSet({
            id: setData.id,
            name: setData.name,
            description: setData.description || '',
        });
        setQuestions((qData || []).map((q:any)=>({
            id: q.id,
            questionSetId: q.question_set_id,
            title: q.title,
            description: q.description || '',
            questionType: q.question_type,
            isArchived: q.is_archived || false,
            targetEmployeeLevels: q.target_employee_levels || [],
            targetEvaluatorRoles: q.target_evaluator_roles || [],
        } as EvaluationQuestion)));
    };

    useEffect(() => {
        loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setId]);

    const questionsInSet = useMemo(() => {
        return questions.filter(q => !q.isArchived);
    }, [questions]);

    if (!questionSet) {
        return (
            <div className="p-6">
                <Card>
                    <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                        Question set not found. <Link to="/evaluation/question-bank" className="text-indigo-600">Go back.</Link>
                    </div>
                </Card>
            </div>
        );
    }

    const handleSaveSet = async (setToSave: QuestionSet) => {
        if (!questionSet) return;
        const { error: err } = await supabase.from('evaluation_question_sets').update({
            name: setToSave.name,
            description: setToSave.description || null,
        }).eq('id', questionSet.id);
        if (err) {
            setError(err.message);
            return;
        }
        setSetModalOpen(false);
        await loadData();
    };

    const handleSaveQuestion = async (questionToSave: EvaluationQuestion) => {
        if (!questionSet) return;
        if (questionToSave.id) {
            const { error: err } = await supabase.from('evaluation_questions').update({
                title: questionToSave.title,
                description: questionToSave.description || null,
                question_type: questionToSave.questionType,
                is_archived: questionToSave.isArchived || false,
                target_employee_levels: questionToSave.targetEmployeeLevels || [],
                target_evaluator_roles: questionToSave.targetEvaluatorRoles || [],
            }).eq('id', questionToSave.id);
            if (err) { setError(err.message); return; }
        } else {
            const { error: err } = await supabase.from('evaluation_questions').insert({
                question_set_id: questionSet.id,
                title: questionToSave.title,
                description: questionToSave.description || null,
                question_type: questionToSave.questionType,
                is_archived: false,
                target_employee_levels: questionToSave.targetEmployeeLevels || [],
                target_evaluator_roles: questionToSave.targetEvaluatorRoles || [],
            });
            if (err) { setError(err.message); return; }
        }
        setQuestionModalOpen(false);
        setSelectedQuestion(null);
        await loadData();
    };
    
    const handleDeleteQuestion = async (questionId: string) => {
        if (window.confirm('Are you sure you want to delete this question? This cannot be undone.')) {
            const { error: err } = await supabase.from('evaluation_questions').delete().eq('id', questionId);
            if (err) { setError(err.message); return; }
            await loadData();
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-start">
                <div>
                    <Link to="/evaluation/question-bank" className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-2">
                        <ArrowLeftIcon />
                        Back to All Sets
                    </Link>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{questionSet.name}</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">{questionSet.description}</p>
                </div>
                <div className="flex space-x-2">
                    <Button variant="secondary" onClick={() => setSetModalOpen(true)}>Edit Set</Button>
                    <Button onClick={() => setQuestionModalOpen(true)}>Add Question</Button>
                </div>
            </div>

            <div className="space-y-4">
                {questionsInSet.map((q, index) => (
                    <Card key={q.id}>
                        <div className="flex justify-between items-start">
                             <div className="flex-grow">
                                <h3 className="text-lg font-bold text-indigo-700 dark:text-indigo-400">{index + 1}. {q.title}</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{q.description}</p>
                                <div className="mt-4 flex space-x-2">
                                    {[1,2,3,4,5].map(num => (
                                        <button key={num} className="h-10 w-10 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                            {num}
                                        </button>
                                    ))}
                                </div>
                             </div>
                             <div className="flex space-x-2">
                                <Button variant="secondary" size="sm" className="!p-2" onClick={() => setSelectedQuestion(q)}>
                                    <EditIcon />
                                </Button>
                                <Button variant="danger" size="sm" className="!p-2" onClick={() => handleDeleteQuestion(q.id)}>
                                    <TrashIcon />
                                </Button>
                             </div>
                        </div>
                    </Card>
                ))}
                {questionsInSet.length === 0 && (
                    <Card>
                        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                            <p>This question set is empty.</p>
                            <Button className="mt-4" onClick={() => setQuestionModalOpen(true)}>Add the First Question</Button>
                        </div>
                    </Card>
                )}
            </div>
            
            <SectionModal 
                isOpen={isSetModalOpen}
                onClose={() => setSetModalOpen(false)}
                section={questionSet}
                onSave={handleSaveSet}
            />

            <QuestionModal
                isOpen={isQuestionModalOpen || !!selectedQuestion}
                onClose={() => {
                    setQuestionModalOpen(false);
                    setSelectedQuestion(null);
                }}
                question={selectedQuestion}
                onSave={handleSaveQuestion}
            />
        </div>
    );
};

export default QuestionSetDetail;
