import React from 'react';
import {Link} from 'react-router-dom';
import {AttendanceIssue,approvedLabels,requestStatus,manila} from '../../services/attendanceIssues';
export default function AttendanceIssueBadges({rows,employee,date}:{rows:AttendanceIssue[];employee:string;date:string}){return <>{rows.filter(r=>r.employee_id===employee&&r.work_date===date&&!['withdrawn','cancelled'].includes(r.status)).map(r=><Link key={r.id} to={'/payroll/attendance-requests?review='+r.id} className="my-1 block rounded-lg border border-violet-400 bg-violet-50 p-2 text-xs text-violet-900 dark:bg-violet-950 dark:text-violet-100">{r.status==='approved'?approvedLabels[r.kind]:requestStatus(r)}{r.requested_time&&' · '+manila(r.requested_time)}</Link>)}</>;}
