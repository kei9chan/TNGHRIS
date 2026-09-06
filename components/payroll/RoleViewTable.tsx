import {DayStatus,DayTag,dateKey,statusPresets,leaveForDay,leaveLabel} from '../../services/scheduleStatuses';
import {scheduleLabel} from '../../services/schedulePolicy';

import React from 'react';
import { ShiftTemplate, ShiftAssignment, User, LeaveRequest, LeaveRequestStatus, OperatingHours } from '../../types';

interface RoleViewTableProps {
    selectedStatus?:DayTag|null;dayStatuses:DayStatus[]; onStatus:(employee:User,date:Date,tag:DayTag|null)=>void;
    view: 'grid' | 'role' | 'area';
    employeesByRole: Record<string, User[]>;
    employeesByArea: Record<string, User[]>;
    employees: User[];
    weekDates: Date[];
    operatingHours: OperatingHours | null;
    validationStatus: Record<string, { opening: boolean; closing: boolean; tooltip: string }>;
    assignments: ShiftAssignment[];
    suggestedAssignments: ShiftAssignment[];
    leaves: LeaveRequest[];
    templates: ShiftTemplate[];
    shiftColorClasses: Record<string, string>;
    onOpenDetailModal: (assignment: ShiftAssignment) => void;
    onOpenDrawer: (employee: User, date: Date) => void;
    isEditable: boolean;
}

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

