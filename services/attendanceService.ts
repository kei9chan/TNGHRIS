
import { ShiftAssignment, TimeEvent, ShiftTemplate, Site, AttendanceExceptionRecord, ExceptionType, TimeEventType, User, AttendanceRecord, AttendanceStatus, AttendanceException } from '../types';
import { mockUsers } from './mockData';

// Helper to get minutes from "HH:MM" string
const getMinutes = (time: string): number => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
};

// Helper to parse a shift date and time string into a Date object
const getShiftDateTime = (date: Date, timeStr: string, isNextDay: boolean = false): Date => {
    const d = new Date(date);
    const [h, m] = timeStr.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    if (isNextDay) {
        d.setDate(d.getDate() + 1);
    }
    return d;
};

export const generateDailyRecords = (
    assignments: ShiftAssignment[],
    events: TimeEvent[],
    templates: ShiftTemplate[]
): AttendanceRecord[] => {
    const records: AttendanceRecord[] = [];

    assignments.forEach(assignment => {
        const template = templates.find(t => t.id === assignment.shiftTemplateId);
        const assignmentDateStr = new Date(assignment.date).toDateString();
        const dayEvents = events.filter(e => 
            e.employeeId === assignment.employeeId && 
            new Date(e.timestamp).toDateString() === assignmentDateStr
        );

        const employee = mockUsers.find(u => u.id === assignment.employeeId);
        const employeeName = employee?.name || 'Unknown';

        const record: AttendanceRecord = {
            id: `ATT-${assignment.id}`,
            employeeId: assignment.employeeId,
            employeeName,
            date: new Date(assignment.date),
            scheduledStart: null,
            scheduledEnd: null,
            shiftName: template?.name || 'Unknown Shift',
            firstIn: null,
            lastOut: null,
            totalWorkMinutes: 0,
            breakMinutes: 0,
            overtimeMinutes: 0, // Simplistic OT calc
            exceptions: [],
            hasManualEntry: dayEvents.some(e => e.source === 'Manual'),
            status: AttendanceStatus.Pending
        };

        if (template && template.name !== 'OFF') {
             const shiftStartMinutes = getMinutes(template.startTime);
             const shiftEndMinutes = getMinutes(template.endTime);
             const isOvernight = shiftEndMinutes < shiftStartMinutes;
             record.scheduledStart = getShiftDateTime(assignment.date, template.startTime);
             record.scheduledEnd = getShiftDateTime(assignment.date, template.endTime, isOvernight);
        }

        // Simplified Log Logic: First In, Last Out
        const clockIns = dayEvents.filter(e => e.type === TimeEventType.ClockIn).sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const clockOuts = dayEvents.filter(e => e.type === TimeEventType.ClockOut).sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        if (clockIns.length > 0) record.firstIn = new Date(clockIns[0].timestamp);
        if (clockOuts.length > 0) record.lastOut = new Date(clockOuts[clockOuts.length - 1].timestamp);

        // Calculate basic hours (naive implementation)
        if (record.firstIn && record.lastOut) {
             const durationMs = record.lastOut.getTime() - record.firstIn.getTime();
             record.totalWorkMinutes = Math.floor(durationMs / 60000);
             // Deduct Break
             if (template) record.totalWorkMinutes -= template.breakMinutes;
             if (record.totalWorkMinutes < 0) record.totalWorkMinutes = 0;
        }

        // Exception Logic (Re-using logic conceptually)
        if (record.scheduledStart) {
            if (record.firstIn) {
                const graceThreshold = new Date(record.scheduledStart.getTime() + (template?.gracePeriodMinutes || 0) * 60000);
                if (record.firstIn > graceThreshold) record.exceptions.push(AttendanceException.Late);
            } else if (new Date() > record.scheduledEnd!) {
                record.exceptions.push(AttendanceException.Absent); // Or Missing In
            }
        }
        
        if (record.scheduledEnd && record.lastOut) {
            if (record.lastOut < record.scheduledEnd) record.exceptions.push(AttendanceException.Undertime);
        } else if (record.scheduledEnd && record.firstIn && !record.lastOut && new Date() > record.scheduledEnd) {
             record.exceptions.push(AttendanceException.MissingOut);
        }

        records.push(record);
    });

    return records;
};


