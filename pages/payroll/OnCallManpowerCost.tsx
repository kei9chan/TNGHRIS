import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';

type BusinessUnit = { id: string; name: string };
type Department = { id: string; name: string };
type Kpis = {
  scheduledHeadcount: number;
  reportedHeadcount: number;
  sickCallIns: number;
  replacementShifts: number;
  totalOnCallHours: number;
  unfilledPositions: number;
  regularProvisionalCost: number;
  onCallCommittedCost: number;
  onCallActualCost: number;
  approvedOtCost: number;
  totalActualCost: number;
  projectedCost: number;
  costStatus: string;
  actualThroughToday: string;
  reportingRate: number;
};
type Day = {
  date: string;
  scheduled: number;
  reported: number;
  sick: number;
  onCall: number;
  unfilled: number;
  regularCost: number;
  onCallCommittedCost: number;
  replacementActualCost: number;
  actualCost: number;
  projectedCost: number;
  coverageStatus: string;
  events: Array<{ event_name: string; priority: string; location?: string }>;
};
type EmployeeCost = {
  employeeId: string;
  employeeName: string;
  businessUnit?: string;
  department?: string;
  regularCost: number;
  onCallShifts: number;
  onCallHours: number;
  onCallCost: number;
  approvedOtCost: number;
  totalActualCost: number;
  costStatus: string;
};
type EventNote = {
  id: string;
  event_name: string;
  start_date: string;
  end_date: string;
  location?: string;
  priority: string;
  expected_attendance?: number;
  staffing_target?: number;
  budget_limit?: number;
  notes?: string;
};
type Replacement = {
  id: string;
  date: string;
  absentEmployeeId?: string;
  position: string;
  shift?: string;
  replacementEmployeeId?: string;
  status: string;
  hours?: number;
  cost?: number;
  requestId: string;
};
type Dashboard = { kpis: Kpis; daily: Day[]; employees: EmployeeCost[]; events: EventNote[]; replacements: Replacement[]; scopeType?: string };
type EmployeeSort = 'total' | 'onCall' | 'shifts' | 'hours';

const emptyKpis: Kpis = { scheduledHeadcount: 0, reportedHeadcount: 0, sickCallIns: 0, replacementShifts: 0, totalOnCallHours: 0, unfilledPositions: 0, regularProvisionalCost: 0, onCallCommittedCost: 0, onCallActualCost: 0, approvedOtCost: 0, totalActualCost: 0, projectedCost: 0, costStatus: 'Provisional / Committed', actualThroughToday: '', reportingRate: 0 };
const peso = (value: number) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const number = (value: number) => Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 1 });
const dayLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
const monthBounds = () => {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
};
const statusColor = (status: string) => status.includes('Unfilled') ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200' : status.includes('on-call') ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200';

