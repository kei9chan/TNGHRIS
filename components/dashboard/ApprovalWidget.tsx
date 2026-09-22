import React from 'react';
import {useAttendanceIssues,issueLabels,shiftText} from '../../services/attendanceIssues';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useApprovals } from '../../hooks/useApprovals';
import { useAdditionalApprovals } from '../../hooks/useAdditionalApprovals';
import { ApprovalRequestKind, getApprovalReviewUrl } from '../../services/approvalDeepLinks';

type Item = { id: string; kind: ApprovalRequestKind; employee: string; details: string; submitted?: Date | string; relevantDate?: Date | string };
const labels: Record<ApprovalRequestKind,string> = {attendance:'Attendance',leave:'Leave',wfh:'WFH',overtime:'Overtime',manpower:'On-call',nte:'NTE',pan:'PAN',requisition:'Job Requisition',award:'Award',offer:'Offer',asset:'Asset Requests',benefit:'Benefit',pay_package:'Pay Packages'};
const dateText = (v?: Date | string) => v && Number.isFinite(new Date(v).getTime()) ? new Date(v).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric'}) : '';
export default function ApprovalWidget() {
  const {user}=useAuth();
  const a=useApprovals({user});
  const b=useAdditionalApprovals(user);
  const attendance=useAttendanceIssues();
  const items: Item[] = [
    ...attendance.pending.map(r=>({id:r.id,kind:'attendance' as const,employee:r.employeeName,details:issueLabels[r.kind]+' · '+r.work_date+' · '+shiftText(r.schedule),submitted:r.submitted_at,relevantDate:r.due_at})),
    ...a.pendingLeaveApprovals.map(r=>({id:r.id,kind:'leave' as const,employee:r.employeeName,details:'Leave · '+dateText(r.startDate)+'–'+dateText(r.endDate)+' · '+r.durationDays+' days',submitted:r.createdAt,relevantDate:r.startDate})),
    ...a.pendingWfhApprovals.map(r=>({id:r.id,kind:'wfh' as const,employee:r.employeeName,details:'Work from home · '+dateText(r.date)+(r.endDate?'–'+dateText(r.endDate):''),submitted:r.createdAt,relevantDate:r.date})),
    ...a.pendingOtApprovals.map(r=>({id:r.id,kind:'overtime' as const,employee:r.employeeName,details:dateText(r.date)+' · '+r.startTime+'–'+r.endTime,submitted:r.submittedAt,relevantDate:r.date})),
    ...a.pendingManpowerApprovals.map(r=>({id:r.id,kind:'manpower' as const,employee:r.requesterName,details:'On-call coverage · '+(r.businessUnitName||''),submitted:r.createdAt})),
    ...b.pendingNTEApprovals.map(r=>({id:r.id,kind:'nte' as const,employee:r.employeeName,details:r.reference+' · '+r.currentStep,submitted:r.createdAt})),
    ...b.pendingPANApprovals.map(r=>({id:r.id,kind:'pan' as const,employee:r.employeeName,details:r.action+' · Effective '+dateText(r.effectiveDate),submitted:r.createdAt,relevantDate:r.effectiveDate})),
    ...b.pendingBenefitApprovals.map(r=>({id:r.id,kind:'benefit' as const,employee:r.employeeName,details:r.benefitTypeName+' · '+dateText(r.dateNeeded),submitted:r.submissionDate,relevantDate:r.dateNeeded})),
    ...b.pendingRequisitionApprovals.map(r=>({id:r.id,kind:'requisition' as const,employee:r.title,details:r.reference+' · '+r.currentStep,submitted:r.createdAt})),
    ...b.pendingAwardApprovals.map(r=>({id:r.id,kind:'award' as const,employee:r.employeeName,details:r.awardTitle,submitted:r.createdAt})),
    ...b.pendingOfferApprovals.map(r=>({id:r.id,kind:'offer' as const,employee:r.candidateName,details:r.jobTitle,submitted:r.createdAt})),
    ...b.pendingAssetApprovals.map(r=>({id:r.id,kind:'asset' as const,employee:r.employeeName,details:r.assetDescription,submitted:r.createdAt})),
    ...b.pendingPayPackageApprovals.map(r=>({id:r.id,kind:'pay_package' as const,employee:r.employeeName,details:'Pay package · Waiting for '+(r.pendingApprovers.join(' or ')||'assigned reviewer'),submitted:r.createdAt,relevantDate:r.effectiveFrom})),
  ];
  const unique=[...new Map(items.map(r=>[r.kind+':'+r.id,r])).values()];
  const groups = (Object.keys(labels) as ApprovalRequestKind[]).map(kind => ({kind, requests: unique.filter(item => item.kind === kind)})).filter(group => group.requests.length);
  const error=a.approvalError||b.additionalApprovalError||attendance.error;
  if(!user||(!items.length&&!error))return null;
  return <section aria-labelledby="approval-inbox-title" className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="approval-inbox-title" className="text-2xl font-bold text-slate-900 dark:text-white">Needs your approval <span className="ml-2 inline-flex rounded-full bg-violet-600 px-3 py-1 text-base text-white">{unique.length}</span></h2><p className="mt-2 text-slate-500 dark:text-slate-300">Requests waiting for your decision</p></div><Link to="/approvals" className="hidden min-h-11 items-center rounded-lg border border-violet-500 px-4 font-semibold text-violet-700 dark:text-violet-300 sm:inline-flex">Open Approval Center →</Link></div>
    {error&&<div role="alert" className="mt-4 text-amber-700 dark:text-amber-300">Some requests could not be loaded. <button className="min-h-11 underline" onClick={()=>Promise.all([a.refreshApprovals(),b.refreshAdditionalApprovals(),attendance.load()])}>Retry</button></div>}
    <div className="mt-5 flex flex-col gap-2">{groups.map(({kind,requests}) => {
      const opensRequest = requests.length === 1;
      const href = opensRequest ? getApprovalReviewUrl(kind, requests[0].id) : `/approvals?type=${kind}`;
      return <Link key={kind} to={href} aria-label={`${opensRequest ? 'Review request' : 'Review queue'} for ${labels[kind]}: ${requests.length} pending`} className="flex min-h-16 items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 hover:border-violet-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 dark:border-slate-600 dark:bg-slate-900/40">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1"><h3 className="min-w-28 font-bold text-slate-900 dark:text-white">{labels[kind]}</h3><p className="text-sm text-slate-500 dark:text-slate-300">{requests.length} pending approval{requests.length === 1 ? '' : 's'}</p></div><span className="inline-flex min-w-10 items-center justify-center rounded-full bg-violet-100 px-3 py-2 font-bold text-violet-900 dark:bg-violet-900 dark:text-violet-100">{requests.length}</span><span className="text-sm font-semibold text-violet-700 dark:text-violet-300">{opensRequest ? 'Review request →' : 'Review queue →'}</span>
      </Link>;
    })}</div>
    <Link to="/approvals" className="mt-5 inline-flex min-h-11 items-center font-semibold text-violet-700 dark:text-violet-300">Open Approval Center →</Link>
  </section>;
}
