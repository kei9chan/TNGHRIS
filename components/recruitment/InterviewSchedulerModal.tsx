import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Interview, InterviewIntegrationStatus, InterviewMeetingProvider, InterviewStatus, InterviewType, Permission, Role, User } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { fetchInterviewIntegrationStatus, InterviewApplicantOption, InterviewScheduleResult } from '../../services/recruitmentInterviewService';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';

interface InterviewSchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
  interview: Interview | null;
  onSave: (interview: Interview) => Promise<InterviewScheduleResult | void>;
  candidateOptions: InterviewApplicantOption[];
  users: User[];
}

const inputClasses = 'mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white';
const defaultIntegrationStatus: InterviewIntegrationStatus = { zoom: { connected: false } };

const detectMeetingProvider = (value: string): string => {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'zoom.us' || hostname.endsWith('.zoom.us')) return 'Zoom';
    if (hostname === 'meet.google.com') return 'Google Meet';
    if (hostname === 'teams.microsoft.com' || hostname === 'teams.live.com' || hostname.endsWith('.teams.microsoft.com')) return 'Microsoft Teams';
    if (hostname === 'webex.com' || hostname.endsWith('.webex.com')) return 'Webex';
  } catch {
    return '';
  }
  return 'Other';
};

const getExistingMeetingProvider = (interview?: Interview | null): InterviewMeetingProvider | undefined => {
  if (interview?.meetingProvider) return interview.meetingProvider;
  if (interview?.googleMeetLink || interview?.location?.startsWith('https://meet.google.com/')) return 'Google Meet';
  if (interview?.location?.startsWith('https://')) return 'Custom';
  return undefined;
};

const isValidHttpsLink = (value: string): boolean => {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !url.hostname || url.hostname === 'example.com') return false;
    const lower = value.trim().toLowerCase();
    return !['https://example.com', 'https://example.com/', 'https://your-link-here.com'].includes(lower)
      && !lower.includes('placeholder')
      && !lower.includes('your-meeting');
  } catch {
    return false;
  }
};

