import React, { useState } from 'react';
import { Evaluation } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { extendEvaluationDeadline } from '../../services/evaluationService';
import { evaluationDeadlineDay, formatEvaluationDeadline } from '../../utils/evaluationDeadline';

interface Props {
  evaluation: Evaluation;
  onClose: () => void;
  onSaved: (dueDate: string) => void;
}

const ExtendEvaluationDeadlineModal: React.FC<Props> = ({ evaluation, onClose, onSaved }) => {
  const [dueDate, setDueDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentDay = evaluation.dueDate ? evaluationDeadlineDay(evaluation.dueDate) : '';
  const tomorrowAfterDeadline = currentDay
    ? new Date(new Date(`${currentDay}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10)
    : '';
  const minDate = [evaluationDeadlineDay(new Date()), tomorrowAfterDeadline].sort().at(-1);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      const confirmedDate = await extendEvaluationDeadline(evaluation, dueDate, reason);
      onSaved(confirmedDate);
    } catch (err: any) {
      setError(err?.message || 'Unable to extend the deadline. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={() => { if (!saving) onClose(); }} title="Extend evaluation deadline" size="lg">
      <form onSubmit={save} className="space-y-4">
        <p className="font-semibold text-gray-900 dark:text-white">{evaluation.name}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Current deadline: {evaluation.dueDate ? formatEvaluationDeadline(evaluation.dueDate) : 'None'}.
          {' '}This extends the deadline for this evaluation and its assigned evaluators. Saved responses are retained.
        </p>
        <div>
          <label htmlFor="evaluation-new-deadline" className="block text-sm font-medium text-gray-700 dark:text-gray-200">New deadline</label>
          <input id="evaluation-new-deadline" type="date" required min={minDate} value={dueDate}
            disabled={saving} onChange={event => setDueDate(event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 p-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white" />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Open until 11:59 PM Philippine time on this date, including after the original deadline has passed.</p>
        </div>
        <div>
          <label htmlFor="evaluation-extension-reason" className="block text-sm font-medium text-gray-700 dark:text-gray-200">Reason for extension</label>
          <textarea id="evaluation-extension-reason" required maxLength={1000} rows={3} value={reason}
            disabled={saving} onChange={event => setReason(event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 p-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white" />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">The date change, your name, and the reason are recorded in the audit log.</p>
        </div>
        {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || !dueDate || !reason.trim()}>{saving ? 'Saving…' : 'Save new deadline'}</Button>
        </div>
      </form>
    </Modal>
  );
};

export default ExtendEvaluationDeadlineModal;
