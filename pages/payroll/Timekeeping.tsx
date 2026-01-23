
import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { ShiftTemplate, ShiftAssignment, User, LeaveRequest, LeaveRequestStatus, Permission, OperatingHours, Role, DayTypeTier, StaffingRequirement, ServiceArea } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import ShiftDetailModal, { EnrichedAssignmentDetail } from '../../components/payroll/ShiftDetailModal';
import ShiftTemplateModal from '../../components/payroll/ShiftTemplateModal';
import ShiftAssignmentDrawer from '../../components/payroll/ShiftAssignmentDrawer';
import OperatingHoursModal from '../../components/payroll/OperatingHoursModal';
import Toast from '../../components/ui/Toast';
import RoleViewTable from '../../components/payroll/RoleViewTable';
import TimelineView from '../../components/payroll/TimelineView';
import LiveShiftStatusDashboard from '../../components/payroll/LiveShiftStatusDashboard';
import { logActivity } from '../../services/auditService';
import { supabase } from '../../services/supabaseClient';

// --- Helper Types ---
interface Gap {
    date: Date;
    role: string;
    areaId: string;
    areaName: string;
    required: number;
    scheduled: number;
    missing: number;
    dayType: DayTypeTier;
    shiftTime?: { start: string; end: string };
}

const getStartOfWeek = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  d.setHours(0, 0, 0, 0);
  return new Date(d.setDate(diff));
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const dayKeys = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatDateRange = (start: Date, end: Date): string => {
    const startMonth = start.toLocaleString('default', { month: 'short' });
    const endMonth = end.toLocaleString('default', { month: 'short' });
    const startDay = start.getDate();
    const endDay = end.getDate();
    const year = start.getFullYear();

    if (startMonth === endMonth) {
        return `${startMonth} ${startDay}-${endDay}, ${year}`;
    } else {
        return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
    }
};

// Mock Demand Logic (Phase 2 Simulation)
const getDayType = (date: Date): DayTypeTier => {
    const day = date.getDay(); // 0 = Sun, 6 = Sat
    if (day === 6) return DayTypeTier.SuperPeak; // Saturday
    if (day === 0 || day === 5) return DayTypeTier.Peak; // Sun, Fri
    return DayTypeTier.OffPeak; // Mon-Thu
};

const PencilIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
const WarningIcon: React.FC<{ tooltip: string }> = ({ tooltip }) => (
    <div className="relative group">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.763-1.36 2.724-1.36 3.486 0l5.58 9.92c.763 1.36-.217 3.03-1.742 3.03H4.42c-1.525 0-2.505-1.67-1.742-3.03l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <div className="absolute bottom-full mb-2 w-max max-w-xs bg-gray-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 -translate-x-1/2 left-1/2">
            {tooltip}
        </div>
    </div>
);
const ChevronDownIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>;
const ViewGridIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>;
const ViewListIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12M8.25 17.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 17.25h.007v.008H3.75v-2.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>;
const ChartBarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>;
const SparklesIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>;
const RectangleGroupIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 0 1-1.125-1.125v-3.75ZM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-8.25ZM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-2.25Z" /></svg>;
const ClipboardIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>;

