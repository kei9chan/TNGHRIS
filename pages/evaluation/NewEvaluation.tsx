import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { User, EvaluatorConfig, EvaluatorType, EvaluatorGroupFilter, Permission } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import { logActivity } from '../../services/auditService';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabaseClient';
import { formatEmployeeName } from '../../services/formatEmployeeName';
import { createEvaluationCycle } from '../../services/evaluationService';
import { buildEvaluationYearOptions, EvaluationTimelineOption, loadEvaluationTimelines } from '../../services/evaluationTimelineService';

// Icons
const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>;
const UsersIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" /></svg>;

const NewEvaluation: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions();
  const canManage = can('Evaluation', Permission.Manage);
  const [evaluationName, setEvaluationName] = useState('');
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [selectedBuIds, setSelectedBuIds] = useState<string[]>([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [timelineType, setTimelineType] = useState<'Monthly' | 'Quarterly' | 'Onboarding' | 'Annual'>('Monthly');
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [timelineId, setTimelineId] = useState('');
  const [selectedQuestionSets, setSelectedQuestionSets] = useState<string[]>([]);
  const [evaluators, setEvaluators] = useState<EvaluatorConfig[]>([]);
  const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string; }[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string; businessUnitId?: string | null; }[]>([]);
  const [timelines, setTimelines] = useState<EvaluationTimelineOption[]>([]);
  const [questionSets, setQuestionSets] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const requestKeyRef = useRef(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `evaluation-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  // Show all business units for targeting (not scoped to user access)
  const accessibleBus = businessUnits;

  useEffect(() => {
    const loadLookups = async () => {
      setError(null);
      const [{ data: buData }, { data: empData }, { data: qsData }, { data: deptData }] = await Promise.all([
        supabase.from('business_units').select('id, name').order('name'),
        supabase.from('hris_users').select('id, full_name, email, auth_user_id, role, status, business_unit, business_unit_id, department, department_id, position'),
        supabase.from('evaluation_question_sets').select('*').order('name'),
        supabase.from('departments').select('id, name, business_unit_id'),
      ]);
      setBusinessUnits((buData || []).map((b: any) => ({ id: b.id, name: b.name || 'Unknown BU' })));
      setEmployees((empData || []).map((u: any) => ({
        id: u.id,
        name: formatEmployeeName(u.full_name || 'Unknown'),
        email: u.email || '',
        authUserId: u.auth_user_id || undefined,
        role: u.role,
        department: u.department || '',
        businessUnit: u.business_unit || '',
        departmentId: u.department_id || undefined,
        businessUnitId: u.business_unit_id || undefined,
        status: u.status || 'Active',
        employmentStatus: undefined,
        isPhotoEnrolled: false,
        dateHired: new Date(),
        position: u.position || '',
        managerId: undefined,
        activeDeviceId: undefined,
        isGoogleConnected: false,
        profilePictureUrl: undefined,
        signatureUrl: undefined,
      } as User)));
      setQuestionSets(qsData || []);
      setDepartments((deptData || []).map((d: any) => ({ id: d.id, name: d.name, businessUnitId: d.business_unit_id })));
    };
    loadLookups();
  }, []);

  useEffect(() => {
    let active = true;
    const selectedYear = Number(year);
    if (!Number.isInteger(selectedYear)) return;

    const refreshTimelines = async () => {
      try {
        const loaded = await loadEvaluationTimelines(selectedYear);
        if (active) setTimelines(loaded);
      } catch (timelineError: any) {
        if (active) setError(timelineError?.message || 'Failed to load evaluation timelines.');
      }
    };

    const handleTimelinesChanged = () => {
      void refreshTimelines();
    };

    void refreshTimelines();
    window.addEventListener('evaluation-timelines-changed', handleTimelinesChanged);
    return () => {
      active = false;
      window.removeEventListener('evaluation-timelines-changed', handleTimelinesChanged);
    };
  }, [year]);

  const handleBuChange = (buId: string) => {
    const newSelectedBuIds = selectedBuIds.includes(buId)
      ? selectedBuIds.filter(id => id !== buId)
      : [...selectedBuIds, buId];
    setSelectedBuIds(newSelectedBuIds);
    // Reset employee selection when BUs change
    setSelectedEmployeeIds([]);
  };

  const employeesInSelectedBUs = useMemo(() => {
    const buNames = new Set(businessUnits.filter(b => selectedBuIds.includes(b.id)).map(b => b.name));
    if (selectedBuIds.length === 0) return employees;
    return employees.filter(u => selectedBuIds.includes(u.businessUnitId || '') || buNames.has(u.businessUnit));
  }, [selectedBuIds, employees, businessUnits]);

  const searchedEmployees = useMemo(() => {
    if (!employeeSearch) return employeesInSelectedBUs;
    return employeesInSelectedBUs.filter(e => e.name.toLowerCase().includes(employeeSearch.toLowerCase()));
  }, [employeesInSelectedBUs, employeeSearch]);


  const handleEmployeeSelection = (employeeId: string) => {
    setSelectedEmployeeIds(prev =>
      prev.includes(employeeId) ? prev.filter(id => id !== employeeId) : [...prev, employeeId]
    );
  };

  const handleSelectAllEmployees = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedEmployeeIds(searchedEmployees.map(e => e.id));
    } else {
      setSelectedEmployeeIds([]);
    }
  };


  const timelinesByType = useMemo(() => {
    const selectedYear = Number(year);
    const available = timelines.filter(timeline => timeline.year === selectedYear);
    return {
      Monthly: available.filter(timeline => timeline.type === 'Monthly'),
      Quarterly: available.filter(timeline => timeline.type === 'Quarterly'),
      Onboarding: available.filter(timeline => timeline.type === 'Onboarding'),
      Annual: available.filter(timeline => timeline.type === 'Annual'),
    };
  }, [year, timelines]);

  const monthlyTimelines = timelinesByType.Monthly;
  const quarterlyTimelines = timelinesByType.Quarterly;
  const onboardingTimelines = timelinesByType.Onboarding;
  const annualTimelines = timelinesByType.Annual;
  const yearOptions = useMemo(() => buildEvaluationYearOptions(timelines, Number(year)), [timelines, year]);

  const currentTimelineOptions = useMemo(() => {
    if (timelineType === 'Monthly') return monthlyTimelines;
    if (timelineType === 'Quarterly') return quarterlyTimelines;
    if (timelineType === 'Onboarding') return onboardingTimelines;
    if (timelineType === 'Annual') return annualTimelines;
    return [];
  }, [timelineType, monthlyTimelines, quarterlyTimelines, onboardingTimelines, annualTimelines]);

  // Auto-select first available timeline when type/year changes
  useEffect(() => {
    const selectedStillAvailable = currentTimelineOptions.some(option => option.id === timelineId);
    setTimelineId(selectedStillAvailable ? timelineId : (currentTimelineOptions[0]?.id || ''));
  }, [timelineType, year, currentTimelineOptions, timelineId]);


  const handleQuestionSetChange = (setId: string) => {
    setSelectedQuestionSets(prev =>
      prev.includes(setId) ? prev.filter(id => id !== setId) : [...prev, setId]
    );
  };

  const totalWeight = useMemo(() => evaluators.reduce((sum, e) => sum + (e.weight || 0), 0), [evaluators]);

  const handleAddEvaluator = (type: EvaluatorType) => {
    const newConfig: EvaluatorConfig = {
      id: `ev-${Date.now()}`,
      type: type,
      weight: 0,
      userId: '',
      groupFilter: type === EvaluatorType.Group ? { businessUnitId: '' } : undefined,
      isAnonymous: false,
      excludeSubject: true
    };
    setEvaluators([...evaluators, newConfig]);
  };

  const handleEvaluatorChange = (index: number, field: keyof EvaluatorConfig, value: any) => {
    const newEvaluators = [...evaluators];
    if (field === 'weight') {
      const weightValue = parseInt(value, 10);
      newEvaluators[index].weight = isNaN(weightValue) ? 0 : weightValue;
    } else {
      // @ts-ignore - dynamic assignment
      newEvaluators[index][field] = value;
    }
    setEvaluators(newEvaluators);
  };

  const handleGroupFilterChange = (index: number, field: keyof EvaluatorGroupFilter, value: string) => {
    const newEvaluators = [...evaluators];
    if (!newEvaluators[index].groupFilter) {
      newEvaluators[index].groupFilter = {};
    }
    // @ts-ignore
    newEvaluators[index].groupFilter[field] = value;
    setEvaluators(newEvaluators);
  };

  const handleRemoveEvaluator = (index: number) => {
    const newEvaluators = evaluators.filter((_, i) => i !== index);
    setEvaluators(newEvaluators);
  };

  const createEvaluation = async () => {
    const timelineToUse =
      timelineId ||
      (currentTimelineOptions.length > 0 ? currentTimelineOptions[0].id : '');
    const targetEmployeeIds =
      selectedEmployeeIds.length > 0
        ? selectedEmployeeIds
        : employeesInSelectedBUs.map(e => e.id);

    if (!evaluationName.trim()) {
      alert('Please provide a name for this evaluation.');
      return;
    }
    if (evaluators.length === 0) {
      alert('Please assign at least one evaluator.');
      return;
    }
    if (evaluators.length > 0 && totalWeight !== 100) {
      alert('Total weight for evaluators must be exactly 100.');
      return;
    }
    if (targetEmployeeIds.length === 0 || !timelineToUse) {
      alert('Please select at least one employee and a timeline.');
      return;
    }
    if (!dueDate) {
      alert('Please set an evaluation deadline.');
      return;
    }

    // Validation for Group Evaluators
    for (const ev of evaluators) {
      if (ev.type === EvaluatorType.Group) {
        if (!ev.groupFilter?.businessUnitId && !ev.groupFilter?.departmentId) {
          alert('All Group Evaluators must have at least a Business Unit selected.');
          return;
        }
      } else if (ev.type === EvaluatorType.Individual && !ev.userId) {
        alert('All Individual Evaluators must have a user selected.');
        return;
      }
    }

    setIsSaving(true);
    setError(null);
    try {
      const evaluationId = await createEvaluationCycle({
        name: evaluationName,
        timelineId: timelineToUse || null,
        targetBusinessUnitIds: selectedBuIds,
        targetEmployeeIds,
        questionSetIds: selectedQuestionSets,
        evaluators,
        dueDate,
        requestKey: requestKeyRef.current,
      });

      await logActivity(
        user,
        'CREATE',
        'Evaluation',
        evaluationId,
        `Created new evaluation cycle: ${evaluationName} targeting ${targetEmployeeIds.length} employees.`
      );
      alert('Evaluation created successfully!');
      navigate('/evaluation/reviews');
    } catch (createError: any) {
      setError(createError?.message || 'Failed to create evaluation.');
    } finally {
      setIsSaving(false);
    }
  };

  const availableEvaluators = useMemo(() => {
    // Filter out already selected INDIVIDUAL evaluators
    const selectedIds = new Set(evaluators.filter(e => e.type === EvaluatorType.Individual && e.userId).map(e => e.userId));
    return employees.filter(u => u.status === 'Active' && !selectedIds.has(u.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [evaluators, employees]);

  const getGroupEmployeeCount = (filter?: EvaluatorGroupFilter) => {
    if (!filter?.businessUnitId) return 0;
    const buName = businessUnits.find(b => b.id === filter.businessUnitId)?.name;
    const deptName = filter.departmentId ? departments.find(d => d.id === filter.departmentId)?.name : undefined;

    return employees.filter(u => {
      if (u.status !== 'Active') return false;
      if (u.businessUnit !== buName && u.businessUnitId !== filter.businessUnitId) return false;
      if (deptName && u.department !== deptName && u.departmentId !== filter.departmentId) return false;
      return true;
    }).length;
  };

  return (
    <div className="space-y-6">
      {!canManage && (
        <Card>
          <div className="p-6 text-center text-gray-600 dark:text-gray-300">
            You do not have permission to create or view evaluations.
          </div>
        </Card>
      )}
      {canManage && (
        <>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Create New Evaluation</h1>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <Card>
            <div className="space-y-6">
              {/* Evaluation Name */}
              <div>
                <Input
                  label="Evaluation Name"
                  id="evaluationName"
                  value={evaluationName}
                  onChange={e => setEvaluationName(e.target.value)}
                  placeholder="e.g., Q1 Performance Review - Operations"
                  required
                />
                <div className="mt-4">
                  <Input
                    label="Evaluation Deadline"
                    id="dueDate"
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    required
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Evaluators must complete their reviews by this date.</p>
                </div>
              </div>
              {/* Business Units */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Target Business Units</h3>
                <div className="mt-2 p-4 border border-gray-200 rounded-md dark:border-gray-700 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 bg-gray-50 dark:bg-slate-900/50">
                  {accessibleBus.map(bu => (
                    <div key={bu.id} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`bu-${bu.id}`}
                        checked={selectedBuIds.includes(bu.id)}
                        onChange={() => handleBuChange(bu.id)}
                        className="h-4 w-4 text-violet-600 border-gray-300 dark:border-gray-500 rounded focus:ring-violet-500"
                      />
                      <label htmlFor={`bu-${bu.id}`} className="ml-2 text-sm text-gray-700 dark:text-gray-300">{bu.name}</label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Employees */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Employees</h3>
                <div className="mt-2 p-4 border border-gray-200 rounded-md dark:border-gray-700 space-y-3 bg-gray-50 dark:bg-slate-900/50">
                  <Input
                    label=""
                    id="employee-search"
                    placeholder="Search employees in selected BUs..."
                    value={employeeSearch}
                    onChange={e => setEmployeeSearch(e.target.value)}
                    disabled={selectedBuIds.length === 0}
                  />
                  <div className="border border-gray-200 rounded-md dark:border-gray-700 max-h-60 overflow-y-auto bg-white dark:bg-slate-900">
                    {employeesInSelectedBUs.length > 0 ? (
                      <>
                        <div className="p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-800/50 sticky top-0">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id="select-all-employees"
                              checked={searchedEmployees.length > 0 && selectedEmployeeIds.length === searchedEmployees.length}
                              onChange={handleSelectAllEmployees}
                              className="h-4 w-4 text-violet-600 border-gray-300 dark:border-gray-500 rounded focus:ring-violet-500"
                            />
                            <label htmlFor="select-all-employees" className="ml-2 text-sm font-medium">Select All ({searchedEmployees.length})</label>
                          </div>
                        </div>
                        <div className="p-2 space-y-1">
                          {searchedEmployees.map(employee => (
                            <div key={employee.id} className="flex items-center">
                              <input
                                type="checkbox"
                                id={`emp-${employee.id}`}
                                checked={selectedEmployeeIds.includes(employee.id)}
                                onChange={() => handleEmployeeSelection(employee.id)}
                                className="h-4 w-4 text-violet-600 border-gray-300 dark:border-gray-500 rounded focus:ring-violet-500"
                              />
                              <label htmlFor={`emp-${employee.id}`} className="ml-2 text-sm">{employee.name}</label>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="h-24 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                        No employees found in selected business units
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Timeline Type */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Timeline Type</h3>
                <div className="mt-2 flex flex-wrap gap-4">
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="monthly"
                      name="timelineType"
                      value="Monthly"
                      checked={timelineType === 'Monthly'}
                      onChange={() => { setTimelineType('Monthly'); setTimelineId(''); }}
                      className="h-4 w-4 text-violet-600 border-gray-300 dark:border-gray-500 focus:ring-violet-500"
                    />
                    <label htmlFor="monthly" className="ml-2 text-sm">Monthly Evaluation</label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="quarterly"
                      name="timelineType"
                      value="Quarterly"
                      checked={timelineType === 'Quarterly'}
                      onChange={() => { setTimelineType('Quarterly'); setTimelineId(''); }}
                      className="h-4 w-4 text-violet-600 border-gray-300 dark:border-gray-500 focus:ring-violet-500"
                    />
                    <label htmlFor="quarterly" className="ml-2 text-sm">Quarterly Evaluation</label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="onboarding"
                      name="timelineType"
                      value="Onboarding"
                      checked={timelineType === 'Onboarding'}
                      onChange={() => { setTimelineType('Onboarding'); setTimelineId(''); }}
                      className="h-4 w-4 text-violet-600 border-gray-300 dark:border-gray-500 focus:ring-violet-500"
                    />
                    <label htmlFor="onboarding" className="ml-2 text-sm">Onboarding Evaluation</label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="annual"
                      name="timelineType"
                      value="Annual"
                      checked={timelineType === 'Annual'}
                      onChange={() => { setTimelineType('Annual'); setTimelineId(''); }}
                      className="h-4 w-4 text-violet-600 border-gray-300 dark:border-gray-500 focus:ring-violet-500"
                    />
                    <label htmlFor="annual" className="ml-2 text-sm">Annual Evaluation</label>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="evaluation-year" className="block text-sm font-medium">Year</label>
                    <select
                      id="evaluation-year"
                      value={year}
                      onChange={event => { setYear(event.target.value); setTimelineId(''); }}
                      className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white sm:text-sm"
                    >
                      {yearOptions.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="evaluation-timeline" className="block text-sm font-medium">
                      {timelineType === 'Monthly' ? 'Month' : timelineType === 'Quarterly' ? 'Quarter' : timelineType === 'Onboarding' ? 'Onboarding Timeline' : 'Annual Timeline'}
                    </label>
                    <select
                      id="evaluation-timeline"
                      value={timelineId}
                      onChange={event => setTimelineId(event.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white sm:text-sm"
                    >
                      <option value="">-- Select Timeline --</option>
                      {currentTimelineOptions.map(timeline => (
                        <option key={timeline.id} value={timeline.id}>
                          {timeline.periodLabel} ({timeline.rolloutDate.toLocaleDateString()} – {timeline.endDate.toLocaleDateString()})
                        </option>
                      ))}
                    </select>
                    {currentTimelineOptions.length === 0 && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">No timeline is available for this type and year.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Question Sets */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Question Sets (Optional)</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Select question sets to automatically load questions for this evaluation</p>
                <div className="mt-2 p-4 border border-gray-200 rounded-md dark:border-gray-700 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 dark:bg-slate-900/50">
                  {questionSets.map((set: any) => (
                    <div key={set.id} className="flex items-start">
                      <input
                        type="checkbox"
                        id={`set-${set.id}`}
                        checked={selectedQuestionSets.includes(set.id)}
                        onChange={() => handleQuestionSetChange(set.id)}
                        className="h-4 w-4 text-violet-600 border-gray-300 dark:border-gray-500 rounded focus:ring-violet-500 mt-1"
                      />
                      <div className="ml-2">
                        <label htmlFor={`set-${set.id}`} className="text-sm font-medium text-gray-700 dark:text-gray-300">{set.name}</label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{set.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Evaluators */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Evaluators</h3>
                <div className="mt-2 space-y-3">
                  {evaluators.map((evaluator, index) => {
                    const currentUserForDropdown = employees.find(u => u.id === evaluator.userId);
                    return (
                      <div key={evaluator.id} className="flex flex-col sm:flex-row sm:items-start gap-4 p-4 bg-gray-50 dark:bg-slate-900/50 rounded-md border dark:border-slate-700">
                        <div className="flex-grow space-y-3">
                          <div className="flex justify-between items-center">
                            <label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                              {evaluator.type === EvaluatorType.Individual ? <UserIcon /> : <UsersIcon />}
                              {evaluator.type === EvaluatorType.Individual ? 'Individual Evaluator' : 'Group Evaluator'}
                            </label>
                            <Button variant="danger" size="sm" onClick={() => handleRemoveEvaluator(index)}>Remove</Button>
                          </div>

                          {evaluator.type === EvaluatorType.Individual ? (
                            <div>
                              <select
                                value={evaluator.userId || ''}
                                onChange={(e) => handleEvaluatorChange(index, 'userId', e.target.value)}
                                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                              >
                                <option value="">-- Select an evaluator --</option>
                                {currentUserForDropdown && <option value={currentUserForDropdown.id}>{currentUserForDropdown.name}</option>}
                                {availableEvaluators.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                              </select>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-gray-500 uppercase">Business Unit</label>
                                  <select
                                    value={evaluator.groupFilter?.businessUnitId || ''}
                                    onChange={(e) => handleGroupFilterChange(index, 'businessUnitId', e.target.value)}
                                    className="mt-1 block w-full pl-3 pr-10 py-2 text-sm border-gray-300 rounded-md dark:bg-slate-700 dark:border-slate-600"
                                  >
                                    <option value="">-- Select BU --</option>
                                    {accessibleBus.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-500 uppercase">Department (Optional)</label>
                                  <select
                                    value={evaluator.groupFilter?.departmentId || ''}
                                    onChange={(e) => handleGroupFilterChange(index, 'departmentId', e.target.value)}
                                    disabled={!evaluator.groupFilter?.businessUnitId}
                                    className="mt-1 block w-full pl-3 pr-10 py-2 text-sm border-gray-300 rounded-md dark:bg-slate-700 dark:border-slate-600 disabled:opacity-50"
                                  >
                                    <option value="">-- All Departments --</option>
                                    {departments
                                      .filter(d => d.businessUnitId === evaluator.groupFilter?.businessUnitId)
                                      .map(d => <option key={d.id} value={d.id}>{d.name}</option>)
                                    }
                                  </select>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-4 items-center">
                                <div className="flex items-center">
                                  <input
                                    type="checkbox"
                                    id={`anon-${index}`}
                                    checked={evaluator.isAnonymous}
                                    onChange={(e) => handleEvaluatorChange(index, 'isAnonymous', e.target.checked)}
                                    className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                                  />
                                  <label htmlFor={`anon-${index}`} className="ml-2 text-sm text-gray-600 dark:text-gray-400">Anonymous Feedback</label>
                                </div>
                                <div className="flex items-center">
                                  <input
                                    type="checkbox"
                                    id={`exclude-${index}`}
                                    checked={evaluator.excludeSubject}
                                    onChange={(e) => handleEvaluatorChange(index, 'excludeSubject', e.target.checked)}
                                    className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                                  />
                                  <label htmlFor={`exclude-${index}`} className="ml-2 text-sm text-gray-600 dark:text-gray-400">Exclude Subject from Group</label>
                                </div>
                              </div>
                              <div className="text-xs text-gray-500 font-medium">
                                Matching Employees: {getGroupEmployeeCount(evaluator.groupFilter)}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="w-full sm:w-32 flex-shrink-0">
                          <Input
                            label="Weight (%)"
                            type="number"
                            min="0"
                            max="100"
                            value={evaluator.weight}
                            onChange={(e) => handleEvaluatorChange(index, 'weight', e.target.value)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex justify-between items-center">
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => handleAddEvaluator(EvaluatorType.Individual)}>+ Add Individual</Button>
                    <Button variant="secondary" onClick={() => handleAddEvaluator(EvaluatorType.Group)}>+ Add Group</Button>
                  </div>
                  {evaluators.length > 0 && (
                    <div className={`text-lg font-bold ${totalWeight !== 100 ? 'text-red-500' : 'text-green-500'}`}>
                      Total Weight: {totalWeight} / 100
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button variant="secondary" onClick={() => navigate('/evaluation/reviews')}>Cancel</Button>
                <Button onClick={createEvaluation} disabled={isSaving || evaluators.length === 0 || totalWeight !== 100}>
                  {isSaving ? 'Creating…' : 'Create Evaluation'}
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default NewEvaluation;
