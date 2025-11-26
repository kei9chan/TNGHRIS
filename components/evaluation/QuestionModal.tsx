import React, { useState, useEffect } from 'react';
import { EvaluationQuestion } from '../../types';
import Modal from '../ui/Modal';
import Textarea from '../ui/Textarea';
import Input from '../ui/Input';
import Button from '../ui/Button';

interface QuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  question: EvaluationQuestion | null;
  onSave: (question: EvaluationQuestion) => void;
}

const QuestionModal: React.FC<QuestionModalProps> = ({ isOpen, onClose, question, onSave }) => {
  const [current, setCurrent] = useState<Partial<EvaluationQuestion>>(question || {});

  useEffect(() => {
    setCurrent(question || {
        title: '',
        description: '',
        questionType: 'rating',
    });
  }, [question, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCurrent(prev => ({
      ...prev,
      [name]: value
    }));
  };

   const handleTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setCurrent(prev => ({
          ...prev,
          questionType: e.target.value as 'rating' | 'paragraph'
      }));
  };

  const handleSave = () => {
    if (current.title?.trim()) {
      onSave(current as EvaluationQuestion);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={question ? 'Edit Question' : 'Add New Question'}
      footer={
        <div className="flex justify-end w-full space-x-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>{question ? 'Save Changes' : 'Add Question'}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input label="Question Title" id="title" name="title" value={current.title || ''} onChange={handleChange} required />
        <Textarea label="Description / Helper Text" id="description" name="description" value={current.description || ''} onChange={handleChange} rows={3} required />
        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Question Type</label>
            <div className="mt-2 flex space-x-4">
                <div className="flex items-center">
                    <input id="type-rating" name="questionType" type="radio" value="rating" checked={current.questionType === 'rating'} onChange={handleTypeChange} className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300"/>
                    <label htmlFor="type-rating" className="ml-3 block text-sm font-medium text-gray-700 dark:text-gray-300">Rating (1-5)</label>
                </div>
                <div className="flex items-center">
                    <input id="type-paragraph" name="questionType" type="radio" value="paragraph" checked={current.questionType === 'paragraph'} onChange={handleTypeChange} className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300"/>
                    <label htmlFor="type-paragraph" className="ml-3 block text-sm font-medium text-gray-700 dark:text-gray-300">Paragraph Answer</label>
                </div>
            </div>
        </div>
      </div>
    </Modal>
  );
};

export default QuestionModal;