const isHostOnlyZoomLink = (value: string): boolean => {
  try {
    const url = new URL(value.trim());
    if (!url.hostname.toLowerCase().endsWith('zoom.us')) return false;
    return /^\/(s|wc|launch|start|host|meeting\/schedule)(\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
};

const InterviewSchedulerModal: React.FC<InterviewSchedulerModalProps> = ({
  isOpen,
  onClose,
  interview,
  onSave,
  candidateOptions,
  users,
}) => {
  const { user } = useAuth();
  const { can } = usePermissions();
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
  const [scheduledSuccess, setScheduledSuccess] = useState<Interview | null>(null);
  const [successCopied, setSuccessCopied] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<InterviewIntegrationStatus>(defaultIntegrationStatus);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [integrationError, setIntegrationError] = useState('');
  const providerTouchedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    const now = new Date();
    now.setSeconds(0, 0);
    now.setMinutes(0);
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    const existingProvider = getExistingMeetingProvider(interview);
    const existingLink = interview?.attendeeMeetingUrl || interview?.googleMeetLink || (interview?.location?.startsWith('https://') ? interview.location : '');
    providerTouchedRef.current = Boolean(interview?.id);
    setCurrent({
      interviewType: InterviewType.Virtual,
      scheduledStart: now,
      scheduledEnd: end,
      panelUserIds: [],
      status: InterviewStatus.Scheduled,
      createCalendarEvent: true,
      interviewRound: 'Round 1',
      meetingProvider: existingProvider || 'Custom',
      attendeeMeetingUrl: existingLink,
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
    setScheduledSuccess(null);
    setSuccessCopied(false);
    setIntegrationError('');
    setIntegrationStatus(defaultIntegrationStatus);
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
  const panelUserIdsKey = (current.panelUserIds || []).join(',');

  useEffect(() => {
    if (!isOpen || current.interviewType !== InterviewType.Virtual) return;
    let active = true;
    setIntegrationLoading(true);
    setIntegrationError('');
    fetchInterviewIntegrationStatus(current.panelUserIds || [])
      .then((status) => {
        if (!active) return;
        setIntegrationStatus(status);
        if (!interview?.id && !providerTouchedRef.current && status.zoom.connected) {
          setCurrent((previous) => ({ ...previous, meetingProvider: 'Zoom' }));
        }
      })
      .catch((statusError: any) => {
        if (!active) return;
        setIntegrationStatus(defaultIntegrationStatus);
        setIntegrationError(statusError?.message || 'Meeting integrations could not be checked.');
      })
      .finally(() => {
        if (active) setIntegrationLoading(false);
      });
    return () => {
      active = false;
    };
  }, [current.interviewType, interview?.id, isOpen, panelUserIdsKey]);

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

  const selectMeetingProvider = (provider: InterviewMeetingProvider) => {
    providerTouchedRef.current = true;
    setCurrent((previous) => ({ ...previous, meetingProvider: provider }));
    setError('');
  };

  const handleCustomLinkChange = (value: string) => {
    providerTouchedRef.current = true;
    setCurrent((previous) => ({ ...previous, meetingProvider: 'Custom', attendeeMeetingUrl: value }));
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

  const canConnectZoom = user?.role === Role.Admin || can('RolesPermissions', Permission.Manage);

  const validateCustomLink = () => {
    const value = String(current.attendeeMeetingUrl || '').trim();
    if (!isValidHttpsLink(value) || isHostOnlyZoomLink(value)) {
      setError('Please enter a valid attendee meeting link.');
      return false;
    }
    return true;
  };

  const handleSave = async (knownIntegrationStatus?: InterviewIntegrationStatus) => {
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
    if (current.interviewType === InterviewType.Virtual) {
      const provider = current.meetingProvider || 'Custom';
      const effectiveIntegrationStatus = knownIntegrationStatus || integrationStatus;
      if (provider === 'Zoom' && !effectiveIntegrationStatus.zoom.connected) {
        setError('Zoom meeting could not be created. You may retry or use a custom meeting link.');
        return;
      }
      if (provider === 'Google Meet' && current.createCalendarEvent === false) {
        setError('Google Meet can only be created with a Google Calendar event.');
        return;
      }
      if (provider === 'Custom' && !validateCustomLink()) return;
    }
    setIsSaving(true);
    setError('');
    try {
      const provider = current.interviewType === InterviewType.Virtual ? (current.meetingProvider || 'Custom') : undefined;
      const result = await onSave({
        ...(current as Interview),
        meetingProvider: provider,
        attendeeMeetingUrl: provider === 'Custom' ? String(current.attendeeMeetingUrl || '').trim() : current.attendeeMeetingUrl,
        createCalendarEvent: current.createCalendarEvent !== false,
      });
      if (result?.interview) setCurrent(result.interview);
      if (result?.warnings?.length) {
        setError(result.warnings.join('\n'));
        return;
      }
      if (result?.interview) {
        setScheduledSuccess(result.interview);
      } else {
        onClose();
      }
    } catch (saveError: any) {
      setError(saveError?.message || 'Failed to schedule interview.');
    } finally {
      setIsSaving(false);
    }
  };

  const retryZoom = async () => {
    setIntegrationLoading(true);
    setIntegrationError('');
    try {
      const status = await fetchInterviewIntegrationStatus(current.panelUserIds || []);
      setIntegrationStatus(status);
      if (!status.zoom.connected) {
        setError('Zoom meeting could not be created. You may retry or use a custom meeting link.');
        return;
      }
      await handleSave(status);
    } catch (retryError: any) {
      setError(retryError?.message || 'Zoom connection could not be verified.');
    } finally {
      setIntegrationLoading(false);
    }
  };

  const selectedPanelNames = selectedPanel.map((panelUser) => panelUser.name).join(', ');
  const selectedProvider = current.meetingProvider || 'Custom';
  const customLink = String(current.attendeeMeetingUrl || '').trim();
  const detectedProvider = customLink && isValidHttpsLink(customLink) ? detectMeetingProvider(customLink) : '';
  const customLinkIsHostOnly = Boolean(customLink && isHostOnlyZoomLink(customLink));
  const isEditingInterview = Boolean(interview?.id || current.id);
  const successMeetingLink = scheduledSuccess?.attendeeMeetingUrl || scheduledSuccess?.googleMeetLink || (scheduledSuccess?.location?.startsWith('https://') ? scheduledSuccess.location : '');
  const successProvider = scheduledSuccess?.meetingProvider || (scheduledSuccess?.googleMeetLink ? 'Google Meet' : successMeetingLink ? 'Custom' : 'Not applicable');
  const copySuccessMeetingLink = async () => {
    if (!successMeetingLink) return;
    await navigator.clipboard.writeText(successMeetingLink);
    setSuccessCopied(true);
    window.setTimeout(() => setSuccessCopied(false), 1800);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditingInterview ? 'Edit Interview' : 'Schedule New Interview'}
      size="3xl"
      footer={scheduledSuccess ? (
        <div className="flex w-full justify-end">
          <Button variant="secondary" onClick={onClose}>Done</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">Invitations are sent only after you click Schedule Interview.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>{isSaving ? 'Scheduling...' : isEditingInterview ? 'Update Interview' : 'Schedule Interview'}</Button>
          </div>
        </div>
      )}
    >
      <div className="space-y-5">
        {scheduledSuccess ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-green-200 bg-green-50 p-5 dark:border-green-800 dark:bg-green-900/20">
              <p className="text-lg font-semibold text-green-800 dark:text-green-200">Interview scheduled</p>
              <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-300">Meeting provider</dt><dd className="mt-1 font-medium text-green-900 dark:text-green-100">{successProvider}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-300">Calendar event</dt><dd className="mt-1 font-medium text-green-900 dark:text-green-100">{scheduledSuccess.calendarEventId ? 'Created and invitations sent' : 'Not requested'}</dd></div>
              </dl>
              {successMeetingLink && <div className="mt-4 rounded-lg border border-green-200 bg-white p-3 dark:border-green-700 dark:bg-slate-900/50"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Attendee meeting link</p><p className="mt-1 break-all text-sm text-gray-900 dark:text-white">{successMeetingLink}</p></div>}
              <div className="mt-4 flex flex-wrap gap-2">
                {scheduledSuccess.googleCalendarLink && <a href={scheduledSuccess.googleCalendarLink} target="_blank" rel="noopener noreferrer" className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">View Calendar Event ↗</a>}
                {successMeetingLink && <button type="button" onClick={copySuccessMeetingLink} className="rounded-md border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:bg-slate-800 dark:text-indigo-200">{successCopied ? 'Copied' : 'Copy Meeting Link'}</button>}
                {successMeetingLink && <a href={successMeetingLink} target="_blank" rel="noopener noreferrer" className="rounded-md border border-green-300 bg-white px-3 py-2 text-sm font-semibold text-green-700 hover:bg-green-100 dark:border-green-700 dark:bg-slate-800 dark:text-green-200">Open Meeting Link ↗</a>}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-300">
              <p>Candidate invitation: <span className="font-semibold">{scheduledSuccess.applicantInviteStatus === 'sent' ? 'Sent' : 'Not requested'}</span></p>
              <p className="mt-1">Panel invitations: <span className="font-semibold">{scheduledSuccess.panelInviteStatus === 'sent' ? 'Sent' : 'Not requested'}</span></p>
              {scheduledSuccess.zoomAlternativeHostEmails?.length ? <p className="mt-1">Alternative hosts: <span className="font-semibold">{scheduledSuccess.zoomAlternativeHostEmails.join(', ')}</span></p> : null}
            </div>
          </div>
        ) : <>
        {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200" role="alert">
          <p>{error}</p>
          {(error.includes('Zoom meeting could not be created') || error.includes('Calendar')) && <div className="mt-3 flex flex-wrap gap-2">
            {error.includes('Zoom meeting could not be created') && <Button variant="secondary" onClick={retryZoom} disabled={isSaving || integrationLoading}>Retry Zoom</Button>}
            {error.includes('Zoom meeting could not be created') && <button type="button" className="rounded-md border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-slate-800 dark:text-red-200" onClick={() => selectMeetingProvider('Custom')}>Use Custom Link Instead</button>}
            {error.includes('Zoom meeting could not be created') && <button type="button" className="rounded-md border border-green-300 bg-white px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-100 dark:border-green-700 dark:bg-slate-800 dark:text-green-200" onClick={() => selectMeetingProvider('Google Meet')}>Use Google Meet</button>}
            {error.includes('Google Calendar') && <Button variant="secondary" onClick={() => handleSave()} disabled={isSaving}>Retry Calendar Invitation</Button>}
          </div>}
        </div>}

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
            <Input label="Interview round" name="interviewRound" value={current.interviewRound || 'Round 1'} onChange={handleChange} placeholder="e.g. Round 1" />
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
            <span><span className="block text-sm font-medium text-gray-900 dark:text-white">Create Google Calendar event and send invitations</span><span className="block text-xs text-gray-500">The applicant and selected panel members are added as attendees and receive Calendar updates.</span></span>
          </label>

          {current.interviewType === InterviewType.Virtual && (
            <div className="mt-5 border-t border-gray-200 pt-5 dark:border-gray-700">
              <div className="mb-3">
                <h5 className="font-semibold text-gray-900 dark:text-white">How will you conduct the interview?</h5>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Choose one meeting option. Google Calendar invitations remain enabled for every option.</p>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {([
                  { provider: 'Zoom' as const, title: 'Zoom', subtitle: 'Create a Zoom meeting automatically', icon: 'Z' },
                  { provider: 'Google Meet' as const, title: 'Google Meet', subtitle: 'Create Google Meet automatically', icon: 'M' },
                  { provider: 'Custom' as const, title: 'Custom Link', subtitle: 'Paste an existing meeting link', icon: '↗' },
                ]).map((card) => (
                  <button
                    key={card.provider}
                    type="button"
                    aria-pressed={selectedProvider === card.provider}
                    onClick={() => selectMeetingProvider(card.provider)}
                    className={`rounded-xl border p-4 text-left transition ${selectedProvider === card.provider ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-200 dark:border-violet-400 dark:bg-violet-900/20 dark:ring-violet-900' : 'border-gray-200 hover:border-violet-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-slate-700'}`}
                  >
                    <span className="flex items-start gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${selectedProvider === card.provider ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'}`}>{card.icon}</span><span className="min-w-0"><span className="block font-semibold text-gray-900 dark:text-white">{card.title}</span><span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">{card.subtitle}</span></span></span>
                    {card.provider === 'Zoom' && <span className={`mt-3 inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${integrationStatus.zoom.connected ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>{integrationLoading ? 'Checking connection…' : integrationStatus.zoom.connected ? 'Connected' : 'Not connected'}</span>}
                  </button>
                ))}
              </div>

              {selectedProvider === 'Zoom' && (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-100">
                  {integrationStatus.zoom.connected ? (
                    <>
                      <p className="font-semibold">Zoom connected</p>
                      <p className="mt-1 text-xs">Company host: {integrationStatus.zoom.hostName || integrationStatus.zoom.hostEmail || 'Dedicated company Zoom user'}</p>
                      {selectedPanel.length > 0 && <div className="mt-3 space-y-2"><p className="text-xs font-semibold uppercase tracking-wide">Panel host eligibility</p>{selectedPanel.map((panelUser) => {
                        const eligibility = integrationStatus.zoom.alternativeHostEligibility?.[panelUser.id];
                        return <div key={panelUser.id} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{panelUser.name}</span><span className={eligibility?.eligible ? 'font-semibold text-green-700 dark:text-green-300' : 'text-gray-600 dark:text-gray-300'}>{integrationLoading ? 'Checking…' : eligibility?.eligible ? 'Zoom host eligible' : 'Calendar attendee only'}</span></div>;
                      })}</div>}
                      <p className="mt-3 text-xs">Meeting security: waiting room enabled; the attendee join URL is stored and sent to the panel.</p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold">Zoom is not connected yet</p>
                      <p className="mt-1 text-xs">Automatic Zoom meetings require the dedicated company Zoom integration. You can continue with a custom attendee link or Google Meet.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canConnectZoom && <button type="button" className="rounded-md border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-slate-800 dark:text-blue-200" onClick={() => setError('Zoom is not connected yet. Configure the company Zoom integration, then refresh this scheduler.')}>Connect Zoom</button>}
                        <button type="button" className="rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800" onClick={() => selectMeetingProvider('Custom')}>Use Custom Link Instead</button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {selectedProvider === 'Google Meet' && (
                <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900 dark:border-green-800 dark:bg-green-900/20 dark:text-green-100">
                  <p className="font-semibold">Google Meet link will be created by Google Calendar</p>
                  <p className="mt-1 text-xs">The scheduler waits for Google Calendar to return the valid attendee link. No link is fabricated in the HRIS.</p>
                </div>
              )}

              {selectedProvider === 'Custom' && (
                <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
                  <label htmlFor="meeting-link" className="block text-sm font-semibold text-gray-900 dark:text-white">Meeting Link</label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input id="meeting-link" type="url" value={customLink} onChange={(event) => handleCustomLinkChange(event.target.value)} placeholder="Paste Zoom, Google Meet, Teams, Webex, or another meeting link" className={`${inputClasses} mt-0 flex-1`} />
                  </div>
                  {detectedProvider && <p className="mt-2 text-xs font-medium text-indigo-700 dark:text-indigo-300">Detected provider: {detectedProvider}</p>}
                  {customLinkIsHostOnly && <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">This looks like a Zoom host/start link. Paste the attendee join link instead.</p>}
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">This link will be included in the Google Calendar invitation sent to the candidate and interview panel.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={!isValidHttpsLink(customLink) || isHostOnlyZoomLink(customLink)} onClick={() => window.open(customLink, '_blank', 'noopener,noreferrer')} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-slate-800 dark:text-gray-200">Test Link</button>
                  </div>
                </div>
              )}
              {integrationError && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">{integrationError} You can still use Google Meet or a custom attendee link.</p>}
            </div>
          )}
        </section>
        </>}
      </div>
    </Modal>
  );
};

export default InterviewSchedulerModal;
