
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Card from '../ui/Card';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { Role } from '../../types';

// Icons
const UserCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const CalendarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
const DocumentTextIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
const TicketIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 00-2-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>;
const ExclamationTriangleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
const CalendarDaysIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-cyan-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0h18" /></svg>;
const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const DocumentDuplicateIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m9.75 11.625-3.375-3.375" /></svg>;
const HomeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>;

// Updated Icons
const UserPlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM4 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 10.5 21c-2.39 0-4.64-.666-6.5-1.765Z" /></svg>;
const MegaphoneIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" /></svg>;
const StarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.54.043.757.733.364 1.093l-4.086 3.633a.563.563 0 0 0-.162.54l1.205 5.25c.105.458-.427.836-.848.567l-4.83-2.91a.563.563 0 0 0-.582 0l-4.83 2.91c-.421.269-.953-.109-.848-.567l1.205-5.25a.563.563 0 0 0-.162-.54l-4.086-3.633c-.393-.36-.176-1.05.364-1.093l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>;
const UserGroupIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.122-1.28-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.122-1.28.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;


interface QuickLinkCardProps {
  name: string;
  path: string;
  state?: object;
  icon: React.ReactNode;
}

const QuickLinkCard: React.FC<QuickLinkCardProps> = ({ name, path, state, icon }) => (
  <Link to={path} state={state} className="block hover:no-underline group">
    <div className="h-full bg-white dark:bg-slate-800 shadow-md rounded-lg p-4 transition-all duration-200 ease-in-out group-hover:shadow-xl group-hover:-translate-y-1">
      <div className="flex flex-col items-center text-center">
        {icon}
        <h3 className="mt-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{name}</h3>
      </div>
    </div>
  </Link>
);


type AccessScope =
  | 'full'
  | 'view'
  | 'approveBu'
  | 'viewBu'
  | 'ownBu'
  | 'ownTeam'
  | 'own'
  | 'ownRequest'
  | 'respond'
  | 'viewRespond'
  | 'logs'
  | 'none';

type QuickLinkId =
  | 'profile'
  | 'oncall'
  | 'wfh'
  | 'coe'
  | 'schedule'
  | 'leave'
  | 'overtime'
  | 'ticket'
  | 'ir'
  | 'jobreq'
  | 'announcements'
  | 'achievements';

const accessMatrix: Record<Role, Record<QuickLinkId, AccessScope>> = {
  [Role.Admin]: {
    profile: 'full',
    oncall: 'full',
    wfh: 'full',
    coe: 'full',
    schedule: 'full',
    leave: 'full',
    overtime: 'full',
    ticket: 'full',
    ir: 'full',
    jobreq: 'full',
    announcements: 'full',
    achievements: 'full',
  },
  [Role.HRManager]: {
    profile: 'full',
    oncall: 'full',
    wfh: 'full',
    coe: 'full',
    schedule: 'full',
    leave: 'full',
    overtime: 'full',
    ticket: 'full',
    ir: 'full',
    jobreq: 'full',
    announcements: 'full',
    achievements: 'full',
  },
  [Role.HRStaff]: {
    profile: 'full',
    oncall: 'full',
    wfh: 'full',
    coe: 'full',
    schedule: 'full',
    leave: 'full',
    overtime: 'full',
    ticket: 'full',
    ir: 'full',
    jobreq: 'full',
    announcements: 'full',
    achievements: 'full',
  },
  [Role.BOD]: {
    profile: 'view',
    oncall: 'view',
    wfh: 'view',
    coe: 'none',
    schedule: 'view',
    leave: 'view',
    overtime: 'view',
    ticket: 'view',
    ir: 'none',
    jobreq: 'viewBu',
    announcements: 'view',
    achievements: 'view',
  },
  [Role.GeneralManager]: {
    profile: 'view',
    oncall: 'viewBu',
    wfh: 'viewBu',
    coe: 'none',
    schedule: 'viewBu',
    leave: 'viewBu',
    overtime: 'viewBu',
    ticket: 'respond',
    ir: 'none',
    jobreq: 'viewBu',
    announcements: 'viewBu',
    achievements: 'none',
  },
  [Role.OperationsDirector]: {
    profile: 'view',
    oncall: 'approveBu',
    wfh: 'approveBu',
    coe: 'none',
    schedule: 'approveBu',
    leave: 'approveBu',
    overtime: 'approveBu',
    ticket: 'respond',
    ir: 'none',
    jobreq: 'viewBu',
    announcements: 'viewBu',
    achievements: 'none',
  },
  [Role.BusinessUnitManager]: {
    profile: 'view',
    oncall: 'ownBu',
    wfh: 'ownBu',
    coe: 'ownBu',
    schedule: 'ownBu',
    leave: 'ownBu',
    overtime: 'ownBu',
    ticket: 'respond',
    ir: 'full',
    jobreq: 'ownBu',
    announcements: 'ownBu',
    achievements: 'none',
  },
  [Role.Manager]: {
    profile: 'view',
    oncall: 'ownTeam',
    wfh: 'ownTeam',
    coe: 'ownTeam',
    schedule: 'ownTeam',
    leave: 'ownTeam',
    overtime: 'ownTeam',
    ticket: 'none',
    ir: 'full',
    jobreq: 'ownTeam',
    announcements: 'ownTeam',
    achievements: 'none',
  },
  [Role.Employee]: {
    profile: 'view',
    oncall: 'none',
    wfh: 'own',
    coe: 'own',
    schedule: 'own',
    leave: 'own',
    overtime: 'own',
    ticket: 'own',
    ir: 'full',
    jobreq: 'none',
    announcements: 'ownBu',
    achievements: 'own',
  },
  [Role.FinanceStaff]: {
    profile: 'view',
    oncall: 'logs',
    wfh: 'none',
    coe: 'none',
    schedule: 'none',
    leave: 'none',
    overtime: 'none',
    ticket: 'viewRespond',
    ir: 'none',
    jobreq: 'none',
    announcements: 'none',
    achievements: 'none',
  },
  [Role.Auditor]: {
    profile: 'view',
    oncall: 'logs',
    wfh: 'logs',
    coe: 'none',
    schedule: 'logs',
    leave: 'logs',
    overtime: 'logs',
    ticket: 'logs',
    ir: 'none',
    jobreq: 'logs',
    announcements: 'logs',
    achievements: 'logs',
  },
  [Role.Recruiter]: {
    profile: 'none',
    oncall: 'none',
    wfh: 'none',
    coe: 'none',
    schedule: 'none',
    leave: 'none',
    overtime: 'none',
    ticket: 'respond',
    ir: 'none',
    jobreq: 'full',
    announcements: 'full',
    achievements: 'none',
  },
  [Role.IT]: {
    profile: 'none',
    oncall: 'none',
    wfh: 'none',
    coe: 'none',
    schedule: 'none',
    leave: 'none',
    overtime: 'none',
    ticket: 'respond',
    ir: 'none',
    jobreq: 'none',
    announcements: 'none',
    achievements: 'none',
  },
};

