import React, { useEffect, useMemo, useState } from 'react';
import { Application, Candidate } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import { supabase } from '../../services/supabaseClient';

interface RejectionEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  application: Application | null;
  candidate?: Candidate | null;
  jobTitle?: string | null;
  businessUnitName?: string | null;
  onSend: (payload: { subject: string; message: string }) => Promise<void>;
}

const RejectionEmailModal: React.FC<RejectionEmailModalProps> = ({
  isOpen,
  onClose,
  application,
  candidate,
  jobTitle,
  businessUnitName,
  onSend,
}) => {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');

  const firstName = candidate?.firstName || 'Applicant';
  const resolvedJobTitle = jobTitle || application?.roleTitleSnapshot || 'the position';
  const resolvedBusinessUnit = businessUnitName || 'TNG HRIS';
  const recipientLabel = useMemo(
    () => (candidate ? `${candidate.firstName} ${candidate.lastName}`.trim() : 'Applicant'),
    [candidate],
  );

  useEffect(() => {
    if (!isOpen || !application || !candidate) return;

    setSubject('Update on Your Application');
    setMessage(`Dear ${firstName},

Thank you very much for taking the time to apply for the ${resolvedJobTitle} position with ${resolvedBusinessUnit}. We appreciate your interest in joining our team.

After carefully reviewing your application, we have decided to move forward with other candidates whose backgrounds more closely match our current needs for this role.

We truly appreciate the time and effort you put into your application, and we encourage you to apply again for future opportunities that may be a better fit.

We wish you all the best in your career journey.

Sincerely,
${resolvedBusinessUnit} / TNG Recruitment Team`);
    setError('');
  }, [application, candidate, firstName, isOpen, resolvedBusinessUnit, resolvedJobTitle]);

  const handleSend = async () => {
    if (!application || !candidate?.email) {
      setError('The applicant email address is missing.');
      return;
    }
    if (!subject.trim() || !message.trim()) {
      setError('Add a subject and message before sending.');
      return;
    }

    setIsSending(true);
    setError('');
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session?.access_token) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const response = await fetch('/api/recruitment-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session.access_token}`,
        },
        body: JSON.stringify({
          to: candidate.email,
          subject: subject.trim(),
          message: message.trim(),
          category: 'rejection',
        }),
      });

      if (!response.ok) {
        const responseBody = await response.json().catch(() => ({}));
        throw new Error(responseBody?.error || 'Failed to send rejection email.');
      }

      await onSend({ subject: subject.trim(), message: message.trim() });
    } catch (sendError: any) {
      setError(sendError?.message || 'Failed to send rejection email.');
    } finally {
      setIsSending(false);
    }
  };

  if (!application || !candidate) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Send Rejection Email"
      size="xl"
      footer={(
        <div className="flex w-full justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isSending}>Cancel</Button>
          <Button variant="danger" onClick={handleSend} disabled={isSending}>
            {isSending ? 'Sending...' : 'Send Email'}
          </Button>
        </div>
      )}
    >
      <div className="space-y-4">
        {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200" role="alert">{error}</div>}
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          Review the message before sending. The application is marked Rejected only after this email is sent successfully.
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Applicant</p>
            <p className="font-semibold text-gray-900 dark:text-white">{recipientLabel}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{candidate.email}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Application</p>
            <p className="font-semibold text-gray-900 dark:text-white">{resolvedJobTitle}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{resolvedBusinessUnit}</p>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Subject</label>
          <Input label="" value={subject} onChange={(event) => setSubject(event.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Message</label>
          <Textarea label="" value={message} onChange={(event) => setMessage(event.target.value)} rows={14} />
        </div>
      </div>
    </Modal>
  );
};

export default RejectionEmailModal;