const Timekeeping: React.FC = () => {
    const { user } = useAuth();
    const { can, getAccessibleBusinessUnits } = usePermissions();
    
    const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
    const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [businessUnits, setBusinessUnits] = useState<{ id: string; name?: string; code?: string; color?: string }[]>([]);
    const [departments, setDepartments] = useState<{ id: string; name: string; businessUnitId: string }[]>([]);
    const [employees, setEmployees] = useState<User[]>([]);
    const [serviceAreas, setServiceAreas] = useState<ServiceArea[]>([]);
    const [staffingRequirements, setStaffingRequirements] = useState<StaffingRequirement[]>([]);
    
    const [viewDate, setViewDate] = useState(new Date());
    const [view, setView] = useState<'grid' | 'role' | 'area' | 'timeline'>('grid');
    const [scheduleStatus, setScheduleStatus] = useState<'published' | 'dirty'>('published');
    const [toastInfo, setToastInfo] = useState<{ show: boolean; message: string }>({ show: false, message: '' });

    useEffect(() => {
        const loadReferenceData = async () => {
            const [buRes, deptRes, usersRes, templateRes] = await Promise.all([
                supabase.from('business_units').select('*'),
                supabase.from('departments').select('id, name, business_unit_id'),
                supabase.from('hris_users').select('id, full_name, email, role, status, business_unit, business_unit_id, department, department_id, position, date_hired, reports_to'),
                supabase.from('shift_templates').select('id, name, start_time, end_time, break_minutes, business_unit_id, is_night_shift'),
            ]);

            if (!buRes.error && buRes.data) {
                setBusinessUnits(buRes.data.map((row: any) => ({
                    id: row.id,
                    name: row.name || row.code || row.id,
                    code: row.code || undefined,
                    color: row.color || undefined,
                })));
            }

            if (!deptRes.error && deptRes.data) {
                setDepartments(deptRes.data.map((row: any) => ({
                    id: row.id,
                    name: row.name,
                    businessUnitId: row.business_unit_id,
                })));
            }

            if (!usersRes.error && usersRes.data) {
                setEmployees(usersRes.data.map((row: any) => ({
                    id: row.id,
                    name: row.full_name || row.email || 'Unknown',
                    email: row.email || '',
                    role: row.role || Role.Employee,
                    department: row.department || '',
                    businessUnit: row.business_unit || '',
                    departmentId: row.department_id || undefined,
                    businessUnitId: row.business_unit_id || undefined,
                    reportsTo: row.reports_to || undefined,
                    status: row.status === 'Inactive' ? 'Inactive' : 'Active',
                    isPhotoEnrolled: false,
                    dateHired: row.date_hired ? new Date(row.date_hired) : new Date(),
                    position: row.position || '',
                } as User)));
            }

            if (!templateRes.error && templateRes.data) {
                setTemplates(templateRes.data.map((row: any) => ({
                    id: row.id,
                    name: row.name,
                    startTime: row.start_time,
                    endTime: row.end_time,
                    breakMinutes: row.break_minutes ?? 0,
                    gracePeriodMinutes: 0,
                    businessUnitId: row.business_unit_id || '',
                    color: 'blue',
                    isFlexible: false,
                })));
            }

        };

        loadReferenceData();
    }, []);

    // --- Permission Logic ---
    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(businessUnits as any), [user, getAccessibleBusinessUnits, businessUnits]);
    const [selectedBuId, setSelectedBuId] = useState<string>('all');
    const [departmentFilter, setDepartmentFilter] = useState<string>('all');

    const canView = useMemo(() => can('Timekeeping', Permission.View), [can]);

    useEffect(() => {
        if (accessibleBus.length === 0) {
            return;
        }
        if (selectedBuId === 'all') {
            return;
        }
        if (!accessibleBus.find(b => b.id === selectedBuId)) {
            // Default to the first accessible BU if current selection is invalid or empty
            setSelectedBuId(accessibleBus[0].id);
        }
    }, [accessibleBus, selectedBuId]);

    useEffect(() => {
        const loadWorkforcePlanningData = async () => {
            if (!selectedBuId) return;
            const areaQuery = supabase
                .from('service_areas')
                .select('id, business_unit_id, name, capacity, description');
            const reqQuery = supabase
                .from('staffing_requirements')
                .select('id, area_id, business_unit_id, day_type_tier, role, min_count, start_time, end_time');

            if (selectedBuId !== 'all') {
                areaQuery.eq('business_unit_id', selectedBuId);
                reqQuery.eq('business_unit_id', selectedBuId);
            }

            const [areaRes, reqRes] = await Promise.all([areaQuery, reqQuery]);

            if (!areaRes.error && areaRes.data) {
                setServiceAreas(areaRes.data.map((row: any) => ({
                    id: row.id,
                    businessUnitId: row.business_unit_id,
                    name: row.name,
                    capacity: row.capacity ?? 0,
                    description: row.description || undefined,
                })));
            } else {
                setServiceAreas([]);
            }

            if (!reqRes.error && reqRes.data) {
                setStaffingRequirements(reqRes.data.map((row: any) => ({
                    id: row.id,
                    areaId: row.area_id,
                    role: row.role,
                    dayTypeTier: row.day_type_tier as DayTypeTier,
                    minCount: row.min_count ?? 1,
                    startTime: row.start_time || undefined,
                    endTime: row.end_time || undefined,
                })));
            } else {
                setStaffingRequirements([]);
            }
        };

        loadWorkforcePlanningData();
    }, [selectedBuId]);

    const canEditOwnBU = useMemo(() => user ? user.role === Role.BusinessUnitManager : false, [user]);
    const userBu = useMemo(() => {
        if (!user) return undefined;
        return businessUnits.find(bu => bu.id === user.businessUnitId) ?? businessUnits.find(bu => bu.name === user.businessUnit);
    }, [user, businessUnits]);
    const userBuId = useMemo(() => userBu?.id, [userBu]);

    // Special Department Manager Logic
    const isSpecialDeptManager = useMemo(() => {
        if (!user) return false;
        const specialDepartments = ['Marketing', 'Finance', 'Finance and Accounting', 'Human Resources'];
        return user.role === Role.Manager && user.department && specialDepartments.includes(user.department);
    }, [user]);

    const isScheduleEditable = useMemo(() => {
        if (!user) return false;
        if (can('Timekeeping', Permission.Edit)) return true;
        // Fallback for BUM who might not have generic 'Edit' perm on global Timekeeping but owns their BU
        if (canEditOwnBU && selectedBuId === userBuId) return true;
        // Allow special department managers to edit
        if (isSpecialDeptManager) return true;
        return false;
    }, [user, userBuId, canEditOwnBU, selectedBuId, can, isSpecialDeptManager]);
    // --- End Permission Logic ---

    // Business Hours state
    const [operatingHours, setOperatingHours] = useState<OperatingHours | null>(null);
    const [isHoursModalOpen, setIsHoursModalOpen] = useState(false);

    const toDateOnly = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };


    // Drawer for assigning shifts
    const [drawerState, setDrawerState] = useState<{ open: boolean; employee: User | null; date: Date | null }>({ open: false, employee: null, date: null });
    // Modal for viewing assigned shift details
    const [detailModalState, setDetailModalState] = useState<{ open: boolean; assignment: ShiftAssignment | null }>({ open: false, assignment: null });
    // Modal for editing/creating shift templates (presets)
    const [templateModalState, setTemplateModalState] = useState<{ open: boolean; template: ShiftTemplate | null }>({ open: false, template: null });

    const [suggestedAssignments, setSuggestedAssignments] = useState<ShiftAssignment[]>([]);
    
    const weekStart = getStartOfWeek(viewDate);
    const weekDates = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

    // Fetch operating hours for the selected BU
    useEffect(() => {
        if (!selectedBuId || selectedBuId === 'all') {
            setOperatingHours(null);
            return;
        }

        const loadHours = async () => {
            const { data, error } = await supabase
                .from('operating_hours')
                .select('day_of_week, open_time, close_time')
                .eq('business_unit_id', selectedBuId);

            if (error || !data) {
                setOperatingHours(null);
                return;
            }

            const hours: OperatingHours['hours'] = {};
            dayKeys.forEach((day) => {
                hours[day] = { open: '00:00', close: '00:00' };
            });

            data.forEach((row: any) => {
                const key = dayKeys[row.day_of_week];
                if (key) {
                    hours[key] = {
                        open: (row.open_time || '00:00').toString().slice(0, 5),
                        close: (row.close_time || '00:00').toString().slice(0, 5),
                    };
                }
            });

            setOperatingHours({ businessUnitId: selectedBuId, hours });
        };

        loadHours();
    }, [selectedBuId]);

    useEffect(() => {
        if (!selectedBuId) {
            setAssignments([]);
            setLeaves([]);
            return;
        }

        const loadScheduleData = async () => {
            const rangeStart = addDays(weekStart, -7);
            const rangeEnd = addDays(weekStart, 13);
            const accessibleBuIds = accessibleBus.map(bu => bu.id);

            const assignmentQuery = supabase
                .from('shift_assignments')
                .select('id, employee_id, shift_template_id, date, business_unit_id, department_id, assigned_area_id, notes')
                .gte('date', toDateOnly(rangeStart))
                .lte('date', toDateOnly(rangeEnd));

            const leaveQuery = supabase
                .from('leave_requests')
                .select('id, employee_id, start_date, end_date, status')
                .eq('status', LeaveRequestStatus.Approved);

            if (selectedBuId === 'all') {
                if (accessibleBuIds.length > 0) {
                    assignmentQuery.in('business_unit_id', accessibleBuIds);
                    leaveQuery.in('business_unit_id', accessibleBuIds);
                }
            } else {
                assignmentQuery.eq('business_unit_id', selectedBuId);
                leaveQuery.eq('business_unit_id', selectedBuId);
            }

            const [assignmentRes, leaveRes] = await Promise.all([assignmentQuery, leaveQuery]);

            if (!assignmentRes.error && assignmentRes.data) {
                setAssignments(assignmentRes.data.map((row: any) => ({
                    id: row.id,
                    employeeId: row.employee_id,
                    shiftTemplateId: row.shift_template_id,
                    date: row.date ? new Date(row.date) : new Date(),
                    locationId: 'OFFICE-MAIN',
                    assignedAreaId: row.assigned_area_id || undefined,
                })));
            }

            if (!leaveRes.error && leaveRes.data) {
                setLeaves(leaveRes.data.map((row: any) => ({
                    id: row.id,
                    employeeId: row.employee_id,
                    employeeName: '',
                    leaveTypeId: '',
                    startDate: new Date(row.start_date),
                    endDate: new Date(row.end_date),
                    durationDays: 0,
                    reason: '',
                    status: row.status as LeaveRequestStatus,
                } as LeaveRequest)));
            }
        };

        loadScheduleData();
    }, [selectedBuId, weekStart, accessibleBus]);

    // --- GAP ANALYSIS ENGINE (New in Phase 3) ---
    const gaps = useMemo<Gap[]>(() => {
        if (!selectedBuId || selectedBuId === 'all') return [];

        const calculatedGaps: Gap[] = [];
        
        weekDates.forEach(date => {
            const dayType = getDayType(date);
            
            // Filter requirements for this day type & BU
            const requirements = staffingRequirements.filter(r => {
                const area = serviceAreas.find(a => a.id === r.areaId);
                return area?.businessUnitId === selectedBuId && r.dayTypeTier === dayType;
            });

            requirements.forEach(req => {
                const area = serviceAreas.find(a => a.id === req.areaId);
                if (!area) return;

                // Count assigned staff for this role/date
                const scheduledCount = assignments.filter(a => {
                    const emp = employees.find(u => u.id === a.employeeId);
                    const isDate = new Date(a.date).toDateString() === date.toDateString();
                    // Simple matching by role name. In real app, map position IDs
                    const isRole = emp?.position === req.role;
                    // Check if assignment is linked to area (or assume if role matches it counts)
                    // For strictness: a.assignedAreaId === req.areaId. For MVP: role match.
                    return isDate && isRole; 
                }).length;

                if (scheduledCount < req.minCount) {
                    calculatedGaps.push({
                        date: date,
                        role: req.role,
                        areaId: req.areaId,
                        areaName: area.name,
                        required: req.minCount,
                        scheduled: scheduledCount,
                        missing: req.minCount - scheduledCount,
                        dayType: dayType,
                        shiftTime: { start: req.startTime || '10:00', end: req.endTime || '19:00' }
                    });
                }
            });
        });

        return calculatedGaps;
    }, [selectedBuId, weekDates, assignments, staffingRequirements, serviceAreas, employees]);


    // Smart Carry-Over Logic
    const isSuggested = useMemo(() => {
        const currentWeekKey = weekStart.toISOString().split('T')[0];
        return suggestedAssignments.some(sa => getStartOfWeek(new Date(sa.date)).toISOString().split('T')[0] === currentWeekKey);
    }, [suggestedAssignments, weekStart]);

    useEffect(() => {
        if (!isScheduleEditable) return; 
        const hasAssignmentsThisWeek = assignments.some(a => {
            const assignmentWeekStart = getStartOfWeek(new Date(a.date));
            return assignmentWeekStart.getTime() === weekStart.getTime();
        });

        if (!hasAssignmentsThisWeek && !isSuggested) {
            const prevWeekStart = addDays(weekStart, -7);
            const prevWeekEnd = addDays(prevWeekStart, 6);

            const prevWeekAssignments = assignments.filter(a => {
                const assignmentDate = new Date(a.date);
                return assignmentDate >= prevWeekStart && assignmentDate <= prevWeekEnd;
            });

            if (prevWeekAssignments.length > 0) {
                const newSuggestions = prevWeekAssignments.map(a => ({
                    ...a,
                    id: `suggested-${a.id}-${Date.now()}`,
                    date: addDays(new Date(a.date), 7),
                }));
                setSuggestedAssignments(prev => [...prev, ...newSuggestions]);
            }
        }
    }, [weekStart, assignments, isSuggested, isScheduleEditable]);
    
    const departmentsInSelectedBu = useMemo(() => {
        if (selectedBuId === 'all') {
            return departments;
        }
        return departments.filter(d => d.businessUnitId === selectedBuId);
    }, [selectedBuId, departments]);

    useEffect(() => {
        setDepartmentFilter('all');
    }, [selectedBuId]);

    const employeesInBU = useMemo(() => {
        let filtered = selectedBuId === 'all'
            ? employees.filter(u => u.status === 'Active')
            : employees.filter(u => u.businessUnitId === selectedBuId && u.status === 'Active');

        if (departmentFilter !== 'all') {
            filtered = filtered.filter(u => u.departmentId === departmentFilter);
        }
        if (user) {
            const broadViewRoles = new Set<Role>([
                Role.Admin,
                Role.HRManager,
                Role.HRStaff,
                Role.BOD,
                Role.GeneralManager,
                Role.OperationsDirector,
                Role.BusinessUnitManager,
            ]);

            if (user.role === Role.Manager) {
                filtered = filtered.filter(u => u.id === user.id || u.reportsTo === user.id);
            } else if (user.role === Role.Employee) {
                filtered = filtered.filter(u => u.id === user.id);
            } else if (!broadViewRoles.has(user.role)) {
                // Safety fallback for unknown roles: show only self.
                filtered = filtered.filter(u => u.id === user.id);
            }
        }
        return filtered.sort((a,b) => a.name.localeCompare(b.name));
    }, [selectedBuId, departmentFilter, employees, user]);

     const employeesByRole = useMemo(() => {
      const grouped: Record<string, User[]> = {};
      employeesInBU.forEach(employee => {
        const role = employee.position || 'Uncategorized';
        if (!grouped[role]) {
          grouped[role] = [];
        }
        grouped[role].push(employee);
      });
      return grouped;
    }, [employeesInBU]);

    // Map employees to areas for the 'area' view
    const employeesByArea = useMemo(() => {
        const grouped: Record<string, User[]> = {};
        // Map Position -> Area Name
        const roleToArea = new Map<string, string>();
        
        // Filter requirements for current BU first to ensure correct mapping context
        const buRequirements = staffingRequirements.filter(r => {
             const area = serviceAreas.find(a => a.id === r.areaId);
             return area?.businessUnitId === selectedBuId;
        });

        buRequirements.forEach(req => {
            const area = serviceAreas.find(a => a.id === req.areaId);
            if (area) roleToArea.set(req.role, area.name);
        });

        employeesInBU.forEach(employee => {
            const role = employee.position || 'Uncategorized';
            const areaName = roleToArea.get(role) || 'General / Unassigned';
            
            if (!grouped[areaName]) {
                grouped[areaName] = [];
            }
            grouped[areaName].push(employee);
        });
        
        return grouped;
    }, [employeesInBU, selectedBuId, staffingRequirements, serviceAreas]);
    
    const validationStatus = useMemo(() => {
        if (!operatingHours) return {};
        const status: Record<string, { opening: boolean; closing: boolean; tooltip: string }> = {};

        weekDates.forEach(date => {
            const dayKey = date.toLocaleDateString('en-US', { weekday: 'short' });
            const dayHours = operatingHours.hours[dayKey];
            if (!dayHours || (dayHours.open === '00:00' && dayHours.close === '00:00')) {
                status[dayKey] = { opening: true, closing: true, tooltip: '' };
                return;
            }

            const assignmentsForDay = assignments.filter(a => new Date(a.date).toDateString() === date.toDateString());
            const shiftsForDay = assignmentsForDay.map(a => templates.find(t => t.id === a.shiftTemplateId)).filter(Boolean) as ShiftTemplate[];
            
            const isOpeningCovered = shiftsForDay.some(s => s.startTime === dayHours.open);
            const isClosingCovered = shiftsForDay.some(s => s.endTime === dayHours.close);

            let tooltips: string[] = [];
            if (!isOpeningCovered) tooltips.push('Missing opening shift coverage.');
            if (!isClosingCovered) tooltips.push('Missing closing shift coverage.');

            status[dayKey] = {
                opening: isOpeningCovered,
                closing: isClosingCovered,
                tooltip: tooltips.join(' ')
            };
        });
        return status;
    }, [operatingHours, weekDates, assignments, templates]);


    const handleOpenDrawer = (employee: User, date: Date) => {
        if (!isScheduleEditable) return;
        
        // Special Check: If user is a specific department manager, they can only edit their own department
        if (isSpecialDeptManager && user && employee.department !== user.department) {
            setToastInfo({ show: true, message: `You can only manage schedules for the ${user.department} department.` });
            return;
        }

        setDrawerState({
            open: true,
            employee,
            date,
        });
    };
    
    const handleCloseDrawer = () => setDrawerState({ open: false, employee: null, date: null });

    const resolveAssignmentBuId = (employeeId: string) => {
        if (selectedBuId && selectedBuId !== 'all') return selectedBuId;
        const employee = employees.find(e => e.id === employeeId);
        return employee?.businessUnitId || null;
    };

    const handleSaveShift = async (employeeId: string, date: Date, templateId: string) => {
        const existing = assignments.find(
            a => a.employeeId === employeeId && new Date(a.date).toDateString() === date.toDateString()
        );
        const employee = employees.find(e => e.id === employeeId);
        const resolvedBuId = resolveAssignmentBuId(employeeId);

        if (existing) {
            const { error } = await supabase
                .from('shift_assignments')
                .update({ shift_template_id: templateId, business_unit_id: resolvedBuId })
                .eq('id', existing.id);

            if (!error) {
                setAssignments(prev => prev.map(a => a.id === existing.id ? { ...a, shiftTemplateId: templateId } : a));
                logActivity(user, 'UPDATE', 'ShiftAssignment', existing.id, `Updated shift assignment for employee ${employeeId} on ${date.toDateString()}`);
            }
        } else {
            const payload = {
                employee_id: employeeId,
                shift_template_id: templateId,
                date: toDateOnly(date),
                business_unit_id: resolvedBuId,
                department_id: employee?.departmentId || null,
                assigned_area_id: null,
                created_by: user?.id || null,
            };
            const { data, error } = await supabase
                .from('shift_assignments')
                .insert(payload)
                .select('id')
                .single();

            if (!error && data) {
                const newAssignment: ShiftAssignment = {
                    id: data.id,
                    employeeId,
                    date,
                    shiftTemplateId: templateId,
                    locationId: 'OFFICE-MAIN'
                };
                setAssignments(prev => [...prev, newAssignment]);
                logActivity(user, 'CREATE', 'ShiftAssignment', newAssignment.id, `Assigned shift to employee ${employeeId} on ${date.toDateString()}`);
            }
        }

        setScheduleStatus('dirty');
        handleCloseDrawer();
    };

    const handleOpenDetailModal = (assignment: ShiftAssignment) => {
         // Check permissions before allowing detail view actions if restricted
         const employee = employees.find(u => u.id === assignment.employeeId);
         if (isSpecialDeptManager && user && employee && employee.department !== user.department) {
             // They can view but not edit/delete. The modal handles isEditable prop.
             // We need to pass down a specific isEditable flag for this specific assignment?
             // For simplicity, the modal uses the page-wide `isEditable` flag. 
             // We should ideally refine `isEditable` in the render to be per-item, but `ShiftDetailModal` logic is simpler.
             // Let's rely on the modal's `isEditable` prop which we can override here.
             setDetailModalState({ open: true, assignment });
             return;
         }

        setDetailModalState({ open: true, assignment });
    };

    const handleCloseDetailModal = () => {
        setDetailModalState({ open: false, assignment: null });
    };

    const handleDeleteShift = async (assignmentId: string) => {
        if (window.confirm('This will delete the single shift for this day. Do you want to proceed?')) {
            const { error } = await supabase
                .from('shift_assignments')
                .delete()
                .eq('id', assignmentId);

            if (!error) {
                setAssignments(prev => prev.filter(a => a.id !== assignmentId));
                logActivity(user, 'DELETE', 'ShiftAssignment', assignmentId, 'Deleted shift assignment');
                setScheduleStatus('dirty');
                handleCloseDetailModal();
            }
        }
    };
    
    const handleChangeShift = (assignment: ShiftAssignment) => {
        const employee = employees.find(u => u.id === assignment.employeeId);
        if (employee) {
            handleCloseDetailModal();
            setTimeout(() => {
                handleOpenDrawer(employee, new Date(assignment.date));
            }, 150);
        }
    };
    
    const handleCopyWeek = async (assignmentToCopy: ShiftAssignment) => {
        const { employeeId, shiftTemplateId, date } = assignmentToCopy;
        const startDate = new Date(date);
        const dayOfWeek = startDate.getDay();
        const weekDayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

        const newAssignments: ShiftAssignment[] = [];

        for (let i = weekDayIndex + 1; i < 7; i++) {
            const targetDate = weekDates[i];
            
            const existingAssignmentIndex = assignments.findIndex(a => a.employeeId === employeeId && new Date(a.date).toDateString() === targetDate.toDateString());
            const existingLeave = leaves.find(l => l.employeeId === employeeId && l.status === LeaveRequestStatus.Approved && targetDate >= new Date(l.startDate) && targetDate <= new Date(l.endDate));
            
            if (existingAssignmentIndex === -1 && !existingLeave) {
                newAssignments.push({
                    id: `SA-COPY-${Date.now()}-${i}`,
                    employeeId,
                    date: targetDate,
                    shiftTemplateId,
                    locationId: assignmentToCopy.locationId,
                });
            }
        }
        
        if (newAssignments.length > 0) {
            const payloads = newAssignments.map(a => {
                const emp = employees.find(e => e.id === a.employeeId);
                const resolvedBuId = resolveAssignmentBuId(a.employeeId);
                return {
                    employee_id: a.employeeId,
                    shift_template_id: a.shiftTemplateId,
                    date: toDateOnly(a.date),
                    business_unit_id: resolvedBuId,
                    department_id: emp?.departmentId || null,
                    assigned_area_id: a.assignedAreaId || null,
                    created_by: user?.id || null,
                };
            });

            const { data, error } = await supabase
                .from('shift_assignments')
                .insert(payloads)
                .select('id, employee_id, shift_template_id, date, assigned_area_id');

            if (!error && data) {
                const inserted = data.map((row: any) => ({
                    id: row.id,
                    employeeId: row.employee_id,
                    shiftTemplateId: row.shift_template_id,
                    date: row.date ? new Date(row.date) : new Date(),
                    locationId: 'OFFICE-MAIN',
                    assignedAreaId: row.assigned_area_id || undefined,
                }));
                setAssignments(prev => [...prev, ...inserted]);
            }
            setScheduleStatus('dirty');
            logActivity(user, 'CREATE', 'ShiftAssignment', 'batch', `Copied shift to rest of week for employee ${employeeId}`);
        }
        handleCloseDetailModal();
    };

    const handleCopyLastWeekSchedule = async (employeeId: string) => {
        if (!user) return;
        if (!window.confirm("This will copy the employee's entire schedule from last week, overwriting any shifts in the current week. Proceed?")) {
            return;
        }
        
        const prevWeekStart = addDays(weekStart, -7);
        const prevWeekAssignments = assignments.filter(a => {
            if (a.employeeId === employeeId) {
                const assignmentDate = new Date(a.date);
                const assignmentWeekStart = getStartOfWeek(assignmentDate);
                return assignmentWeekStart.toDateString() === prevWeekStart.toDateString();
            }
            return false;
        });

        if (prevWeekAssignments.length === 0) {
            setToastInfo({ show: true, message: 'No schedule found for last week.' });
            return;
        }

        const newAssignmentsForCurrentWeek = prevWeekAssignments.map(a => ({
            ...a,
            id: `SA-COPY-${Date.now()}-${a.id}`,
            date: addDays(new Date(a.date), 7),
        }));

        const currentWeekEnd = addDays(weekStart, 6);
        await supabase
            .from('shift_assignments')
            .delete()
            .eq('employee_id', employeeId)
            .gte('date', toDateOnly(weekStart))
            .lte('date', toDateOnly(currentWeekEnd));

        const payloads = newAssignmentsForCurrentWeek.map(a => {
            const emp = employees.find(e => e.id === a.employeeId);
            const resolvedBuId = resolveAssignmentBuId(a.employeeId);
            return {
                employee_id: a.employeeId,
                shift_template_id: a.shiftTemplateId,
                date: toDateOnly(a.date),
                business_unit_id: resolvedBuId,
                department_id: emp?.departmentId || null,
                assigned_area_id: a.assignedAreaId || null,
                created_by: user.id,
            };
        });

        const { data, error } = await supabase
            .from('shift_assignments')
            .insert(payloads)
            .select('id, employee_id, shift_template_id, date, assigned_area_id');

        if (!error && data) {
            const inserted = data.map((row: any) => ({
                id: row.id,
                employeeId: row.employee_id,
                shiftTemplateId: row.shift_template_id,
                date: row.date ? new Date(row.date) : new Date(),
                locationId: 'OFFICE-MAIN',
                assignedAreaId: row.assigned_area_id || undefined,
            }));
            setAssignments(prev => {
                const filtered = prev.filter(a => {
                    if (a.employeeId !== employeeId) return true;
                    const assignmentWeekStart = getStartOfWeek(new Date(a.date));
                    return assignmentWeekStart.toDateString() !== weekStart.toDateString();
                });
                return [...filtered, ...inserted];
            });
        }
        setScheduleStatus('dirty');
        setToastInfo({ show: true, message: 'Last week\'s schedule copied!' });
        logActivity(user, 'CREATE', 'ShiftAssignment', 'batch', `Copied last week's schedule for employee ${employeeId}`);
        handleCloseDrawer();
    };

    const handleCopyPreviousWeekAll = async () => {
        if (!isScheduleEditable) return;

        const prevWeekStart = addDays(weekStart, -7);
        const prevWeekEnd = addDays(prevWeekStart, 6);
        prevWeekEnd.setHours(23, 59, 59, 999);
        
        const prevWeekStartStr = prevWeekStart.toLocaleDateString();
        const currentWeekStartStr = weekStart.toLocaleDateString();

        if (!window.confirm(`Copy schedule from week of ${prevWeekStartStr} to current week (${currentWeekStartStr})? \n\nThis will overwrite existing shifts for all displayed employees.`)) {
            return;
        }

        // Special check for restricted managers: only copy for their dept
        const targetEmployees = isSpecialDeptManager && user 
            ? employeesInBU.filter(e => e.department === user.department)
            : employeesInBU;

        const displayedEmployeeIds = targetEmployees.map(e => e.id);
        
        const sourceAssignments = assignments.filter(a => {
            const d = new Date(a.date);
            return displayedEmployeeIds.includes(a.employeeId) &&
                   d >= prevWeekStart && 
                   d <= prevWeekEnd;
        });

        if (sourceAssignments.length === 0) {
            setToastInfo({ show: true, message: 'No shifts found in the previous week for the selected employees.' });
            return;
        }

        const currentWeekEnd = addDays(weekStart, 6);
        currentWeekEnd.setHours(23, 59, 59, 999);

        const newAssignments = sourceAssignments.map(a => ({
            ...a,
            id: `SA-COPY-ALL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            date: addDays(new Date(a.date), 7),
        }));

        await supabase
            .from('shift_assignments')
            .delete()
            .in('employee_id', displayedEmployeeIds)
            .gte('date', toDateOnly(weekStart))
            .lte('date', toDateOnly(currentWeekEnd));

        const payloads = newAssignments.map(a => {
            const emp = employees.find(e => e.id === a.employeeId);
            const resolvedBuId = resolveAssignmentBuId(a.employeeId);
            return {
                employee_id: a.employeeId,
                shift_template_id: a.shiftTemplateId,
                date: toDateOnly(a.date),
                business_unit_id: resolvedBuId,
                department_id: emp?.departmentId || null,
                assigned_area_id: a.assignedAreaId || null,
                created_by: user?.id || null,
            };
        });

        const { data, error } = await supabase
            .from('shift_assignments')
            .insert(payloads)
            .select('id, employee_id, shift_template_id, date, assigned_area_id');

        if (!error && data) {
            const inserted = data.map((row: any) => ({
                id: row.id,
                employeeId: row.employee_id,
                shiftTemplateId: row.shift_template_id,
                date: row.date ? new Date(row.date) : new Date(),
                locationId: 'OFFICE-MAIN',
                assignedAreaId: row.assigned_area_id || undefined,
            }));
            setAssignments(prev => {
                const filtered = prev.filter(a => {
                    const d = new Date(a.date);
                    const isTargetEmployee = displayedEmployeeIds.includes(a.employeeId);
                    const isInCurrentWeek = d >= weekStart && d <= currentWeekEnd;
                    return !(isTargetEmployee && isInCurrentWeek);
                });
                return [...filtered, ...inserted];
            });
        }

        setScheduleStatus('dirty');
        setToastInfo({ show: true, message: `Successfully copied ${newAssignments.length} shifts from previous week.` });
        logActivity(user!, 'CREATE', 'ShiftAssignment', 'batch', `Copied previous week schedule for employees.`);
    };

    const handleSaveTemplate = async (templateData: ShiftTemplate) => {
        const resolvedBuId = templateData.businessUnitId && templateData.businessUnitId !== 'all'
            ? templateData.businessUnitId
            : (selectedBuId && selectedBuId !== 'all' ? selectedBuId : null);
        const payload = {
            name: templateData.name,
            start_time: templateData.startTime,
            end_time: templateData.endTime,
            break_minutes: templateData.breakMinutes ?? 0,
            business_unit_id: resolvedBuId,
            is_night_shift: false,
        };

        if (templateData.id) {
            const { data, error } = await supabase
                .from('shift_templates')
                .update(payload)
                .eq('id', templateData.id)
                .select('id, name, start_time, end_time, break_minutes, business_unit_id, is_night_shift')
                .single();

            if (error || !data) {
                setToastInfo({ show: true, message: 'Failed to update shift preset.' });
                return;
            }

            const updated: ShiftTemplate = {
                id: data.id,
                name: data.name,
                startTime: data.start_time,
                endTime: data.end_time,
                breakMinutes: data.break_minutes ?? 0,
                gracePeriodMinutes: templateData.gracePeriodMinutes ?? 15,
                businessUnitId: data.business_unit_id || '',
                color: templateData.color || 'blue',
                isFlexible: false,
            };

            setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
        } else {
            const { data, error } = await supabase
                .from('shift_templates')
                .insert(payload)
                .select('id, name, start_time, end_time, break_minutes, business_unit_id, is_night_shift')
                .single();

            if (error || !data) {
                setToastInfo({ show: true, message: 'Failed to create shift preset.' });
                return;
            }

            const created: ShiftTemplate = {
                id: data.id,
                name: data.name,
                startTime: data.start_time,
                endTime: data.end_time,
                breakMinutes: data.break_minutes ?? 0,
                gracePeriodMinutes: templateData.gracePeriodMinutes ?? 15,
                businessUnitId: data.business_unit_id || '',
                color: templateData.color || 'blue',
                isFlexible: false,
            };
            setTemplates(prev => [...prev, created]);
        }

        setTemplateModalState({ open: false, template: null });
    };

    const handleDeleteTemplate = async (templateId: string) => {
        if (assignments.some(a => a.shiftTemplateId === templateId)) {
            alert('Cannot delete a shift preset that is currently assigned to one or more employees.');
            return;
        }
        if (window.confirm('Are you sure you want to delete this shift preset?')) {
            const { error } = await supabase
                .from('shift_templates')
                .delete()
                .eq('id', templateId);

            if (error) {
                setToastInfo({ show: true, message: 'Failed to delete shift preset.' });
                return;
            }
            setTemplates(prev => prev.filter(t => t.id !== templateId));
        }
    };

    const handleSaveHours = async (newHours: OperatingHours['hours']) => {
        if (!selectedBuId) return;
        const payloads = dayKeys.map((day, index) => ({
            business_unit_id: selectedBuId,
            day_of_week: index,
            open_time: newHours[day]?.open || '00:00',
            close_time: newHours[day]?.close || '00:00',
        }));

        const { error } = await supabase
            .from('operating_hours')
            .upsert(payloads, { onConflict: 'business_unit_id,day_of_week' });

        if (error) {
            setToastInfo({ show: true, message: 'Failed to update operating hours.' });
            return;
        }

        setOperatingHours({ businessUnitId: selectedBuId, hours: newHours });
        setIsHoursModalOpen(false);
    };
    
    // --- Auto Fill Logic ---
    const handleAutoFill = async () => {
        if (selectedBuId === 'all') {
            setToastInfo({ show: true, message: 'Select a specific business unit to auto-assign shifts.' });
            return;
        }

        const hasRequirementsForBu = staffingRequirements.some(req => {
            const area = serviceAreas.find(a => a.id === req.areaId);
            return area?.businessUnitId === selectedBuId;
        });

        if (!hasRequirementsForBu) {
            setToastInfo({ show: true, message: 'No staffing requirements configured for this business unit.' });
            return;
        }

        if (gaps.length === 0) {
            setToastInfo({ show: true, message: 'No gaps to fill!' });
            return;
        }

        let filledCount = 0;
        const newAssignments: ShiftAssignment[] = [];

        // Restrict autofill candidates for specific managers
        const candidates = isSpecialDeptManager && user 
            ? employeesInBU.filter(e => e.department === user.department)
            : employeesInBU;

        gaps.forEach(gap => {
             // Find an employee with the right role who is NOT working on this day
             const availableEmployee = candidates.find(emp => {
                 const isCorrectRole = emp.position === gap.role;
                 const hasShiftToday = assignments.some(a => a.employeeId === emp.id && new Date(a.date).toDateString() === gap.date.toDateString());
                 const alreadyDrafted = newAssignments.some(a => a.employeeId === emp.id && new Date(a.date).toDateString() === gap.date.toDateString());
                 
                 // In a real app, verify leave status too
                 const onLeave = leaves.some(l => l.employeeId === emp.id && l.status === LeaveRequestStatus.Approved && gap.date >= new Date(l.startDate) && gap.date <= new Date(l.endDate));

                 return isCorrectRole && !hasShiftToday && !alreadyDrafted && !onLeave;
             });

             if (availableEmployee && gap.shiftTime) {
                 // Find or create a matching template
                 let template = templates.find(t => t.startTime === gap.shiftTime?.start && t.endTime === gap.shiftTime?.end);
                 
                 // For demo simplicity, if no exact template, use the first one or fallback
                 if (!template && templates.length > 0) template = templates[0];

                 if (template) {
                     newAssignments.push({
                        id: `AUTO-${Date.now()}-${filledCount}`,
                        employeeId: availableEmployee.id,
                        date: gap.date,
                        shiftTemplateId: template.id,
                        locationId: 'OFFICE-MAIN', // Default
                        assignedAreaId: gap.areaId
                     });
                     filledCount++;
                 }
             }
        });

        if (filledCount > 0) {
            const payloads = newAssignments.map(a => {
                const emp = employees.find(e => e.id === a.employeeId);
                const resolvedBuId = resolveAssignmentBuId(a.employeeId);
                return {
                    employee_id: a.employeeId,
                    shift_template_id: a.shiftTemplateId,
                    date: toDateOnly(a.date),
                    business_unit_id: resolvedBuId,
                    department_id: emp?.departmentId || null,
                    assigned_area_id: a.assignedAreaId || null,
                    created_by: user?.id || null,
                };
            });

            const { data, error } = await supabase
                .from('shift_assignments')
                .insert(payloads)
                .select('id, employee_id, shift_template_id, date, assigned_area_id');

            if (!error && data) {
                const inserted = data.map((row: any) => ({
                    id: row.id,
                    employeeId: row.employee_id,
                    shiftTemplateId: row.shift_template_id,
                    date: row.date ? new Date(row.date) : new Date(),
                    locationId: 'OFFICE-MAIN',
                    assignedAreaId: row.assigned_area_id || undefined,
                }));
                setAssignments(prev => [...prev, ...inserted]);
                setScheduleStatus('dirty');
                setToastInfo({ show: true, message: `Auto-assigned ${inserted.length} shifts based on gaps.` });
                logActivity(user!, 'CREATE', 'ShiftAssignment', 'batch', `Auto-filled ${inserted.length} shifts based on gaps.`);
            } else {
                setToastInfo({ show: true, message: 'Failed to auto-assign shifts.' });
            }
        } else {
             setToastInfo({ show: true, message: 'Could not find available employees to fill gaps.' });
        }
    };

    const handlePublishSchedule = async () => {
        const currentWeekKey = weekStart.toISOString().split('T')[0];
        const suggestionsToConfirm = suggestedAssignments.filter(sa => 
            getStartOfWeek(new Date(sa.date)).toISOString().split('T')[0] === currentWeekKey
        );
        
        if (suggestionsToConfirm.length > 0) {
            const payloads = suggestionsToConfirm.map(suggestion => {
                const emp = employees.find(e => e.id === suggestion.employeeId);
                const resolvedBuId = resolveAssignmentBuId(suggestion.employeeId);
                return {
                    employee_id: suggestion.employeeId,
                    shift_template_id: suggestion.shiftTemplateId,
                    date: toDateOnly(new Date(suggestion.date)),
                    business_unit_id: resolvedBuId,
                    department_id: emp?.departmentId || null,
                    assigned_area_id: suggestion.assignedAreaId || null,
                    created_by: user?.id || null,
                };
            });

            const { data, error } = await supabase
                .from('shift_assignments')
                .insert(payloads)
                .select('id, employee_id, shift_template_id, date, assigned_area_id');

            if (!error && data) {
                const inserted = data.map((row: any) => ({
                    id: row.id,
                    employeeId: row.employee_id,
                    shiftTemplateId: row.shift_template_id,
                    date: row.date ? new Date(row.date) : new Date(),
                    locationId: 'OFFICE-MAIN',
                    assignedAreaId: row.assigned_area_id || undefined,
                }));
                setAssignments(prev => [...prev, ...inserted]);
                setSuggestedAssignments(prev => prev.filter(sa => 
                    getStartOfWeek(new Date(sa.date)).toISOString().split('T')[0] !== currentWeekKey
                ));
            } else {
                setToastInfo({ show: true, message: 'Failed to publish suggested shifts.' });
                return;
            }
        }

        setScheduleStatus('published');
        setToastInfo({ show: true, message: 'Schedule for the week has been published!' });
        logActivity(user!, 'UPDATE', 'Schedule', currentWeekKey, `Published schedule for week of ${weekStart.toLocaleDateString()}`);
    };

    const handlePrevWeek = () => { setViewDate(prev => addDays(prev, -7)); setScheduleStatus('published'); };
    const handleNextWeek = () => { setViewDate(prev => addDays(prev, 7)); setScheduleStatus('published'); };
    const handleToday = () => { setViewDate(new Date()); setScheduleStatus('published'); };

    const shiftColorClasses: Record<string, string> = {
        blue: 'bg-blue-100 border-blue-400 text-blue-800 dark:bg-blue-900/50 dark:border-blue-700 dark:text-blue-200',
        indigo: 'bg-indigo-100 border-indigo-400 text-indigo-800 dark:bg-indigo-900/50 dark:border-indigo-700 dark:text-indigo-200',
        yellow: 'bg-yellow-100 border-yellow-400 text-yellow-800 dark:bg-yellow-900/50 dark:border-yellow-700 dark:text-yellow-200',
        green: 'bg-green-100 border-green-400 text-green-800 dark:bg-green-900/50 dark:border-green-700 dark:text-green-200',
        cyan: 'bg-cyan-100 border-cyan-400 text-cyan-800 dark:bg-cyan-900/50 dark:border-cyan-700 dark:text-cyan-200',
        gray: 'bg-gray-200 border-gray-400 text-gray-800 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200',
    };
    
    const enrichedAssignmentDetail: EnrichedAssignmentDetail | null = useMemo(() => {
        if (!detailModalState.assignment) return null;
        const employee = employees.find(u => u.id === detailModalState.assignment!.employeeId);
        const shift = templates.find(t => t.id === detailModalState.assignment!.shiftTemplateId);
        if (!employee || !shift) return null;
        return { assignment: detailModalState.assignment, employee, shift };
    }, [detailModalState.assignment, templates]);

    const templatesForDrawer = useMemo(() => {
        if (selectedBuId === 'all') return templates;
        return templates.filter(t => t.businessUnitId === selectedBuId || !t.businessUnitId);
    }, [templates, selectedBuId]);
    
    const presetTemplates = useMemo(() => {
        if (selectedBuId !== 'all') {
            return templates.filter(t => t.businessUnitId === selectedBuId);
        }
        const seen = new Set<string>();
        return templates.filter(template => {
            const key = `${template.name}|${template.startTime}|${template.endTime}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [templates, selectedBuId]);

    const buNameForModal = businessUnits.find(b => b.id === selectedBuId)?.name;
    
    const viewButtonClass = (buttonView: typeof view) => `flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${view === buttonView ? 'bg-indigo-100 text-indigo-700 dark:bg-slate-700 dark:text-indigo-300 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`;
    
    const selectedBu = useMemo(() => businessUnits.find(bu => bu.id === selectedBuId), [selectedBuId, businessUnits]);

    const colorStyles: Record<string, { bg: string, text: string, border: string }> = {
        blue: { bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-800 dark:text-blue-200', border: 'border-blue-500' },
        cyan: { bg: 'bg-cyan-100 dark:bg-cyan-900/50', text: 'text-cyan-800 dark:text-cyan-200', border: 'border-cyan-500' },
        pink: { bg: 'bg-pink-100 dark:bg-pink-900/50', text: 'text-pink-800 dark:text-pink-200', border: 'border-pink-500' },
        amber: { bg: 'bg-amber-200 dark:bg-amber-800/50', text: 'text-amber-900 dark:text-amber-100 font-bold', border: 'border-violet-400' },
        yellow: { bg: 'bg-yellow-100 dark:bg-yellow-900/50', text: 'text-yellow-800 dark:text-yellow-200', border: 'border-yellow-500' },
        lime: { bg: 'bg-lime-100 dark:bg-lime-900/50', text: 'text-lime-800 dark:text-lime-200', border: 'border-lime-500' },
        green: { bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-800 dark:text-green-200', border: 'border-green-500' },
        purple: { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-800 dark:text-purple-200', border: 'border-purple-500' },
        default: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-800 dark:text-gray-200', border: 'border-gray-300' },
    };

    const buColorStyle = selectedBu?.color ? colorStyles[selectedBu.color] : colorStyles.default;

    const dropdowns = (
        <div className="flex items-center space-x-4">
            <div className={`relative rounded-lg border-4 ${buColorStyle.border}`}>
                <select
                    id="bu-filter"
                    value={selectedBuId}
                    onChange={e => setSelectedBuId(e.target.value)}
                    className={`block w-full pl-4 pr-10 py-2 text-xl appearance-none focus:outline-none rounded-md ${buColorStyle.bg} ${buColorStyle.text}`}
                >
                    {accessibleBus.length > 0 && <option value="all">All BUs</option>}
                    {accessibleBus.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-inherit">
                    <ChevronDownIcon />
                </div>
            </div>
            <div className="relative">
                <label htmlFor="dept-filter" className="sr-only">Department</label>
                <select id="dept-filter" value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    <option value="all">All Departments</option>
                    {departmentsInSelectedBu.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                </select>
            </div>
        </div>
    );

    // --- GAP BAR UI ---
    const totalGaps = gaps.reduce((sum, g) => sum + g.missing, 0);
    const gapBar = isScheduleEditable && (
        <div className={`mb-6 p-3 rounded-lg border flex flex-col md:flex-row justify-between items-center gap-4 ${totalGaps > 0 ? 'bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-800' : 'bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-800'}`}>
            <div className="flex items-center gap-3">
                 <div className={`p-2 rounded-full ${totalGaps > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                    {totalGaps > 0 ? <WarningIcon tooltip="" /> : <span className="text-xl font-bold">✓</span>}
                 </div>
                 <div>
                     <h3 className={`font-bold ${totalGaps > 0 ? 'text-red-800 dark:text-red-200' : 'text-green-800 dark:text-green-200'}`}>
                         Coverage Health: {totalGaps > 0 ? `${totalGaps} Shifts Short` : 'Fully Covered'}
                     </h3>
                     {totalGaps > 0 && (
                         <p className="text-xs text-red-600 dark:text-red-300">
                            Gap Analysis identified unfilled requirements based on your matrix.
                         </p>
                     )}
                 </div>
            </div>
            {totalGaps > 0 && (
                <Button onClick={handleAutoFill} className="bg-indigo-600 hover:bg-indigo-700 text-white border-none shadow-md flex items-center gap-2">
                    <SparklesIcon /> Auto-Assign Recommendations
                </Button>
            )}
        </div>
    );

    if (!canView) {
        return (
            <div className="p-6">
                <Card>
                    <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                        You do not have permission to view schedules.
                    </div>
                </Card>
            </div>
        );
    }


    return (
        <div className="space-y-6">
             <Toast
                show={toastInfo.show}
                onClose={() => setToastInfo({ show: false, message: '' })}
                title="Success"
                message={toastInfo.message}
            />

            {isScheduleEditable && (
                <LiveShiftStatusDashboard
                    selectedBuId={selectedBuId}
                    actions={dropdowns}
                    employees={employeesInBU}
                    assignments={assignments}
                    templates={templates}
                />
            )}
            {!isScheduleEditable && (
                <div className="mb-6">{dropdowns}</div>
            )}

            {gapBar}

            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">WeeklyShiftRoster</h1>
            
            {isScheduleEditable && (
                <Card title="Shift Presets">
                    <div className="flex flex-wrap gap-x-2 gap-y-4 pt-8">
                        {presetTemplates.map(template => {
                            const tooltip = template.isFlexible
                                ? `Flexible Shift: Min ${template.minHoursPerDay} hrs/day, Min ${template.minDaysPerWeek} days/week`
                                : `Fixed Shift: ${template.startTime} - ${template.endTime}`;

                            return (
                                <div
                                    key={template.id}
                                    className={`group relative px-3 py-1.5 rounded-full text-sm font-semibold flex items-center ${shiftColorClasses[template.color]}`}
                                    title={tooltip}
                                >
                                    {template.name}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1 bg-white dark:bg-slate-900 p-1 rounded-md shadow-lg z-10 border border-gray-200 dark:border-gray-700">
                                        <button onClick={() => setTemplateModalState({ open: true, template })} className="p-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md" title="Edit Preset">
                                            <PencilIcon />
                                        </button>
                                        <div className="h-4 w-px bg-gray-200 dark:bg-gray-600"></div>
                                        <button onClick={() => handleDeleteTemplate(template.id)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/50 rounded-md" title="Delete Preset">
                                            <TrashIcon />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-4">
                        <Button onClick={() => setTemplateModalState({ open: true, template: null })}>
                            + Add New Preset
                        </Button>
                    </div>
                </Card>
            )}

            <Card>
                <div className="p-4 space-y-4">
                    {/* --- First Row: Date --- */}
                     <div className="grid grid-cols-1 items-center gap-4">
                        <span className="font-semibold text-2xl text-gray-800 dark:text-gray-200">
                            {formatDateRange(weekStart, addDays(weekStart, 6))}
                        </span>
                    </div>
                    
                    {/* --- Second Row: Actions --- */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center space-x-2">
                                <Button variant="secondary" onClick={handlePrevWeek}>&larr; Prev</Button>
                                <Button variant="secondary" onClick={handleToday}>Today</Button>
                                <Button variant="secondary" onClick={handleNextWeek}>Next &rarr;</Button>
                            </div>
                            <div className="inline-flex space-x-1 p-1 bg-gray-200 dark:bg-slate-800 rounded-lg">
                                <button className={viewButtonClass('grid')} onClick={() => setView('grid')}><ViewGridIcon/> Grid</button>
                                <button className={viewButtonClass('role')} onClick={() => setView('role')}><ViewListIcon/> Role</button>
                                <button className={viewButtonClass('area')} onClick={() => setView('area')}><RectangleGroupIcon/> Area</button>
                                <button className={viewButtonClass('timeline')} onClick={() => setView('timeline')}><ChartBarIcon/> Timeline</button>
                            </div>
                        </div>

                        <div className="flex items-center space-x-4">
                            {isScheduleEditable && (
                                <>
                                    <Button variant="secondary" onClick={handleCopyPreviousWeekAll}>
                                        Copy Last Week's Schedule
                                    </Button>

                                    {scheduleStatus === 'dirty' ? (
                                        <Button onClick={handlePublishSchedule}>
                                            Publish Week
                                        </Button>
                                    ) : (
                                        <span className="text-green-600 dark:text-green-400 font-semibold text-sm">✓ Published</span>
                                    )}
                                    {selectedBuId !== 'all' && (
                                        <Button variant="secondary" onClick={() => setIsHoursModalOpen(true)}>Edit Business Hours</Button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
                {view === 'timeline' ? (
                    <TimelineView 
                        weekDates={weekDates}
                        employees={employeesInBU}
                        assignments={assignments}
                        templates={templates}
                        operatingHours={operatingHours}
                        onOpenDrawer={handleOpenDrawer}
                        isEditable={isScheduleEditable}
                    />
                ) : (
                    <RoleViewTable 
                        view={view as 'grid' | 'role' | 'area'}
                        employeesByRole={employeesByRole}
                        employeesByArea={employeesByArea}
                        employees={employeesInBU}
                        weekDates={weekDates}
                        operatingHours={operatingHours}
                        validationStatus={validationStatus}
                        assignments={assignments}
                        suggestedAssignments={suggestedAssignments}
                        leaves={leaves}
                        templates={templates}
                        shiftColorClasses={shiftColorClasses}
                        onOpenDetailModal={handleOpenDetailModal}
                        onOpenDrawer={handleOpenDrawer}
                        isEditable={isScheduleEditable}
                    />
                )}
            </Card>

            <ShiftAssignmentDrawer 
                isOpen={drawerState.open}
                onClose={handleCloseDrawer}
                employee={drawerState.employee}
                date={drawerState.date}
                templates={templatesForDrawer}
                onSave={handleSaveShift}
                onCopyLastWeekSchedule={handleCopyLastWeekSchedule}
                gaps={gaps}
            />
            
            <ShiftDetailModal
                isOpen={detailModalState.open}
                onClose={handleCloseDetailModal}
                onDelete={handleDeleteShift}
                onCopyWeek={handleCopyWeek}
                onChangeShift={() => handleChangeShift(detailModalState.assignment!)}
                assignmentDetail={enrichedAssignmentDetail}
                isEditable={isScheduleEditable && (!isSpecialDeptManager || (isSpecialDeptManager && enrichedAssignmentDetail?.employee?.department === user?.department))}
            />
            
            <ShiftTemplateModal
                isOpen={templateModalState.open}
                onClose={() => setTemplateModalState({ open: false, template: null })}
                template={templateModalState.template}
                onSave={handleSaveTemplate}
                businessUnitId={selectedBuId}
            />

            {operatingHours && (
                <OperatingHoursModal
                    isOpen={isHoursModalOpen}
                    onClose={() => setIsHoursModalOpen(false)}
                    onSave={handleSaveHours}
                    currentHours={operatingHours.hours}
                    businessUnitName={buNameForModal}
                />
            )}
        </div>
    );
};

export default Timekeeping;