const QuickLinks: React.FC = () => {
    const { user } = useAuth();
    const { getIrAccess } = usePermissions();
    const irAccess = useMemo(() => getIrAccess(), [getIrAccess]);

    const visibleLinks = useMemo(() => {
        const allQuickLinks: (QuickLinkCardProps & { id: QuickLinkId; scope: AccessScope })[] = [
            { id: 'profile', name: 'My Profile', path: '/my-profile', icon: <UserCircleIcon />, scope: 'full' },
            { id: 'oncall', name: 'Request On-Call', path: '/dashboard', state: { openManpowerModal: true }, icon: <UserGroupIcon />, scope: 'full' },
            { id: 'wfh', name: 'Request WFH', path: '/payroll/wfh-requests', state: { openNewModal: true }, icon: <HomeIcon />, scope: 'full' },
            { id: 'coe', name: 'Request COE', path: '/dashboard', state: { openRequestCOE: true }, icon: <DocumentDuplicateIcon />, scope: 'full' },
            { id: 'schedule', name: 'View Schedule', path: '/payroll/timekeeping', icon: <CalendarDaysIcon />, scope: 'full' },
            { id: 'leave', name: 'Request Leave', path: '/payroll/leave', icon: <CalendarIcon />, scope: 'full' },
            { id: 'overtime', name: 'Request Overtime', path: '/payroll/overtime-requests', state: { openNewOTModal: true }, icon: <ClockIcon />, scope: 'full' },
            { id: 'ticket', name: 'Submit a Ticket', path: '/helpdesk/tickets', state: { openNewTicketModal: true }, icon: <TicketIcon />, scope: 'full' },
            { id: 'ir', name: 'File New IR', path: '/feedback/cases', state: { openNewIrModal: true }, icon: <ExclamationTriangleIcon />, scope: 'full' },
            { id: 'jobreq', name: 'Job Requisition', path: '/recruitment/requisitions', state: { openNewReqModal: true }, icon: <UserPlusIcon />, scope: 'full' },
            { id: 'announcements', name: 'View Announcements', path: '/helpdesk/announcements', icon: <MegaphoneIcon />, scope: 'full' },
            { id: 'achievements', name: 'View Achievements', path: '/my-profile#achievements', icon: <StarIcon />, scope: 'full' },
        ];

        if (!user || !user.role) return [];
        const roleMap = accessMatrix[user.role as Role];
        if (!roleMap) return [];

        return allQuickLinks.filter(link => {
          const scope = roleMap[link.id] || 'none';
          if (link.id === 'ir') {
            return irAccess.canCreate;
          }
          return scope !== 'none';
        });

    }, [user, irAccess, getIrAccess]);

    if (visibleLinks.length === 0) return null;

    return (
        <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Quick Links</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
            {visibleLinks.map(link => (
            <QuickLinkCard key={link.id} {...link} />
            ))}
        </div>
        </div>
    );
};

export default QuickLinks;
