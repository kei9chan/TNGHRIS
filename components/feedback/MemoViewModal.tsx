import React from 'react';
import { Memo, User } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface MemoViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  memo: Memo | null;
  onAcknowledge?: (memoId: string) => void;
  user?: User | null;
}

const MemoViewModal: React.FC<MemoViewModalProps> = ({ isOpen, onClose, memo, onAcknowledge, user }) => {
  if (!memo) return null;

  const needsAcknowledgement = user && onAcknowledge && memo.acknowledgementRequired && !memo.acknowledgementTracker.includes(user.id);

  const footer = (
      <div className="flex justify-between items-center w-full">
          <div>
              {needsAcknowledgement && (
                  <Button onClick={() => onAcknowledge(memo.id)}>Acknowledge</Button>
              )}
          </div>
          <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={memo.title}
      footer={footer}
    >
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Effective Date</p>
          <p className="text-gray-900 dark:text-white">{new Date(memo.effectiveDate).toLocaleDateString()}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Target Audience</p>
          <p className="text-gray-900 dark:text-white">
            BUs: {memo.targetBusinessUnits.join(', ')} | Depts: {memo.targetDepartments.join(', ')}
          </p>
        </div>
        <div className="prose dark:prose-invert max-w-none mt-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-md border dark:border-gray-700">
            <div dangerouslySetInnerHTML={{ __html: memo.body }} />
        </div>
        <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Tags</p>
            <div className="flex flex-wrap gap-2 mt-1">
                {memo.tags.map(tag => (
                    <span key={tag} className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        {tag}
                    </span>
                ))}
            </div>
        </div>
      </div>
    </Modal>
  );
};

export default MemoViewModal;