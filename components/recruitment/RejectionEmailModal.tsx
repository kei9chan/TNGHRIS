import React, { useEffect, useState } from 'react';
import { Application, Candidate } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';

export interface RejectionEmailDraft {
  subject: string;
  message: string;
  rejectionReason: string;
}

interface RejectionEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  application: Application | null;
  candidate?: Candidate | null;
  jobTitle?: string | null;
  businessUnitName?: string | null;
  onSend: (draft: RejectionEmailDraft) => Promise<void> | void;
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
  const [rejectionReason, setRejectionReason] = useState('Current role fit');
  const [isSending, setIsSending] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen || !candidate) return;
    const position = jobTitle || 'the position';
    const businessUnit = businessUnitName || 'TNG';
    setSubject('Update on Your Application');
    setMessage(`Dear ${candidate.firstName},

Thank you very much for taking the time to apply for the ${position} position with ${businessUnit}. We appreciate your interest in joining our team.

After carefully reviewing your application, we have decided to move forward with other candidates whose backgrounds more closely match our current needs for this role.

We truly appreciate the time and effort you put into your application, and we encourage you to apply again for future opportunities that may be a better fit.

We wish you all the best in your career journey.

Sincerely,
${businessUnit} / TNG Recruitment Team`);
    setRejectionReason('Current role fit');
    setFormError('');
  }, [businessUnitName, candidate, isOpen, jobTitle]);

  const handleSend = async () => {
    setFormError('');
    if (!candidate?.email) return setFormError('The applicant does not have an email address.');
    if (!subject.trim() || !message.trim()) return setFormError('Subject and email message are required.');

    setIsSending(true);
    try {
      await onSend({ subject: subject.trim(), message: message.trim(), rejectionReason: rejectionReason.trim() || 'Current role fit' });
    } catch (error: any) {
      setFormError(error?.message || 'The rejection email could not be sent.');
    } finally {
      setIsSending(false);
    }
  };

  if (!application || !candidate) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Reject Application: ${candidate.firstName} ${candidate.lastName}`}
      size="2xl"
      footer={(
        <div className="flex w-full justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isSending}>Cancel</Button>
          <Button variant="danger" onClick={handleSend} disabled={isSending}>
            {isSending ? 'Sending…' : 'Send Email & Reject'}
          </Button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Nothing has been sent yet.</p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">Review and edit the message. The application is marked Rejected only after you click “Send Email & Reject” and the email sends successfully.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900/40 sm:grid-cols-2">
          <div><span className="block text-xs text-gray-500">Applicant</span><span className="font-medium">{candidate.firstName} {candidate.lastName}</span></div>
          <div><span className="block text-xs text-gray-500">Position</span><span className="font-medium">{jobTitle || 'Position unavailable'}</span></div>
          <div><span className="block text-xs text-gray-500">Business Unit</span><span className="font-medium">{businessUnitName || 'TNG'}</span></div>
          <div><span className="block text-xs text-gray-500">Email</span><span className="font-medium">{candidate.email}</span></div>
        </div>

        <Input label="Subject" value={subject} onChange={event => setSubject(event.target.value)} maxLength={200} />
        <Textarea label="Email Message" value={message} onChange={event => setMessage(event.target.value)} rows={13} />
        <Textarea
          label="Internal Rejection Reason (not included in the email)"
          value={rejectionReason}
          onChange={event => setRejectionReason(event.target.value)}
          rows={2}
          placeholder="Example: Current role fit"
        />

        {formError && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{formError}</div>}
      </div>
    </Modal>
  );
};

export default RejectionEmailModal;
