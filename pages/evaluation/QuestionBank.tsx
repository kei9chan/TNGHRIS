import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import { mockQuestionSets, mockEvaluationQuestions } from '../../services/mockData';
import { QuestionSet, EvaluationQuestion } from '../../types';
import Button from '../../components/ui/Button';
import { usePermissions } from '../../hooks/usePermissions';
import { Permission } from '../../types';
import SectionModal from '../../components/evaluation/SectionModal';


const QuestionBank: React.FC = () => {
  const { can } = usePermissions();
  const canManage = can('Evaluation', Permission.Manage);

  const [questionSets, setQuestionSets] = useState<QuestionSet[]>(mockQuestionSets);
  const [questions, setQuestions] = useState<EvaluationQuestion[]>(mockEvaluationQuestions);

  const [isSetModalOpen, setSetModalOpen] = useState(false);
  const [selectedSet, setSelectedSet] = useState<QuestionSet | null>(null);

  const filteredSets = useMemo(() => {
    return questionSets;
  }, [questionSets]);

  const handleOpenSetModal = (set: QuestionSet | null) => {
    setSelectedSet(set);
    setSetModalOpen(true);
  };

  const handleSaveSet = (setToSave: QuestionSet) => {
    if (setToSave.id) {
      setQuestionSets(prev => prev.map(s => s.id === setToSave.id ? setToSave : s));
      const setIndex = mockQuestionSets.findIndex(s => s.id === setToSave.id);
      if (setIndex > -1) {
          mockQuestionSets[setIndex] = setToSave;
      }
    } else {
      const newSet: QuestionSet = { 
        ...setToSave, 
        id: `set-${Date.now()}`, 
      };
      setQuestionSets(prev => [...prev, newSet]);
      mockQuestionSets.push(newSet);
    }
    setSetModalOpen(false);
  };

  const handleDelete = (setId: string) => {
    if (window.confirm('Are you sure you want to delete this question set? This will also delete all questions within it.')) {
        // Update local state
        setQuestionSets(prev => prev.filter(s => s.id !== setId));
        setQuestions(prev => prev.filter(q => q.questionSetId !== setId));
        
        // Update mock data source for Question Sets
        const setIndex = mockQuestionSets.findIndex(s => s.id === setId);
        if (setIndex > -1) {
            mockQuestionSets.splice(setIndex, 1);
        }

        // Update mock data source for Questions
        const updatedMockQuestions = mockEvaluationQuestions.filter(q => q.questionSetId !== setId);
        mockEvaluationQuestions.length = 0; // Clear the array
        mockEvaluationQuestions.push(...updatedMockQuestions); // Push the filtered items back
    }
  };


  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Question Bank</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Build and manage reusable question sets for different evaluation types — from teamwork to leadership and core competencies.</p>
        </div>
        {canManage && (
            <Button onClick={() => handleOpenSetModal(null)}>Add New Set</Button>
        )}
      </div>
      
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
    </div>
  );
};

export default QuestionBank;