const RoleViewTable: React.FC<RoleViewTableProps> = ({
    view, employeesByRole, employeesByArea, employees, weekDates, operatingHours, validationStatus, assignments,
    suggestedAssignments, leaves, selectedStatus,dayStatuses,onStatus,templates, shiftColorClasses, onOpenDetailModal, onOpenDrawer, isEditable
}) => {
    const renderEmployeeRow = (employee: User) => (
        <tr key={employee.id}>
            <td className="sticky left-0 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-gray-900 dark:text-white z-10 w-48">
                <div>
                    <p>{employee.name}</p>
                    <p className="text-xs text-gray-400">{employee.role}</p>
                </div>
            </td>
            {weekDates.map(date => {
                const assignment = assignments.find(a => a.employeeId === employee.id && new Date(a.date).toDateString() === date.toDateString());
                const suggestion = suggestedAssignments.find(a => a.employeeId === employee.id && new Date(a.date).toDateString() === date.toDateString());
                const leave=leaveForDay(leaves,employee.id,date);
                const ds=dayStatuses.find(s=>s.employee_id===employee.id&&s.work_date===dateKey(date));
                const drop={onDragOver:(e:React.DragEvent)=>{if(isEditable)e.preventDefault();},onDrop:(e:React.DragEvent)=>{e.preventDefault();const tag=e.dataTransfer.getData('application/x-tng-status') as DayTag;if(isEditable&&statusPresets.some(s=>s.tag===tag))onStatus(employee,date,tag);}};
                if(leave||ds?.tag){const preset=statusPresets.find(s=>s.tag===ds?.tag);const template=assignment?templates.find(t=>t.id===assignment.shiftTemplateId):null;return <td {...drop} key={date.toISOString()} className="px-2 py-2 align-top"><div className={`rounded-lg border p-2 text-xs ${leave?( (leave as any).paid?'bg-green-100 text-green-900':'bg-amber-100 text-amber-900'):preset?.color}`}><p className="font-bold">{leave?leaveLabel(leave):preset?.label}</p>{!leave&&isEditable&&<button className="min-h-11 underline" onClick={()=>onOpenDrawer(employee,date)}>Change status</button>}{leave&&<p>{(leave as any).leaveTypeName} · approved{leave.startTime?` · ${leave.startTime}–${leave.endTime}`:''}</p>}{template&&((leave&&(leave.startTime||leave.endTime))||!leave&&['skeletal','absence'].includes(ds?.tag??''))&&<p>{scheduleLabel(template)}</p>}{!leave&&isEditable&&<button className="min-h-11 underline" onClick={()=>onStatus(employee,date,null)}>Restore shift</button>}{leave&&assignment&&<button className="min-h-11 underline" onClick={()=>onOpenDetailModal(assignment)}>Original shift</button>}</div></td>;}

                if (assignment) {
                    const template = templates.find(t => t.id === assignment.shiftTemplateId);
                    return (
                        <td {...drop} key={date.toISOString()} className="px-2 py-2 align-top">
                            <button onClick={() => selectedStatus?onOpenDrawer(employee,date):onOpenDetailModal(assignment)} className={`w-full h-full p-2 rounded-md border text-left text-xs ${shiftColorClasses[template?.color || 'gray']}`}>
                                <p className="font-bold">{template?.name}</p>{template&&<p>{scheduleLabel(template)}</p>}
                            </button>
                        </td>
                    );
                }
                if(leave) {
                        return (
                        <td {...drop} key={date.toISOString()} className="px-2 py-2 align-top">
                            <button onClick={isEditable ? () => onOpenDrawer(employee, date) : undefined} disabled={!isEditable} className={`w-full h-full p-2 rounded-md border text-left text-xs ${shiftColorClasses['cyan']}`}>
                                <p className="font-bold">Leave / No Schedule</p><p>Approved leave · planned schedule required for payroll</p>
                            </button>
                        </td>
                    );
                }
                if (suggestion) {
                    const template = templates.find(t => t.id === suggestion.shiftTemplateId);
                    return (
                        <td {...drop} key={date.toISOString()} className="px-2 py-2 align-top">
                            <button onClick={isEditable ? () => onOpenDrawer(employee, date) : undefined} disabled={!isEditable} className={`w-full h-full p-2 rounded-md border-2 border-dashed text-left text-xs opacity-60 hover:opacity-100 transition-opacity ${shiftColorClasses[template?.color || 'gray']} disabled:cursor-not-allowed`}>
                                <p className="font-bold">{template?.name}</p>{template&&<p>{scheduleLabel(template)}</p>}
                                <p className="text-xs italic">Suggested</p>
                            </button>
                        </td>
                    );
                }
                return (
                    <td {...drop} key={date.toISOString()} className="px-2 py-2 align-top text-center">
                        <button onClick={isEditable ? () => onOpenDrawer(employee, date) : undefined} disabled={!isEditable} className="w-full h-12 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md flex items-center justify-center text-2xl disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent" aria-label={`Missing Schedule for ${employee.name}`}>+</button><span className="text-xs text-amber-700">Missing Schedule</span>
                    </td>
                );
            })}
        </tr>
    );

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border-t dark:border-gray-700">
                <thead className="bg-gray-50 dark:bg-slate-800/50">
                    <tr>
                        <th className="sticky left-0 bg-gray-50 dark:bg-slate-800/50 px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 z-10 w-48">Hours</th>
                        {weekDates.map(date => {
                            const dayKey = date.toLocaleDateString('en-US', { weekday: 'short' });
                            const hours = operatingHours?.hours[dayKey];
                            return (
                                <th key={`${date.toISOString()}-hours`} className="px-3 py-2 text-center text-xs font-medium text-gray-600 dark:text-gray-300 w-40">
                                    {hours && !(hours.open === '00:00' && hours.close === '00:00') ? `${hours.open} - ${hours.close}` : 'Closed'}
                                </th>
                            );
                        })}
                    </tr>
                    <tr>
                        <th className="sticky left-0 bg-gray-50 dark:bg-slate-800/50 px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white z-10 w-48">Employee</th>
                        {weekDates.map(date => {
                            const dayKey = date.toLocaleDateString('en-US', { weekday: 'short' });
                            const validation = validationStatus[dayKey];
                            return (
                                <th key={date.toISOString()} className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900 dark:text-white w-40">
                                    <div className="flex items-center justify-center gap-2">
                                        <span>{dayKey} {date.getDate()}</span>
                                        {validation && (!validation.opening || !validation.closing) && (
                                            <WarningIcon tooltip={validation.tooltip} />
                                        )}
                                    </div>
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                {view === 'grid' && (
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {employees.map(renderEmployeeRow)}
                    </tbody>
                )}
                {view === 'role' && (
                    Object.entries(employeesByRole).map(([role, employeesInRole]) => (
                        <tbody key={role} className="divide-y divide-gray-200 dark:divide-gray-700">
                            <tr className="bg-gray-100 dark:bg-slate-900/50">
                                <th colSpan={8} className="px-3 py-2 text-left text-sm font-semibold text-gray-900 dark:text-white sticky left-0 z-10">
                                    {role} ({(employeesInRole as User[]).length})
                                </th>
                            </tr>
                            {(employeesInRole as User[]).map(renderEmployeeRow)}
                        </tbody>
                    ))
                )}
                {view === 'area' && (
                    Object.entries(employeesByArea).map(([area, employeesInArea]) => (
                        <tbody key={area} className="divide-y divide-gray-200 dark:divide-gray-700">
                            <tr className="bg-gray-100 dark:bg-slate-900/50">
                                <th colSpan={8} className="px-3 py-2 text-left text-sm font-semibold text-gray-900 dark:text-white sticky left-0 z-10">
                                    {area} ({(employeesInArea as User[]).length})
                                </th>
                            </tr>
                            {(employeesInArea as User[]).map(renderEmployeeRow)}
                        </tbody>
                    ))
                )}
            </table>
        </div>
    );
};

export default RoleViewTable;
