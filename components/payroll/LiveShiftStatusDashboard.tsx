import React, { useState, useEffect, useMemo } from 'react';
import { User, ShiftAssignment, ShiftTemplate } from '../../types';
import Card from '../ui/Card';
import EmployeePhoto from '../employees/EmployeePhoto';
import { supabase } from '../../services/supabaseClient';

interface LiveShiftStatusDashboardProps {
  flaggedEmployees?:string[];
  selectedBuId: string;
  actions?: React.ReactNode;
  employees: User[];
  assignments: ShiftAssignment[];
  templates: ShiftTemplate[];
}

const StatusIndicator: React.FC<{ status: 'in' | 'late' | 'break' }> = ({ status }) => {
    const colorClasses = {
        in: 'bg-green-500',
        late: 'bg-yellow-400',
        break: 'bg-blue-500',
    };
    return <div className={`h-3 w-3 rounded-full flex-shrink-0 ${colorClasses[status]}`} title={status}></div>;
};


const EmployeeStatusCard: React.FC<{ employee: User, status: 'in' | 'late' | 'break' }> = ({ employee, status }) => (
    <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700/50">
        <EmployeePhoto employeeId={employee.id} name={employee.name}/>
        <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate text-gray-800 dark:text-gray-200">{employee.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{employee.position}</p>
        </div>
        <StatusIndicator status={status} />
    </div>
);

const StatusColumn: React.FC<{ title: string; data: Record<string, User[]>; status: 'in' | 'late' | 'break'; count: number; colorClass: string }> = ({ title, data, status, count, colorClass }) => {
    const departments = Object.keys(data).sort();
    
    return (
        <div>
            <h3 className={`font-semibold text-lg mb-2 ${colorClass}`}>{title} ({count})</h3>
            <div className="space-y-4 max-h-60 overflow-y-auto pr-2">
                {departments.length > 0 ? departments.map(dept => (
                    <div key={dept}>
                        <h4 className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400 pb-1 mb-1 border-b border-gray-200 dark:border-gray-700">{dept}</h4>
                        <div className="space-y-2">
                            {data[dept].map(emp => <EmployeeStatusCard key={emp.id} employee={emp} status={status} />)}
                        </div>
                    </div>
                )) : <p className="text-sm text-gray-500">No employees in this category.</p> }
            </div>
        </div>
    );
};


const LiveShiftStatusDashboard: React.FC<LiveShiftStatusDashboardProps> = ({ flaggedEmployees=[],selectedBuId, actions, employees, assignments, templates }) => {
    const [live,setLive]=useState<{employeeId:string;status:'in'|'late'|'break'}[]>([]);
    const [loadError,setLoadError]=useState('');
    const employeeKey=employees.map(e=>e.id).sort().join(',');
    useEffect(()=>{let active=true;const load=async()=>{if(!employeeKey){setLive([]);return;}const {data,error}=await supabase.rpc('get_live_shift_status',{p_employees:employeeKey.split(',')});if(!active)return;if(error){setLoadError(error.message);return;}setLoadError('');setLive(data??[]);};void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},30000);return()=>{active=false;clearInterval(timer);};},[employeeKey]);
    const {clockedIn,scheduledLate,onBreak}=useMemo(()=>{const groups={clockedIn:{} as Record<string,User[]>,scheduledLate:{} as Record<string,User[]>,onBreak:{} as Record<string,User[]>};const byId=new Map<string,User>(employees.map(e=>[e.id,e] as [string,User]));for(const item of live){const employee=byId.get(item.employeeId);if(!employee)continue;const group=item.status==='in'?groups.clockedIn:item.status==='break'?groups.onBreak:groups.scheduledLate;const dept=employee.department||'No Department';(group[dept]??=[]).push(employee);}return groups;},[employees,live]);

    const clockedInCount = Object.values(clockedIn).flat().length;
    const lateCount = Object.values(scheduledLate).flat().length;
    const onBreakCount = Object.values(onBreak).flat().length;

    return (
        <Card title="Who's On Shift - Live Status" className="mb-6" actions={actions}>
            <div>{loadError&&<p role="alert" className="mb-3 text-sm text-amber-700">Live attendance could not refresh: {loadError}</p>}{employees.filter(e=>flaggedEmployees.includes(e.id)).map(e=><a key={e.id} href="/payroll/attendance-review" className="mb-3 mr-3 inline-block rounded bg-amber-100 px-3 py-2 text-sm text-amber-900">⚠ {e.name} · attendance review</a>)}<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatusColumn title="Clocked In" data={clockedIn} status="in" count={clockedInCount} colorClass="text-green-600 dark:text-green-400" />
                <StatusColumn title="Scheduled (Late)" data={scheduledLate} status="late" count={lateCount} colorClass="text-yellow-500 dark:text-yellow-400" />
                <StatusColumn title="On Break" data={onBreak} status="break" count={onBreakCount} colorClass="text-blue-500 dark:text-blue-400" />
            </div></div>
        </Card>
    );
};

export default LiveShiftStatusDashboard;
