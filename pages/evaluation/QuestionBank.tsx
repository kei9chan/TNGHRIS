import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import { QuestionSet, EvaluationQuestion, Permission } from '../../types';
import Button from '../../components/ui/Button';
import { usePermissions } from '../../hooks/usePermissions';
import SectionModal from '../../components/evaluation/SectionModal';
import { supabase } from '../../services/supabaseClient';


const QuestionBank: React.FC = () => {
  const { can } = usePermissions();
  const canManage = can('Evaluation', Permission.Manage);
  const canView = can('Evaluation', Permission.View);

  const [questionSets, setQuestionSets] = useState<QuestionSet[]>([]);
  const [questions, setQuestions] = useState<EvaluationQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [isSetModalOpen, setSetModalOpen] = useState(false);
  const [selectedSet, setSelectedSet] = useState<QuestionSet | null>(null);

  const loadData = async () => {
    setError(null);
    const [{ data: setsData, error: setsErr }, { data: qData, error: qErr }] = await Promise.all([
      supabase.from('evaluation_question_sets').select('*').order('name'),
      supabase.from('evaluation_questions').select('*'),
    ]);
    if (setsErr || qErr) {
      setError(setsErr?.message || qErr?.message || 'Failed to load question bank.');
      setQuestionSets([]);
      setQuestions([]);
      return;
    }
    setQuestionSets((setsData || []).map((s:any)=>({ id:s.id, name:s.name, description:s.description || '' })));
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
  }, []);

  const filteredSets = useMemo(() => {
    return questionSets;
  }, [questionSets]);

  const handleOpenSetModal = (set: QuestionSet | null) => {
    setSelectedSet(set);
    setSetModalOpen(true);
  };

  const handleSaveSet = async (setToSave: QuestionSet) => {
    setError(null);
    if (setToSave.id) {
      const { error: err } = await supabase.from('evaluation_question_sets').update({
        name: setToSave.name,
        description: setToSave.description || null,
      }).eq('id', setToSave.id);
      if (err) { setError(err.message); return; }
    } else {
      const { error: err } = await supabase.from('evaluation_question_sets').insert({
        name: setToSave.name,
        description: setToSave.description || null,
      });
      if (err) { setError(err.message); return; }
    }
    setSetModalOpen(false);
    setSelectedSet(null);
    await loadData();
  };

  const handleDelete = async (setId: string) => {
    if (window.confirm('Are you sure you want to delete this question set? This will also delete all questions within it.')) {
        const { error: err } = await supabase.from('evaluation_question_sets').delete().eq('id', setId);
        if (err) { setError(err.message); return; }
        await loadData();
    }
  };


  return (
    <div className="space-y-6">
      {!canView && (
        <Card>
          <div className="p-6 text-center text-gray-600 dark:text-gray-300">
            You do not have permission to view the Question Bank.
          </div>
        </Card>
      )}
      {canView && (
      <>
      <div className="flex justify-between items-start">
        <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Question Bank</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Build and manage reusable question sets for different evaluation types — from teamwork to leadership and core competencies.</p>
        </div>
        {canManage && (
            <Button onClick={() => handleOpenSetModal(null)}>Add New Set</Button>
        )}
      </div>
      {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSets.map(set => {
          const questionCount = questions.filter(q => q.questionSetId === set.id && !q.isArchived).length;
          return (
            <Card key={set.id} className="h-full hover:shadow-lg hover:ring-2 hover:ring-indigo-500 transition-all duration-200 flex flex-col !p-0">
                <Link to={`/evaluation/question-bank/${set.id}`} className="block hover:no-underline flex-grow p-6">
                    <div className="flex-grow">
                        <h3 className="font-bold text-lg text-gray-900 dark:text-white">{set.name}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex-grow">{set.description}</p>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 pt-2 border-t dark:border-gray-700">{questionCount} active questions</p>
                </Link>
                {canManage && (
                    <div className="bg-gray-50 dark:bg-slate-800/50 p-3 border-t dark:border-slate-700 flex justify-end">
                        <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDelete(set.id); }}>
                            Delete
                        </Button>
                    </div>
                )}
            </Card>
          )
        })}
         {filteredSets.length === 0 && (
             <Card className="md:col-span-2 lg:col-span-3">
                <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                    <p>No question sets found for this business unit.</p>
                    {canManage && <Button className="mt-4" onClick={() => handleOpenSetModal(null)}>Create the First Set</Button>}
                </div>
            </Card>
         )}
      </div>

      <SectionModal
        isOpen={isSetModalOpen}
        onClose={() => setSetModalOpen(false)}
        section={selectedSet}
        onSave={handleSaveSet}
      />
      </>
      )}
    </div>
  );
};

export default QuestionBank;
