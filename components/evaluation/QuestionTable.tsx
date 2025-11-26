import React, { useState } from 'react';
import { EvaluationQuestion, Permission } from '../../types';
import Button from '../ui/Button';
import { usePermissions } from '../../hooks/usePermissions';

interface QuestionTableProps {
  questions: EvaluationQuestion[];
  onEdit: (question: EvaluationQuestion) => void;
  onArchive: (questionId: string) => void;
  onUnarchive: (questionId: string) => void;
}

const QuestionTable: React.FC<QuestionTableProps> = ({ questions, onEdit, onArchive, onUnarchive }) => {
  const { can } = usePermissions();
  const canManage = can('Evaluation', Permission.Manage);
  const [showArchived, setShowArchived] = useState(false);

  const visibleQuestions = showArchived ? questions : questions.filter(q => !q.isArchived);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="flex items-center">
          <input 
            type="checkbox" 
            id="show-archived" 
            checked={showArchived} 
            onChange={e => setShowArchived(e.target.checked)} 
            className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
          />
          <label htmlFor="show-archived" className="ml-2 text-sm text-gray-700 dark:text-gray-300">Show Archived</label>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-1/2">Question</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tags</th>
              {canManage && <th scope="col" className="relative px-4 py-3"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {visibleQuestions.map(q => (
              <tr key={q.id} className={q.isArchived ? 'bg-gray-100 dark:bg-gray-800/50 opacity-60' : ''}>
                <td className="px-4 py-4 whitespace-normal text-sm text-gray-700 dark:text-gray-300">{q.title}</td>
                <td className="px-4 py-4 whitespace-normal text-sm">
                  <div className="flex flex-wrap gap-1">
                    {q.targetEmployeeLevels.map(level => (
                      <span key={level} className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/70 dark:text-blue-200">{level}</span>
                    ))}
                    {q.targetEvaluatorRoles.map(role => (
                      <span key={role} className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/70 dark:text-green-200">{role}</span>
                    ))}
                  </div>
                </td>
                {canManage && (
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center space-x-2">
                        {q.isArchived ? (
                             <Button variant="secondary" size="sm" onClick={() => onUnarchive(q.id)}>Unarchive</Button>
                        ) : (
                            <>
                                <Button variant="secondary" size="sm" onClick={() => onEdit(q)}>Edit</Button>
                                <Button variant="danger" size="sm" onClick={() => onArchive(q.id)}>Archive</Button>
                            </>
                        )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
             {visibleQuestions.length === 0 && (
                <tr>
                    <td colSpan={canManage ? 3 : 2} className="text-center py-6 text-gray-500 dark:text-gray-400">
                        No questions in this section.
                    </td>
                </tr>
             )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default QuestionTable;
