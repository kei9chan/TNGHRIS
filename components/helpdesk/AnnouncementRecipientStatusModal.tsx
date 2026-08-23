import React, { useEffect, useMemo, useState } from 'react';
import { Announcement, AnnouncementRecipientStatus, AnnouncementType } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { fetchAnnouncementRecipients, sendAnnouncementReminders } from '../../services/announcementService';

interface Props {
  announcement: Announcement;
  onClose: () => void;
}

type RecipientState = 'Not Notified' | 'Not Read' | 'Read' | 'Read — Awaiting Acknowledgement' | 'Acknowledged' | 'Overdue';

const AnnouncementRecipientStatusModal: React.FC<Props> = ({ announcement, onClose }) => {
  const [recipients, setRecipients] = useState<AnnouncementRecipientStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [businessUnit, setBusinessUnit] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setRecipients(await fetchAnnouncementRecipients(announcement.id));
    } catch (error: any) {
      alert(error?.message || 'Failed to load recipient status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [announcement.id]);

  const getState = (recipient: AnnouncementRecipientStatus): RecipientState => {
    if (!recipient.notifiedAt) return 'Not Notified';
    if (recipient.acknowledgedAt) return 'Acknowledged';
    const policyDueAt = new Date(announcement.createdAt).getTime() + 3 * 24 * 60 * 60 * 1000;
    if (announcement.type === AnnouncementType.Policy && Date.now() > policyDueAt) return 'Overdue';
    if (!recipient.readAt) return 'Not Read';
    if (announcement.type === AnnouncementType.Policy) return 'Read — Awaiting Acknowledgement';
    return 'Read';
  };

  const filtered = useMemo(() => recipients.filter(recipient => {
    const term = search.toLowerCase();
    return (!term || recipient.employeeName.toLowerCase().includes(term))
      && (!businessUnit || recipient.businessUnit === businessUnit)
      && (!department || recipient.department === department)
      && (!status || getState(recipient) === status);
  }), [recipients, search, businessUnit, department, status, announcement]);

  const counts = useMemo(() => ({
    total: recipients.length,
    notified: recipients.filter(item => item.notifiedAt).length,
    read: recipients.filter(item => item.readAt).length,
    acknowledged: recipients.filter(item => item.acknowledgedAt).length,
    unread: recipients.filter(item => !item.readAt).length,
    awaiting: recipients.filter(item => item.readAt && !item.acknowledgedAt).length,
    overdue: recipients.filter(item => getState(item) === 'Overdue').length,
  }), [recipients, announcement]);

  const send = async (mode: 'unread' | 'unacknowledged' | 'outstanding' | 'selected') => {
    if (mode === 'selected' && selectedIds.length === 0) {
      alert('Select at least one employee.');
      return;
    }
    setSending(true);
    try {
      const count = await sendAnnouncementReminders(announcement.id, mode, mode === 'selected' ? selectedIds : undefined);
      alert(`${count} reminder${count === 1 ? '' : 's'} sent.`);
      setSelectedIds([]);
      await load();
    } catch (error: any) {
      alert(error?.message || 'Failed to send reminders.');
    } finally {
      setSending(false);
    }
  };

  const businessUnits = [...new Set(recipients.map(item => item.businessUnit).filter(Boolean))] as string[];
  const departments = [...new Set(recipients.map(item => item.department).filter(Boolean))] as string[];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Recipient Status — ${announcement.title}`}
      size="4xl"
      footer={<div className="flex w-full justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {[
            ['Targeted', counts.total], ['Notified', counts.notified], ['Read', counts.read],
            ['Acknowledged', counts.acknowledged], ['Unread', counts.unread],
            ['Awaiting Ack', counts.awaiting], ['Overdue', counts.overdue],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg bg-gray-50 p-3 text-center dark:bg-slate-800">
              <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={sending} onClick={() => send('outstanding')}>Remind All Outstanding</Button>
          <Button size="sm" variant="secondary" disabled={sending} onClick={() => send('unread')}>Remind Unread</Button>
          {announcement.type === AnnouncementType.Policy && (
            <Button size="sm" variant="secondary" disabled={sending} onClick={() => send('unacknowledged')}>Remind Unacknowledged</Button>
          )}
          <Button size="sm" variant="secondary" disabled={sending || selectedIds.length === 0} onClick={() => send('selected')}>
            Remind Selected ({selectedIds.length})
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Input label="Search Employee" value={search} onChange={event => setSearch(event.target.value)} placeholder="Type a name…" />
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit
            <select value={businessUnit} onChange={event => setBusinessUnit(event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 p-2 dark:bg-gray-700">
              <option value="">All</option>{businessUnits.map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Department
            <select value={department} onChange={event => setDepartment(event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 p-2 dark:bg-gray-700">
              <option value="">All</option>{departments.map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Status
            <select value={status} onChange={event => setStatus(event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 p-2 dark:bg-gray-700">
              <option value="">All</option>
              {['Not Notified', 'Not Read', 'Read', 'Read — Awaiting Acknowledgement', 'Acknowledged', 'Overdue'].map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
        </div>

        <div className="max-h-[50vh] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
            <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800">
              <tr><th className="p-3">Select</th><th className="p-3">Employee</th><th className="p-3">BU / Department</th><th className="p-3">Status</th><th className="p-3">Read</th><th className="p-3">Acknowledged</th><th className="p-3">Reminders</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.map(recipient => (
                <tr key={recipient.id}>
                  <td className="p-3"><input type="checkbox" checked={selectedIds.includes(recipient.userId)} onChange={event => setSelectedIds(previous => event.target.checked ? [...previous, recipient.userId] : previous.filter(id => id !== recipient.userId))} /></td>
                  <td className="p-3 font-medium">{recipient.employeeName}</td>
                  <td className="p-3 text-gray-500">{recipient.businessUnit || '—'}<br />{recipient.department || '—'}</td>
                  <td className="p-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs dark:bg-gray-700">{getState(recipient)}</span></td>
                  <td className="p-3 text-gray-500">{recipient.readAt ? recipient.readAt.toLocaleString() : '—'}</td>
                  <td className="p-3 text-gray-500">{recipient.acknowledgedAt ? recipient.acknowledgedAt.toLocaleString() : '—'}</td>
                  <td className="p-3 text-gray-500">{recipient.reminderCount}{recipient.lastReminderAt ? <><br /><span className="text-xs">{recipient.lastReminderAt.toLocaleString()}</span></> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && <p className="p-8 text-center text-gray-500">No recipients match the filters.</p>}
          {loading && <p className="p-8 text-center text-gray-500">Loading recipient status…</p>}
        </div>
      </div>
    </Modal>
  );
};

export default AnnouncementRecipientStatusModal;
