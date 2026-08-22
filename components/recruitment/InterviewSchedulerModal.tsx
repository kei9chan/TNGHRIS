import React, { useEffect, useMemo, useState } from 'react';
import { Interview, InterviewType, User, InterviewStatus } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { InterviewApplicantOption } from '../../services/recruitmentInterviewService';

interface InterviewSchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
  interview: Interview | null;
  onSave: (interview: Interview) => Promise<void>;
  candidateOptions: InterviewApplicantOption[];
  users: User[];
}

const inputClasses = 'mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white';

const InterviewSchedulerModal: React.FC<InterviewSchedulerModalProps> = ({
  isOpen,
  onClose,
  interview,
  onSave,
  candidateOptions,
  users,
}) => {
  const [current, setCurrent] = useState<Partial<Interview>>(interview || {});
  const [applicantSearch, setApplicantSearch] = useState('');
  const [applicantBusinessUnit, setApplicantBusinessUnit] = useState('');
  const [applicantStage, setApplicantStage] = useState('');
  const [applicantDepartment, setApplicantDepartment] = useState('');
  const [panelSearchTerm, setPanelSearchTerm] = useState('');
  const [panelDepartment, setPanelDepartment] = useState('');
  const [isApplicantListOpen, setIsApplicantListOpen] = useState(!interview?.applicationId);
  const [isPanelListOpen, setIsPanelListOpen] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const now = new Date();
    now.setSeconds(0, 0);
    now.setMinutes(0);
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    setCurrent({
      interviewType: InterviewType.Virtual,
      scheduledStart: now,
      scheduledEnd: end,
      panelUserIds: [],
      status: InterviewStatus.Scheduled,
      createCalendarEvent: true,
      generateMeetLink: true,
      ...(interview || {}),
    });
    setApplicantSearch('');
    setApplicantBusinessUnit('');
    setApplicantStage('');
    setApplicantDepartment('');
    setPanelSearchTerm('');
    setPanelDepartment('');
    setIsApplicantListOpen(!interview?.applicationId);
    setIsPanelListOpen(true);
    setError('');
  }, [interview, isOpen]);

  const selectedApplicant = useMemo(
    () => candidateOptions.find((option) => option.appId === current.applicationId),
    [candidateOptions, current.applicationId],
  );

  const applicantBusinessUnits = useMemo(
    () => Array.from(new Set(candidateOptions.map((option) => option.businessUnit).filter(Boolean))).sort(),
    [candidateOptions],
  );
  const applicantStages = useMemo(
    () => Array.from(new Set(candidateOptions.map((option) => option.stage).filter(Boolean))).sort(),
    [candidateOptions],
  );
  const applicantDepartments = useMemo(
    () => Array.from(new Set(candidateOptions.map((option) => option.department).filter(Boolean))).sort(),
    [candidateOptions],
  );

  const filteredApplicants = useMemo(() => {
    const search = applicantSearch.trim().toLowerCase();
    return candidateOptions.filter((option) => {
      const matchesSearch = !search || [option.name, option.position, option.email, option.businessUnit]
        .some((value) => value.toLowerCase().includes(search));
      return matchesSearch
        && (!applicantBusinessUnit || option.businessUnit === applicantBusinessUnit)
        && (!applicantStage || option.stage === applicantStage)
        && (!applicantDepartment || option.department === applicantDepartment);
    }).slice(0, 50);
  }, [applicantBusinessUnit, applicantDepartment, applicantSearch, applicantStage, candidateOptions]);

  const panelDepartments = useMemo(
    () => Array.from(new Set(users.map((user) => user.department).filter(Boolean))).sort(),
    [users],
  );
  const displayedInterviewers = useMemo(() => {
    const search = panelSearchTerm.trim().toLowerCase();
    return users.filter((interviewer) => {
      const matchesSearch = !search || [interviewer.name, interviewer.email, interviewer.position, interviewer.role]
        .some((value) => value.toLowerCase().includes(search));
      return matchesSearch && (!panelDepartment || interviewer.department === panelDepartment);
    }).slice(0, 50);
  }, [panelDepartment, panelSearchTerm, users]);

  const selectedPanel = useMemo(
    () => users.filter((user) => current.panelUserIds?.includes(user.id)),
    [current.panelUserIds, users],
  );

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setCurrent((previous) => ({ ...previous, [name]: value }));
    setError('');
  };

  const handleDateTimeChange = (field: 'scheduledStart' | 'scheduledEnd', value: string) => {
    const existing = new Date((field === 'scheduledStart' ? current.scheduledStart : current.scheduledEnd) || new Date());
    const [hours, minutes] = value.split(':').map(Number);
    existing.setHours(hours, minutes, 0, 0);
    setCurrent((previous) => ({ ...previous, [field]: existing }));
    setError('');
  };

  const handleDateChange = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return;
    const start = new Date(current.scheduledStart || new Date());
    const end = new Date(current.scheduledEnd || new Date());
    start.setFullYear(year, month - 1, day);
    end.setFullYear(year, month - 1, day);
    setCurrent((previous) => ({ ...previous, scheduledStart: start, scheduledEnd: end }));
    setError('');
  };

  const selectApplicant = (option: InterviewApplicantOption) => {
    setCurrent((previous) => ({ ...previous, applicationId: option.appId }));
    setApplicantSearch(option.name);
    setIsApplicantListOpen(false);
    setError('');
  };

  const togglePanelMember = (userId: string) => {
    setCurrent((previous) => {
      const panel = previous.panelUserIds || [];
      return {
        ...previous,
        panelUserIds: panel.includes(userId) ? panel.filter((id) => id !== userId) : [...panel, userId],
      };
    });
    setError('');
  };

  const formatDateForInput = (date?: Date) => {
    if (!date) return '';
    const value = new Date(date);
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  };
  const formatTimeForInput = (date?: Date) => date ? new Date(date).toTimeString().slice(0, 5) : '';

  const handleSave = async () => {
    if (!current.applicationId || !current.scheduledStart || !current.scheduledEnd || !current.panelUserIds?.length) {
      setError('Select an applicant, set a time, and add at least one panel member.');
      return;
    }
    if (new Date(current.scheduledEnd).getTime() <= new Date(current.scheduledStart).getTime()) {
      setError('The end time must be later than the start time.');
      return;
    }
    if (current.interviewType === InterviewType.Onsite && !current.location?.trim()) {
      setError('Add an onsite location.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      await onSave({
        ...(current as Interview),
        createCalendarEvent: current.createCalendarEvent !== false,
        generateMeetLink: current.generateMeetLink !== false,
      });
      onClose();
    } catch (saveError: any) {
      setError(saveError?.message || 'Failed to schedule interview.');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedPanelNames = selectedPanel.map((panelUser) => panelUser.name).join(', ');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={interview?.id ? 'Edit Interview' : 'Schedule New Interview'}
      size="3xl"
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">Invitations are sent only after you click Schedule Interview.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>{isSaving ? 'Scheduling...' : interview?.id ? 'Update Interview' : 'Schedule Interview'}</Button>
          </div>
        </div>
      )}
    >
      <div className="space-y-5">
        {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200" role="alert">{error}</div>}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="font-semibold text-gray-900 dark:text-white">1. Select Applicant</h4>
            {selectedApplicant && <button type="button" className="text-sm text-indigo-600 hover:underline" onClick={() => setIsApplicantListOpen(true)}>Change</button>}
          </div>
          {selectedApplicant && !isApplicantListOpen ? (
            <button type="button" onClick={() => setIsApplicantListOpen(true)} className="w-full rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-left dark:border-indigo-800 dark:bg-indigo-900/20">
              <p className="font-semibold text-gray-900 dark:text-white">{selectedApplicant.name} — {selectedApplicant.position}</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">{selectedApplicant.businessUnit} • {selectedApplicant.stage} • {selectedApplicant.email}</p>
            </button>
          ) : (
            <div className="space-y-2">
              <Input label="" placeholder="Search applicant by name, position, or email" value={applicantSearch} onChange={(event) => setApplicantSearch(event.target.value)} />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <select aria-label="Filter applicants by business unit" value={applicantBusinessUnit} onChange={(event) => setApplicantBusinessUnit(event.target.value)} className={inputClasses}>
                  <option value="">All business units</option>
                  {applicantBusinessUnits.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <select aria-label="Filter applicants by stage" value={applicantStage} onChange={(event) => setApplicantStage(event.target.value)} className={inputClasses}>
                  <option value="">All stages</option>
                  {applicantStages.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <select aria-label="Filter applicants by department" value={applicantDepartment} onChange={(event) => setApplicantDepartment(event.target.value)} className={inputClasses}>
                  <option value="">All departments</option>
                  {applicantDepartments.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                {filteredApplicants.length ? filteredApplicants.map((option) => (
                  <button type="button" key={option.appId} onClick={() => selectApplicant(option)} className="block w-full border-b border-gray-100 p-3 text-left last:border-b-0 hover:bg-indigo-50 dark:border-gray-700 dark:hover:bg-slate-700">
                    <p className="font-medium text-gray-900 dark:text-white">{option.name} — {option.position}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{option.businessUnit} • {option.department} • {option.stage} • {option.email}</p>
                  </button>
                )) : <p className="p-4 text-sm text-gray-500">No applicants match the search.</p>}
              </div>
            </div>
          )}
        </section>

        <section>
          <h4 className="mb-2 font-semibold text-gray-900 dark:text-white">2. Schedule</h4>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Date" type="date" value={formatDateForInput(current.scheduledStart)} onChange={(event) => handleDateChange(event.target.value)} />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Interview type</label>
              <select name="interviewType" value={current.interviewType || InterviewType.Virtual} onChange={handleChange} className={inputClasses}>
                {Object.values(InterviewType).map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <Input label="Start time" type="time" value={formatTimeForInput(current.scheduledStart)} onChange={(event) => handleDateTimeChange('scheduledStart', event.target.value)} />
            <Input label="End time" type="time" value={formatTimeForInput(current.scheduledEnd)} onChange={(event) => handleDateTimeChange('scheduledEnd', event.target.value)} />
          </div>
          {current.interviewType === InterviewType.Onsite && <Input label="Location" name="location" value={current.location || ''} onChange={handleChange} placeholder="e.g. Main Office, Room 2" />}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white">3. Interview Panel</h4>
              {selectedPanelNames && <p className="text-xs text-gray-500">Selected: {selectedPanelNames}</p>}
            </div>
            <button type="button" className="text-sm text-indigo-600 hover:underline" onClick={() => setIsPanelListOpen((open) => !open)}>{isPanelListOpen ? 'Hide' : 'Edit'}</button>
          </div>
          {selectedPanel.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {selectedPanel.map((panelUser) => <span key={panelUser.id} className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-xs text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">{panelUser.name}<button type="button" aria-label={`Remove ${panelUser.name}`} onClick={() => togglePanelMember(panelUser.id)}>×</button></span>)}
            </div>
          )}
          {isPanelListOpen && (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_220px]">
                <Input label="" placeholder="Search panel members by name, title, or email" value={panelSearchTerm} onChange={(event) => setPanelSearchTerm(event.target.value)} />
                <select aria-label="Filter panel by department" value={panelDepartment} onChange={(event) => setPanelDepartment(event.target.value)} className={inputClasses}>
                  <option value="">All departments</option>
                  {panelDepartments.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                {displayedInterviewers.length ? displayedInterviewers.map((panelUser) => (
                  <label key={panelUser.id} className="flex cursor-pointer items-center gap-3 border-b border-gray-100 p-3 last:border-b-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-slate-700">
                    <input type="checkbox" checked={current.panelUserIds?.includes(panelUser.id) || false} onChange={() => togglePanelMember(panelUser.id)} className="h-4 w-4 rounded text-indigo-600" />
                    <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-gray-900 dark:text-white">{panelUser.name} <span className="font-normal text-gray-500">({panelUser.role})</span></span><span className="block text-xs text-gray-500">{panelUser.position || panelUser.department || panelUser.email}</span></span>
                  </label>
                )) : <p className="p-4 text-sm text-gray-500">No panel members match the search.</p>}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <h4 className="font-semibold text-gray-900 dark:text-white">4. Invitations</h4>
          <label className="mt-3 flex items-start gap-3">
            <input type="checkbox" checked={current.createCalendarEvent !== false} onChange={(event) => setCurrent((previous) => ({ ...previous, createCalendarEvent: event.target.checked }))} className="mt-1 h-4 w-4 rounded text-indigo-600" />
            <span><span className="block text-sm font-medium text-gray-900 dark:text-white">Create Google Calendar event and send invitations</span><span className="block text-xs text-gray-500">The applicant and selected panel members are added as attendees.</span></span>
          </label>
          {current.interviewType === InterviewType.Virtual && <label className="mt-3 flex items-start gap-3 pl-7">
            <input type="checkbox" disabled={current.createCalendarEvent === false} checked={current.generateMeetLink !== false} onChange={(event) => setCurrent((previous) => ({ ...previous, generateMeetLink: event.target.checked }))} className="mt-1 h-4 w-4 rounded text-indigo-600" />
            <span><span className="block text-sm font-medium text-gray-900 dark:text-white">Generate a real Google Meet link</span><span className="block text-xs text-gray-500">The link is accepted only from Google Calendar conference creation.</span></span>
          </label>}
        </section>
      </div>
    </Modal>
  );
};

export default InterviewSchedulerModal;
