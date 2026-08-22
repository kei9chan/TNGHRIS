import React, { useEffect, useMemo, useState } from 'react';
import {
  ApplicationStage,
  BusinessUnit,
  Department,
  Interview,
  InterviewStatus,
  InterviewType,
  User,
} from '../../types';
import {
  InterviewCandidateOption,
  InterviewScheduleOptions,
} from '../../services/interviewSchedulingService';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface InterviewSchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
  interview: Interview | null;
  onSave: (interview: Interview, options: InterviewScheduleOptions) => Promise<void> | void;
  candidateOptions: InterviewCandidateOption[];
  users: User[];
  businessUnits: BusinessUnit[];
  departments: Department[];
}

const selectClass = 'mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white';

const InterviewSchedulerModal: React.FC<InterviewSchedulerModalProps> = ({
  isOpen,
  onClose,
  interview,
  onSave,
  candidateOptions,
  users,
  businessUnits,
  departments,
}) => {
  const [current, setCurrent] = useState<Partial<Interview>>({});
  const [applicantSearch, setApplicantSearch] = useState('');
  const [businessUnitFilter, setBusinessUnitFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [panelSearch, setPanelSearch] = useState('');
  const [panelDepartmentFilter, setPanelDepartmentFilter] = useState('');
  const [panelRoleFilter, setPanelRoleFilter] = useState('');
  const [createCalendarEvent, setCreateCalendarEvent] = useState(true);
  const [includeScheduler, setIncludeScheduler] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    setCurrent(interview || {
      interviewType: InterviewType.Virtual,
      scheduledStart: now,
      scheduledEnd: end,
      panelUserIds: [],
      status: InterviewStatus.Scheduled,
    });
    setApplicantSearch('');
    setBusinessUnitFilter('');
    setDepartmentFilter('');
    setStageFilter('');
    setPanelSearch('');
    setPanelDepartmentFilter('');
    setPanelRoleFilter('');
    setCreateCalendarEvent(true);
    setIncludeScheduler(true);
    setFormError('');
  }, [interview, isOpen]);

  const selectedApplicant = useMemo(
    () => candidateOptions.find(option => option.appId === current.applicationId),
    [candidateOptions, current.applicationId],
  );

  const filteredApplicants = useMemo(() => {
    const query = applicantSearch.trim().toLowerCase();
    return candidateOptions.filter(option => {
      const haystack = `${option.candidateName} ${option.position} ${option.email}`.toLowerCase();
      return (!query || haystack.includes(query))
        && (!businessUnitFilter || option.businessUnitId === businessUnitFilter)
        && (!departmentFilter || option.departmentId === departmentFilter)
        && (!stageFilter || option.stage === stageFilter);
    });
  }, [applicantSearch, businessUnitFilter, candidateOptions, departmentFilter, stageFilter]);

  const visibleDepartments = useMemo(
    () => departments.filter(department => !businessUnitFilter || department.businessUnitId === businessUnitFilter),
    [businessUnitFilter, departments],
  );

  const activeUsers = useMemo(
    () => users.filter(member => member.status !== 'Inactive'),
    [users],
  );
  const selectedPanel = useMemo(
    () => activeUsers.filter(member => current.panelUserIds?.includes(member.id)),
    [activeUsers, current.panelUserIds],
  );
  const panelRoles = useMemo(
    () => Array.from(new Set(activeUsers.map(member => member.role).filter(Boolean))).sort(),
    [activeUsers],
  );
  const filteredPanel = useMemo(() => {
    const query = panelSearch.trim().toLowerCase();
    return activeUsers.filter(member => {
      const haystack = `${member.name} ${member.email} ${member.position} ${member.department} ${member.role}`.toLowerCase();
      return (!query || haystack.includes(query))
        && (!panelDepartmentFilter || member.departmentId === panelDepartmentFilter)
        && (!panelRoleFilter || member.role === panelRoleFilter);
    });
  }, [activeUsers, panelDepartmentFilter, panelRoleFilter, panelSearch]);

  const handleDateChange = (value: string) => {
    if (!value) return;
    const [year, month, day] = value.split('-').map(Number);
    const start = new Date(current.scheduledStart || new Date());
    const end = new Date(current.scheduledEnd || new Date(start.getTime() + 3600000));
    start.setFullYear(year, month - 1, day);
    end.setFullYear(year, month - 1, day);
    setCurrent(previous => ({ ...previous, scheduledStart: start, scheduledEnd: end }));
  };

  const handleTimeChange = (field: 'scheduledStart' | 'scheduledEnd', value: string) => {
    const [hours, minutes] = value.split(':').map(Number);
    const next = new Date(current[field] || new Date());
    next.setHours(hours, minutes, 0, 0);
    setCurrent(previous => ({ ...previous, [field]: next }));
  };

  const togglePanelMember = (userId: string) => {
    setCurrent(previous => {
      const panel = previous.panelUserIds || [];
      return {
        ...previous,
        panelUserIds: panel.includes(userId) ? panel.filter(id => id !== userId) : [...panel, userId],
      };
    });
  };

  const handleSave = async () => {
    setFormError('');
    if (!current.applicationId) return setFormError('Select an applicant.');
    if (!current.scheduledStart || !current.scheduledEnd) return setFormError('Set the interview date and time.');
    if (current.scheduledEnd <= current.scheduledStart) return setFormError('End time must be after the start time.');
    if (!current.panelUserIds?.length) return setFormError('Select at least one interview panel member.');
    if (current.interviewType === InterviewType.Onsite && !current.location?.trim()) return setFormError('Enter the onsite interview location.');

    setIsSaving(true);
    try {
      await onSave(current as Interview, {
        createCalendarEvent: current.interviewType === InterviewType.Virtual && createCalendarEvent,
        includeScheduler,
      });
    } catch (error: any) {
      setFormError(error?.message || 'Unable to schedule the interview.');
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (value?: Date) => {
    if (!value) return '';
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  };
  const formatTime = (value?: Date) => value ? new Date(value).toTimeString().slice(0, 5) : '';
  const isEditing = Boolean(interview?.id);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Interview' : 'Schedule New Interview'}
      size="3xl"
      footer={(
        <div className="flex w-full justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Scheduling…' : isEditing ? 'Update Schedule' : 'Schedule Interview'}
          </Button>
        </div>
      )}
    >
      <div className="space-y-5">
        <section>
          <label className="block text-sm font-semibold text-gray-800 dark:text-gray-100">1. Select Applicant</label>
          <Input
            label=""
            placeholder="Search applicant by name, position, or email"
            value={applicantSearch}
            onChange={event => setApplicantSearch(event.target.value)}
            className="mt-2"
          />
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select
              aria-label="Filter applicants by business unit"
              value={businessUnitFilter}
              onChange={event => {
                setBusinessUnitFilter(event.target.value);
                setDepartmentFilter('');
              }}
              className={selectClass}
            >
              <option value="">All business units</option>
              {businessUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
            <select aria-label="Filter applicants by department" value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)} className={selectClass}>
              <option value="">All departments</option>
              {visibleDepartments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
            <select aria-label="Filter applicants by stage" value={stageFilter} onChange={event => setStageFilter(event.target.value)} className={selectClass}>
              <option value="">All stages</option>
              {Object.values(ApplicationStage).map(stage => <option key={stage} value={stage}>{stage}</option>)}
            </select>
          </div>
          <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-gray-200 dark:border-slate-600">
            {filteredApplicants.map(option => {
              const selected = option.appId === current.applicationId;
              return (
                <button
                  key={option.appId}
                  type="button"
                  onClick={() => setCurrent(previous => ({ ...previous, applicationId: option.appId }))}
                  className={`w-full border-b border-gray-100 px-3 py-2 text-left last:border-b-0 dark:border-slate-700 ${selected ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-400 dark:bg-indigo-950/40' : 'hover:bg-gray-50 dark:hover:bg-slate-700/60'}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border text-xs ${selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 text-transparent'}`}>✓</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">{option.candidateName} — {option.position}</span>
                      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                        {[option.businessUnitName, option.departmentName, option.stage, option.email].filter(Boolean).join(' • ')}
                      </span>
                    </span>
                  </div>
                </button>
              );
            })}
            {!filteredApplicants.length && <p className="p-4 text-center text-sm text-gray-500">No applicants match these filters.</p>}
          </div>
          {selectedApplicant && <p className="mt-2 text-xs text-indigo-700 dark:text-indigo-300">Selected: {selectedApplicant.candidateName} — {selectedApplicant.position}</p>}
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="2. Date" type="date" value={formatDate(current.scheduledStart)} onChange={event => handleDateChange(event.target.value)} />
          <div>
            <label className="block text-sm font-medium">3. Type</label>
            <select value={current.interviewType || InterviewType.Virtual} onChange={event => setCurrent(previous => ({ ...previous, interviewType: event.target.value as InterviewType }))} className={selectClass}>
              {Object.values(InterviewType).map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
          <Input label="4. Start Time" type="time" value={formatTime(current.scheduledStart)} onChange={event => handleTimeChange('scheduledStart', event.target.value)} />
          <Input label="5. End Time" type="time" value={formatTime(current.scheduledEnd)} onChange={event => handleTimeChange('scheduledEnd', event.target.value)} />
        </section>

        {current.interviewType === InterviewType.Onsite && (
          <Input label="Location" value={current.location || ''} onChange={event => setCurrent(previous => ({ ...previous, location: event.target.value }))} placeholder="Office, floor, or room" />
        )}

        <section>
          <label className="block text-sm font-semibold text-gray-800 dark:text-gray-100">6. Interview Panel</label>
          {selectedPanel.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedPanel.map(member => (
                <span key={member.id} className="inline-flex max-w-full items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200">
                  <span className="truncate">{member.name}</span>
                  <button type="button" onClick={() => togglePanelMember(member.id)} aria-label={`Remove ${member.name}`} className="rounded px-1 hover:bg-indigo-100 dark:hover:bg-indigo-900">×</button>
                </span>
              ))}
            </div>
          )}
          <Input label="" placeholder="Search employees by name, email, department, or position" value={panelSearch} onChange={event => setPanelSearch(event.target.value)} className="mt-2" />
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select aria-label="Filter panel by department" value={panelDepartmentFilter} onChange={event => setPanelDepartmentFilter(event.target.value)} className={selectClass}>
              <option value="">All departments</option>
              {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
            <select aria-label="Filter panel by role" value={panelRoleFilter} onChange={event => setPanelRoleFilter(event.target.value)} className={selectClass}>
              <option value="">All roles</option>
              {panelRoles.map(role => <option key={role} value={role}>{role}</option>)}
            </select>
          </div>
          <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-slate-600">
            {filteredPanel.map(member => {
              const selected = current.panelUserIds?.includes(member.id) || false;
              return (
                <label key={member.id} className="flex cursor-pointer items-start gap-3 border-b border-gray-100 px-3 py-2 last:border-b-0 hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-700/60">
                  <input type="checkbox" checked={selected} onChange={() => togglePanelMember(member.id)} className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{member.name} ({member.role})</span>
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{[member.position, member.department].filter(Boolean).join(' • ') || member.email}</span>
                  </span>
                </label>
              );
            })}
            {!filteredPanel.length && <p className="p-4 text-center text-sm text-gray-500">No employees match these filters.</p>}
          </div>
        </section>

        {current.interviewType === InterviewType.Virtual && (
          <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">
            <label className="flex items-start gap-2 font-medium">
              <input type="checkbox" checked={createCalendarEvent} onChange={event => setCreateCalendarEvent(event.target.checked)} className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600" />
              <span>Create Google Calendar event and generate Meet link<span className="block text-xs font-normal opacity-75">Invites are sent to the applicant and selected panel from the real calendar event.</span></span>
            </label>
            {createCalendarEvent && (
              <label className="ml-6 flex items-center gap-2 text-xs">
                <input type="checkbox" checked={includeScheduler} onChange={event => setIncludeScheduler(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
                Include me on the calendar invitation
              </label>
            )}
          </div>
        )}

        {formError && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{formError}</div>}
      </div>
    </Modal>
  );
};

export default InterviewSchedulerModal;