const OnCallManpowerCost: React.FC = () => {
  const { user } = useAuth();
  const { getDashboardRequestAccess } = usePermissions();
  const navigate = useNavigate();
  const access = getDashboardRequestAccess('Manpower');
  const initial = useMemo(monthBounds, []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [businessUnitId, setBusinessUnitId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [shift, setShift] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [costStatus, setCostStatus] = useState('');
  const [coverageStatus, setCoverageStatus] = useState('');
  const [dashboard, setDashboard] = useState<Dashboard>({ kpis: emptyKpis, daily: [], employees: [], events: [], replacements: [] });
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tab, setTab] = useState<'overview' | 'daily' | 'employees' | 'reports'>('overview');
  const [employeeSort, setEmployeeSort] = useState<EmployeeSort>('total');
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState({ event_name: '', start_date: from, end_date: to, location: '', expected_attendance: '', staffing_target: '', budget_limit: '', priority: 'normal', notes: '' });
  const [savingEvent, setSavingEvent] = useState(false);

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error: queryError } = await supabase.rpc('get_on_call_manpower_dashboard_v2', {
      p_from: from, p_to: to, p_business_unit_id: businessUnitId || null, p_department_id: departmentId || null,
      p_employment_type: employmentType || null, p_shift: shift || null, p_event: eventFilter || null,
      p_location: locationFilter || null, p_cost_status: costStatus || null, p_coverage_status: coverageStatus || null,
    });
    if (queryError) {
      setError(queryError.message || 'The manpower dashboard could not be loaded.');
    } else {
      setDashboard((data || { kpis: emptyKpis, daily: [], employees: [], events: [], replacements: [] }) as Dashboard);
      setError('');
    }
    setLoading(false);
  }, [businessUnitId, coverageStatus, costStatus, departmentId, employmentType, eventFilter, from, locationFilter, shift, to, user]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);
  useEffect(() => {
    const loadFilters = async () => {
      const [bu, dept] = await Promise.all([
        supabase.from('business_units').select('id,name').order('name'),
        supabase.from('departments').select('id,name').order('name'),
      ]);
      if (!bu.error) setBusinessUnits((bu.data || []) as BusinessUnit[]);
      if (!dept.error) setDepartments((dept.data || []) as Department[]);
    };
    void loadFilters();
  }, []);

  const selectedDay = dashboard.daily.find(day => day.date === selectedDate) || dashboard.daily[0];
  const weeks = useMemo(() => Array.from({ length: Math.ceil(dashboard.daily.length / 7) }, (_, index) => dashboard.daily.slice(index * 7, index * 7 + 7)), [dashboard.daily]);
  const sortedEmployees = useMemo(() => [...dashboard.employees].sort((left, right) => {
    const score = (row: EmployeeCost) => employeeSort === 'onCall' ? row.onCallCost : employeeSort === 'shifts' ? row.onCallShifts : employeeSort === 'hours' ? row.onCallHours : row.totalActualCost;
    return Number(score(right) || 0) - Number(score(left) || 0) || left.employeeName.localeCompare(right.employeeName);
  }), [dashboard.employees, employeeSort]);
  const actualTotal = dashboard.kpis.totalActualCost;
  const projectedTotal = dashboard.kpis.projectedCost;

  const saveEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !eventForm.event_name.trim()) return;
    setSavingEvent(true);
    const { error: saveError } = await supabase.from('manpower_event_notes').insert({
      event_name: eventForm.event_name.trim(), start_date: eventForm.start_date, end_date: eventForm.end_date,
      business_unit_id: businessUnitId || null, location: eventForm.location.trim() || null,
      expected_attendance: eventForm.expected_attendance ? Number(eventForm.expected_attendance) : null,
      staffing_target: eventForm.staffing_target ? Number(eventForm.staffing_target) : null,
      budget_limit: eventForm.budget_limit ? Number(eventForm.budget_limit) : null,
      priority: eventForm.priority, notes: eventForm.notes.trim() || null, created_by: user.id,
    });
    setSavingEvent(false);
    if (saveError) setError(saveError.message || 'Event note could not be saved.');
    else { setShowEventForm(false); setError(''); await loadDashboard(); }
  };

  const exportCsv = (kind: 'employees' | 'daily' | 'events' | 'replacements') => {
    const rows = kind === 'employees' ? sortedEmployees.map(row => [row.employeeName, row.businessUnit || '', row.department || '', row.regularCost, row.onCallShifts, row.onCallHours, row.onCallCost, row.approvedOtCost, row.totalActualCost, row.costStatus]) : kind === 'daily' ? dashboard.daily.map(row => [row.date, row.scheduled, row.reported, row.sick, row.onCall, row.unfilled, row.regularCost, row.onCallCommittedCost, row.actualCost, row.coverageStatus]) : kind === 'events' ? dashboard.events.map(row => [row.event_name, row.start_date, row.end_date, row.location || '', row.expected_attendance || '', row.staffing_target || '', row.budget_limit || '', row.priority]) : dashboard.replacements.map(row => [row.date, row.absentEmployeeId || '', row.position, row.shift || '', row.replacementEmployeeId || '', row.hours || '', row.cost || '', row.status, row.requestId]);
    const headers = kind === 'employees' ? ['Employee', 'Business Unit', 'Department', 'Regular Cost', 'On-Call Shifts', 'On-Call Hours', 'On-Call Cost', 'Approved OT Cost', 'Total Cost', 'Cost Status'] : kind === 'daily' ? ['Date', 'Scheduled', 'Reported', 'Sick', 'On-Call', 'Unfilled', 'Regular Cost', 'On-Call Committed', 'Actual Cost', 'Coverage Status'] : kind === 'events' ? ['Event', 'Start', 'End', 'Location', 'Expected Attendance', 'Staffing Target', 'Budget', 'Priority'] : ['Date', 'Absent Employee ID', 'Position', 'Shift', 'Replacement Employee ID', 'Verified Hours', 'Cost', 'Status', 'Request ID'];
    const csv = [headers, ...rows].map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `on-call-manpower-${kind}-${from}-${to}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  if (!access.canView) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">You do not have permission to view manpower costs.</div>;

  return <div className="space-y-6 pb-10">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">Payroll · Operations intelligence</p><h1 className="text-3xl font-bold text-gray-900 dark:text-white">On-Call &amp; Manpower Cost</h1><p className="mt-1 max-w-3xl text-gray-600 dark:text-gray-400">One source of truth for scheduled staffing, attendance, replacement coverage and payroll-linked cost status.</p></div>
      {access.canRequest && <Button onClick={() => navigate('/payroll/manpower-planning')}>Request On-Call</Button>}
    </div>
    <Card><div className="grid gap-3 md:grid-cols-4 lg:grid-cols-8">
      <label className="text-sm md:col-span-2">From<input aria-label="Date from" type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent p-2 dark:border-slate-600" /></label>
      <label className="text-sm md:col-span-2">To<input aria-label="Date to" type="date" value={to} onChange={e => setTo(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent p-2 dark:border-slate-600" /></label>
      <label className="text-sm md:col-span-2">Business Unit<select value={businessUnitId} onChange={e => setBusinessUnitId(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent p-2 dark:border-slate-600"><option value="">Permitted scope</option>{businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}</select></label>
      <label className="text-sm md:col-span-2">Department<select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent p-2 dark:border-slate-600"><option value="">All permitted</option>{departments.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}</select></label>
      <label className="text-sm">Employment<select value={employmentType} onChange={e => setEmploymentType(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent p-2 dark:border-slate-600"><option value="">All</option><option>Regular</option><option>Probationary</option><option>Part-time</option><option>Consultant</option></select></label>
      <label className="text-sm">Shift<input value={shift} onChange={e => setShift(e.target.value)} placeholder="e.g. Opening" className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent p-2 dark:border-slate-600" /></label>
      <label className="text-sm md:col-span-2">Event<input value={eventFilter} onChange={e => setEventFilter(e.target.value)} placeholder="Search event notes" className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent p-2 dark:border-slate-600" /></label>
      <label className="text-sm md:col-span-2">Location<input value={locationFilter} onChange={e => setLocationFilter(e.target.value)} placeholder="Search location" className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent p-2 dark:border-slate-600" /></label>
      <label className="text-sm">Cost status<select value={costStatus} onChange={e => setCostStatus(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent p-2 dark:border-slate-600"><option value="">All</option><option value="Actual">Actual</option><option value="Provisional">Provisional</option><option value="Committed">Committed</option><option value="Projected">Projected</option><option value="Over Budget">Over Budget</option></select></label>
      <label className="text-sm">Coverage status<select value={coverageStatus} onChange={e => setCoverageStatus(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-transparent p-2 dark:border-slate-600"><option value="">All</option><option value="Fully covered">Fully covered</option><option value="Covered with on-call">Covered with on-call</option><option value="Unfilled">Unfilled</option></select></label>
      <div className="flex items-end md:col-span-2"><Button variant="secondary" onClick={() => { const bounds = monthBounds(); setFrom(bounds.from); setTo(bounds.to); setBusinessUnitId(''); setDepartmentId(''); setEmploymentType(''); setShift(''); setEventFilter(''); setLocationFilter(''); setCostStatus(''); setCoverageStatus(''); }}>This month</Button></div>
    </div></Card>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</div>}
    <div className="flex gap-2 overflow-x-auto border-b border-gray-200 dark:border-slate-700">{[['overview','Overview'],['daily','Daily View'],['employees','Employee Cost'],['reports','Reports']].map(([key,label]) => <button key={key} type="button" onClick={() => setTab(key as typeof tab)} className={`min-h-11 whitespace-nowrap border-b-2 px-4 text-sm font-semibold ${tab === key ? 'border-indigo-600 text-indigo-600 dark:text-indigo-300' : 'border-transparent text-gray-500'}`}>{label}</button>)}</div>
    {loading ? <Card><div className="animate-pulse py-16 text-center text-gray-500">Loading connected schedule and payroll data…</div></Card> : <>
      {tab === 'overview' && <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-9">
          {[['Total Actual Manpower Cost', peso(actualTotal), dashboard.kpis.costStatus],['Regular Cost', peso(dashboard.kpis.regularProvisionalCost), 'Provisional'],['On-Call Spend', peso(dashboard.kpis.onCallCommittedCost + dashboard.kpis.onCallActualCost), dashboard.kpis.onCallActualCost ? 'Actual + Committed' : 'Committed'],['Approved OT Cost', peso(dashboard.kpis.approvedOtCost), 'Payroll-linked'],['Replacement Shifts', number(dashboard.kpis.replacementShifts), 'Approved'],['On-Call Hours', number(dashboard.kpis.totalOnCallHours), 'Verified'],['Scheduled', number(dashboard.kpis.scheduledHeadcount), 'Published shifts'],['Reporting Rate', `${number(dashboard.kpis.reportingRate)}%`, 'Attendance'],['Unfilled', number(dashboard.kpis.unfilledPositions), dashboard.kpis.unfilledPositions ? 'Needs action' : 'Covered']].map(([title,value,status]) => <Card key={title} className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</p><p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p><p className={`mt-2 text-xs font-semibold ${status === 'Needs action' ? 'text-red-600' : 'text-gray-500 dark:text-gray-400'}`}>{status}</p></Card>)}
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-gray-900 dark:text-white">Cost mix</h2><p className="text-sm text-gray-500">Actual, provisional and committed amounts stay separate.</p></div><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200">Actual through {dashboard.kpis.actualThroughToday || 'today'}</span></div><div className="mt-6 space-y-4">{[['Regular / provisional',dashboard.kpis.regularProvisionalCost,'bg-indigo-500'],['On-call / committed',dashboard.kpis.onCallCommittedCost,'bg-amber-500'],['On-call / verified actual',dashboard.kpis.onCallActualCost,'bg-emerald-500'],['Approved OT',dashboard.kpis.approvedOtCost,'bg-violet-500']].map(([label,value,color]) => <div key={String(label)}><div className="mb-1 flex justify-between text-sm"><span>{label}</span><strong>{peso(Number(value))}</strong></div><div className="h-3 rounded-full bg-gray-100 dark:bg-slate-700"><div className={`h-3 rounded-full ${color}`} style={{ width: `${Math.min(100, projectedTotal ? Number(value) / projectedTotal * 100 : 0)}%` }} /></div></div>)}<div className="border-t pt-3 text-sm dark:border-slate-700"><span className="text-gray-500">Projected / committed view</span><strong className="float-right">{peso(projectedTotal)}</strong></div></div></Card>
          <Card><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold text-gray-900 dark:text-white">Needs action</h2><p className="text-sm text-gray-500">Live operational exceptions from attendance and coverage.</p></div><span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700 dark:bg-red-950/50 dark:text-red-200">{dashboard.kpis.unfilledPositions + dashboard.kpis.sickCallIns}</span></div><div className="mt-4 space-y-3 text-sm">{dashboard.kpis.sickCallIns > 0 && <button type="button" onClick={() => setTab('daily')} className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-left dark:border-amber-900 dark:bg-amber-950/30"><span>Sick call-ins to cover</span><strong>{number(dashboard.kpis.sickCallIns)}</strong></button>}{dashboard.kpis.unfilledPositions > 0 && <button type="button" onClick={() => setTab('daily')} className="flex w-full items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-left dark:border-red-900 dark:bg-red-950/30"><span>Unfilled scheduled positions</span><strong>{number(dashboard.kpis.unfilledPositions)}</strong></button>}{dashboard.kpis.sickCallIns === 0 && dashboard.kpis.unfilledPositions === 0 && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">No unfilled positions or sick call-ins in this range.</p>}</div></Card>
        </div>
        <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-gray-900 dark:text-white">Event Notes</h2><p className="text-sm text-gray-500">Notes appear in Overview, Daily View and Daily Operations.</p></div>{access.canRequest && <Button variant="secondary" onClick={() => setShowEventForm(value => !value)}>{showEventForm ? 'Close' : '+ Add Event Note'}</Button>}</div>{showEventForm && <form onSubmit={saveEvent} className="mt-4 grid gap-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 dark:border-indigo-900 dark:bg-indigo-950/20 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm sm:col-span-2">Event name<input required value={eventForm.event_name} onChange={e => setEventForm({ ...eventForm, event_name: e.target.value })} className="mt-1 w-full rounded-lg border bg-white p-2 dark:border-slate-600 dark:bg-slate-900" /></label><label className="text-sm">Start<input type="date" required value={eventForm.start_date} onChange={e => setEventForm({ ...eventForm, start_date: e.target.value })} className="mt-1 w-full rounded-lg border bg-white p-2 dark:border-slate-600 dark:bg-slate-900" /></label><label className="text-sm">End<input type="date" required value={eventForm.end_date} onChange={e => setEventForm({ ...eventForm, end_date: e.target.value })} className="mt-1 w-full rounded-lg border bg-white p-2 dark:border-slate-600 dark:bg-slate-900" /></label><label className="text-sm">Location<input value={eventForm.location} onChange={e => setEventForm({ ...eventForm, location: e.target.value })} className="mt-1 w-full rounded-lg border bg-white p-2 dark:border-slate-600 dark:bg-slate-900" /></label><label className="text-sm">Expected attendance<input type="number" min="0" value={eventForm.expected_attendance} onChange={e => setEventForm({ ...eventForm, expected_attendance: e.target.value })} className="mt-1 w-full rounded-lg border bg-white p-2 dark:border-slate-600 dark:bg-slate-900" /></label><label className="text-sm">Staffing target<input type="number" min="0" value={eventForm.staffing_target} onChange={e => setEventForm({ ...eventForm, staffing_target: e.target.value })} className="mt-1 w-full rounded-lg border bg-white p-2 dark:border-slate-600 dark:bg-slate-900" /></label><label className="text-sm">Budget limit<input type="number" min="0" value={eventForm.budget_limit} onChange={e => setEventForm({ ...eventForm, budget_limit: e.target.value })} className="mt-1 w-full rounded-lg border bg-white p-2 dark:border-slate-600 dark:bg-slate-900" /></label><label className="text-sm">Priority<select value={eventForm.priority} onChange={e => setEventForm({ ...eventForm, priority: e.target.value })} className="mt-1 w-full rounded-lg border bg-white p-2 dark:border-slate-600 dark:bg-slate-900"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label><label className="text-sm sm:col-span-2 lg:col-span-3">Notes<textarea value={eventForm.notes} onChange={e => setEventForm({ ...eventForm, notes: e.target.value })} className="mt-1 w-full rounded-lg border bg-white p-2 dark:border-slate-600 dark:bg-slate-900" rows={2} /></label><div className="flex items-end"><Button type="submit" disabled={savingEvent}>{savingEvent ? 'Saving…' : 'Save event note'}</Button></div></form>}{dashboard.events.length > 0 ? <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{dashboard.events.map(event => <div key={event.id} className="rounded-xl border border-gray-200 p-4 dark:border-slate-700"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold text-gray-900 dark:text-white">{event.event_name}</p><p className="text-xs text-gray-500">{event.start_date} to {event.end_date}{event.location ? ` · ${event.location}` : ''}</p></div><span className="rounded-full bg-indigo-50 px-2 py-1 text-xs capitalize text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200">{event.priority}</span></div><p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{event.expected_attendance ? `${number(event.expected_attendance)} expected` : 'Attendance not set'}{event.staffing_target ? ` · target ${number(event.staffing_target)}` : ''}{event.budget_limit ? ` · ${peso(event.budget_limit)} limit` : ''}</p></div>)}</div> : <p className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-500 dark:bg-slate-800/60">No event notes in this range. Add a Big Event, School Holiday or Peak Weekend note to make staffing context visible.</p>}</Card>
      </>}
      {tab === 'daily' && <>
        <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-gray-900 dark:text-white">30-Day Daily View</h2><p className="text-sm text-gray-500">Click a day for Daily Manpower Operations.</p></div><span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold dark:bg-slate-700">{dashboard.daily.length} days</span></div><div className="mt-5 space-y-6">{weeks.map((week, index) => <section key={index}><h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">Week {index + 1}</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{week.map(day => <button type="button" key={day.date} onClick={() => { setSelectedDate(day.date); setTab('daily'); }} className={`rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow ${statusColor(day.coverageStatus)} ${selectedDate === day.date ? 'ring-2 ring-indigo-500' : ''}`}><div className="flex items-center justify-between"><span className="font-bold">{dayLabel(day.date)}</span><span className="text-xs font-semibold">{day.coverageStatus === 'Fully covered' ? '✓' : day.coverageStatus === 'Covered with on-call' ? '!' : '×'}</span></div><div className="mt-3 grid grid-cols-2 gap-1 text-xs"><span>Scheduled <b>{day.scheduled}</b></span><span>Reported <b>{day.reported}</b></span><span>Sick <b>{day.sick}</b></span><span>On-call <b>{number(day.onCall)}</b></span><span>Unfilled <b>{number(day.unfilled)}</b></span><span>Cost <b>{peso(day.actualCost || day.projectedCost)}</b></span></div>{day.events?.map(event => <p key={event.event_name} className="mt-2 truncate rounded bg-white/60 px-2 py-1 text-xs font-semibold dark:bg-black/20">{event.event_name}</p>)}</button>)}</div><div className="mt-3 grid gap-2 rounded-lg bg-gray-50 p-3 text-xs dark:bg-slate-800/70 sm:grid-cols-6"><span>Scheduled <b>{week.reduce((sum, d) => sum + d.scheduled, 0)}</b></span><span>Reported <b>{week.reduce((sum, d) => sum + d.reported, 0)}</b></span><span>Sick <b>{week.reduce((sum, d) => sum + d.sick, 0)}</b></span><span>On-call <b>{number(week.reduce((sum, d) => sum + d.onCall, 0))}</b></span><span>Unfilled <b>{number(week.reduce((sum, d) => sum + d.unfilled, 0))}</b></span><span>Cost <b>{peso(week.reduce((sum, d) => sum + (d.actualCost || d.projectedCost), 0))}</b></span></div></section>)}</div></Card>
        <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-gray-900 dark:text-white">Daily Manpower Operations</h2><p className="text-sm text-gray-500">{selectedDay ? dayLabel(selectedDay.date) : 'Choose a day above'}</p></div><div className="flex flex-wrap gap-2">{access.canRequest && <Button variant="secondary" onClick={() => navigate('/payroll/manpower-planning')}>Request On-Call</Button>}{access.canRequest && <Button variant="secondary" onClick={() => { setTab('overview'); setShowEventForm(true); }}>Add Event Note</Button>}<Button variant="secondary" onClick={() => navigate('/payroll/timekeeping')}>View Attendance</Button><Button variant="secondary" onClick={() => navigate('/payroll/payroll-prep')}>Open Payroll Details</Button><Button variant="secondary" onClick={() => setSelectedDate('')}>Back to Calendar</Button></div></div>{selectedDay && <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{[['Scheduled',selectedDay.scheduled],['Reported',selectedDay.reported],['Sick',selectedDay.sick],['On-call',number(selectedDay.onCall)],['Unfilled',number(selectedDay.unfilled)],['Actual cost',peso(selectedDay.actualCost)]].map(([label,value]) => <div key={String(label)} className="rounded-lg border p-3 dark:border-slate-700"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>)}</div>}{selectedDay?.events?.length ? <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm dark:border-indigo-900 dark:bg-indigo-950/30">{selectedDay.events.map(event => <span key={event.event_name} className="mr-3 font-semibold">{event.event_name}{event.location ? ` · ${event.location}` : ''}</span>)}</div> : null}<h3 className="mt-6 font-semibold">Coverage &amp; Replacement Board</h3>{dashboard.replacements.filter(row => !selectedDay || row.date === selectedDay.date).length ? <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b text-xs uppercase text-gray-500 dark:border-slate-700"><tr><th className="p-2">Absent employee</th><th className="p-2">Position / shift</th><th className="p-2">On-Call replacement</th><th className="p-2">Verified hours</th><th className="p-2">Cost</th><th className="p-2">Status</th></tr></thead><tbody>{dashboard.replacements.filter(row => !selectedDay || row.date === selectedDay.date).map(row => <tr key={row.id} className="border-b dark:border-slate-800"><td className="p-2">{row.absentEmployeeId || 'Open position'}</td><td className="p-2">{row.position}{row.shift ? ` · ${row.shift}` : ''}</td><td className="p-2">{row.replacementEmployeeId || 'Open position'}</td><td className="p-2">{row.hours || '—'}</td><td className="p-2">{row.cost ? peso(row.cost) : '—'}</td><td className="p-2"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs dark:bg-slate-700">{row.status}</span></td></tr>)}</tbody></table></div> : <p className="mt-3 rounded-lg bg-gray-50 p-4 text-sm text-gray-500 dark:bg-slate-800/60">No replacement records for this day. If a position is uncovered, use “Request On-Call” and the existing approval workflow.</p>}<div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><div className="rounded-lg border p-3"><p className="text-xs text-gray-500">Regular Manpower Cost</p><p className="font-bold">{selectedDay ? peso(selectedDay.regularCost) : '—'}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-gray-500">On-Call Replacement Cost</p><p className="font-bold">{selectedDay ? peso(selectedDay.replacementActualCost) : '—'}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-gray-500">Approved OT Cost</p><p className="font-bold">{peso(dashboard.kpis.approvedOtCost)}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-gray-500">Other HRIS manpower costs</p><p className="font-bold">Tracked in payroll</p></div><div className="rounded-lg border bg-indigo-50 p-3 dark:bg-indigo-950/30"><p className="text-xs text-gray-500">Daily Actual Manpower Cost</p><p className="font-bold">{selectedDay ? peso(selectedDay.actualCost) : '—'}</p></div></div></Card>
      </>}
      {tab === 'employees' && <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-gray-900 dark:text-white">Employee Cost</h2><p className="text-sm text-gray-500">Employee totals within your permitted scope. Cost status is shown on every row.</p></div><div className="flex items-center gap-2"><label className="text-sm">Sort by<select aria-label="Sort employee cost" value={employeeSort} onChange={e => setEmployeeSort(e.target.value as EmployeeSort)} className="ml-2 rounded-lg border border-gray-300 bg-transparent p-2 text-sm dark:border-slate-600"><option value="total">Highest total cost</option><option value="onCall">Highest on-call cost</option><option value="shifts">Most on-call shifts</option><option value="hours">Most on-call hours</option></select></label><Button variant="secondary" onClick={() => exportCsv('employees')}>Export CSV</Button></div></div><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b text-xs uppercase text-gray-500 dark:border-slate-700"><tr><th className="p-2">Employee</th><th className="p-2">Business Unit</th><th className="p-2">Department</th><th className="p-2">Regular cost</th><th className="p-2">On-call shifts</th><th className="p-2">On-call hours</th><th className="p-2">On-call cost</th><th className="p-2">OT</th><th className="p-2">Total</th><th className="p-2">Status</th></tr></thead><tbody>{sortedEmployees.map(row => <tr key={row.employeeId} className="border-b dark:border-slate-800"><td className="p-2 font-semibold">{row.employeeName}</td><td className="p-2">{row.businessUnit || '—'}</td><td className="p-2">{row.department || '—'}</td><td className="p-2">{peso(row.regularCost)}</td><td className="p-2">{number(row.onCallShifts)}</td><td className="p-2">{number(row.onCallHours)}</td><td className="p-2">{peso(row.onCallCost)}</td><td className="p-2">{peso(row.approvedOtCost)}</td><td className="p-2 font-bold">{peso(row.totalActualCost)}</td><td className="p-2"><span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{row.costStatus}</span></td></tr>)}</tbody></table>{sortedEmployees.length === 0 && <p className="p-6 text-center text-sm text-gray-500">No scheduled employees match this date range and permitted filters.</p>}</div></Card>}
      {tab === 'reports' && <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"><Card><h2 className="font-bold">Monthly employee on-call cost</h2><p className="mt-1 text-sm text-gray-500">Employee-level cost and verified hours for the selected range.</p><Button className="mt-4" onClick={() => exportCsv('employees')}>Download CSV</Button></Card><Card><h2 className="font-bold">Daily manpower cost</h2><p className="mt-1 text-sm text-gray-500">Scheduled, reported, sick, coverage and cost by day.</p><Button className="mt-4" onClick={() => exportCsv('daily')}>Download CSV</Button></Card><Card><h2 className="font-bold">Sick-call replacement report</h2><p className="mt-1 text-sm text-gray-500">Absent positions, replacements, verified hours and status.</p><Button className="mt-4" onClick={() => exportCsv('replacements')}>Download CSV</Button></Card><Card><h2 className="font-bold">On-call utilization report</h2><p className="mt-1 text-sm text-gray-500">Approved and verified replacement usage for the selected range.</p><Button className="mt-4" onClick={() => exportCsv('replacements')}>Download CSV</Button></Card><Card><h2 className="font-bold">Event staffing and cost</h2><p className="mt-1 text-sm text-gray-500">Event notes, attendance targets, staffing targets and budgets.</p><Button className="mt-4" onClick={() => exportCsv('events')}>Download CSV</Button></Card><Card><h2 className="font-bold">Unfilled-position report</h2><p className="mt-1 text-sm text-gray-500">Coverage gaps by day, status and actual/projected cost.</p><Button className="mt-4" onClick={() => exportCsv('daily')}>Download CSV</Button></Card></div>}
    </>}
  </div>;
};

export default OnCallManpowerCost;