export const generateAttendanceExceptions = (
    assignments: ShiftAssignment[],
    events: TimeEvent[],
    templates: ShiftTemplate[]
): AttendanceExceptionRecord[] => {
    const exceptions: AttendanceExceptionRecord[] = [];

    // 1. Detect Double Logs (Sequence Check)
    const eventsByEmployee: Record<string, TimeEvent[]> = {};
    events.forEach(e => {
        if (!eventsByEmployee[e.employeeId]) eventsByEmployee[e.employeeId] = [];
        eventsByEmployee[e.employeeId].push(e);
    });

    Object.keys(eventsByEmployee).forEach(empId => {
        const empEvents = eventsByEmployee[empId].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        let lastType: TimeEventType | null = null;
        
        empEvents.forEach(event => {
            // Check for double INs
            if (event.type === TimeEventType.ClockIn && lastType === TimeEventType.ClockIn) {
                exceptions.push({
                    id: `EX-DL-IN-${event.id}`,
                    employeeId: empId,
                    employeeName: mockUsers.find(u => u.id === empId)?.name || 'Unknown',
                    date: event.timestamp,
                    type: ExceptionType.DoubleLog,
                    details: "Double Clock-In detected.",
                    status: 'Pending',
                    sourceEventId: event.id
                });
            }
            // Check for double OUTs
            if (event.type === TimeEventType.ClockOut && lastType === TimeEventType.ClockOut) {
                 exceptions.push({
                    id: `EX-DL-OUT-${event.id}`,
                    employeeId: empId,
                    employeeName: mockUsers.find(u => u.id === empId)?.name || 'Unknown',
                    date: event.timestamp,
                    type: ExceptionType.DoubleLog,
                    details: "Double Clock-Out detected.",
                    status: 'Pending',
                    sourceEventId: event.id
                });
            }
            
            // Only update lastType for main clock events, ignore breaks for double-log sequence check to be simple
            if (event.type === TimeEventType.ClockIn || event.type === TimeEventType.ClockOut) {
                lastType = event.type;
            }
        });
    });

    // 2. Shift-Based Validations
    const now = new Date();

    assignments.forEach(assignment => {
        const template = templates.find(t => t.id === assignment.shiftTemplateId);
        if (!template || template.name === 'OFF' || template.startTime === '00:00') return;

        // Get logs for this specific shift/day
        // Logic: Find logs that occurred on the assignment date (simplification for prototype)
        const assignmentDateStr = new Date(assignment.date).toDateString();
        const dayEvents = events.filter(e => 
            e.employeeId === assignment.employeeId && 
            new Date(e.timestamp).toDateString() === assignmentDateStr
        );

        const clockIn = dayEvents.find(e => e.type === TimeEventType.ClockIn);
        const clockOut = dayEvents.find(e => e.type === TimeEventType.ClockOut);
        const breakStart = dayEvents.find(e => e.type === TimeEventType.StartBreak);
        const breakEnd = dayEvents.find(e => e.type === TimeEventType.EndBreak);
        
        const employeeName = mockUsers.find(u => u.id === assignment.employeeId)?.name || 'Unknown';

        const shiftStartMinutes = getMinutes(template.startTime);
        const shiftEndMinutes = getMinutes(template.endTime);
        const isOvernight = shiftEndMinutes < shiftStartMinutes;

        const shiftStart = getShiftDateTime(assignment.date, template.startTime);
        const shiftEnd = getShiftDateTime(assignment.date, template.endTime, isOvernight);

        // --- LATE IN ---
        if (clockIn) {
            const gracePeriod = template.gracePeriodMinutes || 0;
            const lateThreshold = new Date(shiftStart.getTime() + gracePeriod * 60000);
            
            if (new Date(clockIn.timestamp) > lateThreshold) {
                const diffMins = Math.floor((new Date(clockIn.timestamp).getTime() - shiftStart.getTime()) / 60000);
                exceptions.push({
                    id: `EX-LATE-${assignment.id}`,
                    employeeId: assignment.employeeId,
                    employeeName,
                    date: new Date(assignment.date),
                    type: ExceptionType.LateIn,
                    details: `Clocked in ${diffMins} minutes late (Grace: ${gracePeriod}m).`,
                    status: 'Pending',
                    sourceEventId: clockIn.id
                });
            }
        } else if (now > shiftEnd) {
             // Missing In check could go here
             exceptions.push({
                id: `EX-MISSIN-${assignment.id}`,
                employeeId: assignment.employeeId,
                employeeName,
                date: new Date(assignment.date),
                type: ExceptionType.MissingIn,
                details: `No Clock-In record found for scheduled shift.`,
                status: 'Pending',
                sourceEventId: ''
            });
        }

        // --- MISSING OUT ---
        if (clockIn && !clockOut && now > shiftEnd) {
             exceptions.push({
                id: `EX-MISSOUT-${assignment.id}`,
                employeeId: assignment.employeeId,
                employeeName,
                date: new Date(assignment.date),
                type: ExceptionType.MissingOut,
                details: `Shift ended but no Clock-Out record found.`,
                status: 'Pending',
                sourceEventId: clockIn.id
            });
        }

        // --- UNDERTIME (Early Out) ---
        if (clockOut) {
            const outTime = new Date(clockOut.timestamp);
            // Allow 1 minute buffer for seconds difference
            if (outTime < new Date(shiftEnd.getTime() - 60000)) {
                 const diffMins = Math.floor((shiftEnd.getTime() - outTime.getTime()) / 60000);
                 exceptions.push({
                    id: `EX-UNDER-${assignment.id}`,
                    employeeId: assignment.employeeId,
                    employeeName,
                    date: new Date(assignment.date),
                    type: ExceptionType.Undertime,
                    details: `Clocked out ${diffMins} minutes early.`,
                    status: 'Pending',
                    sourceEventId: clockOut.id
                });
            }
        }

        // --- BREAK VALIDATIONS ---
        if (clockIn && clockOut && template.breakMinutes > 0) {
            if (!breakStart && !breakEnd) {
                 exceptions.push({
                    id: `EX-NOBREAK-${assignment.id}`,
                    employeeId: assignment.employeeId,
                    employeeName,
                    date: new Date(assignment.date),
                    type: ExceptionType.MissingBreak,
                    details: `No break logs detected for shift with ${template.breakMinutes}m break.`,
                    status: 'Pending',
                    sourceEventId: clockIn.id
                });
            } else if (breakStart && !breakEnd) {
                 exceptions.push({
                    id: `EX-NB-END-${assignment.id}`,
                    employeeId: assignment.employeeId,
                    employeeName,
                    date: new Date(assignment.date),
                    type: ExceptionType.MissingBreak,
                    details: `Break started but no end time logged.`,
                    status: 'Pending',
                    sourceEventId: breakStart.id
                });
            } else if (breakStart && breakEnd) {
                const durationMins = (new Date(breakEnd.timestamp).getTime() - new Date(breakStart.timestamp).getTime()) / 60000;
                if (durationMins > (template.breakMinutes + 5)) { // 5 min buffer
                     exceptions.push({
                        id: `EX-EXTBREAK-${assignment.id}`,
                        employeeId: assignment.employeeId,
                        employeeName,
                        date: new Date(assignment.date),
                        type: ExceptionType.ExtendedBreak,
                        details: `Break took ${durationMins.toFixed(0)} mins (Allowed: ${template.breakMinutes}m).`,
                        status: 'Pending',
                        sourceEventId: breakEnd.id
                    });
                }
            }
        }
    });

    return exceptions;
};
