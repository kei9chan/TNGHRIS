import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Permission, Resource } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';

const icon = (color: string, path: React.ReactNode) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={`h-8 w-8 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>{path}</svg>
);
const profileIcon = icon('text-indigo-500', <><path strokeLinecap="round" strokeLinejoin="round" d="M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M5.1 19a9 9 0 1 1 13.8 0A10 10 0 0 0 12 16a10 10 0 0 0-6.9 3Z" /></>);
const groupIcon = icon('text-pink-500', <><path strokeLinecap="round" strokeLinejoin="round" d="M15 19H7v-1a4 4 0 0 1 8 0v1ZM11 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M17 8a2 2 0 1 1 0 4m1 2a3 3 0 0 1 3 3v1h-3" /></>);
const homeIcon = icon('text-emerald-500', <path strokeLinecap="round" strokeLinejoin="round" d="m3 12 9-9 9 9M5 10v11h14V10M9 21v-7h6v7" />);
const documentIcon = icon('text-gray-500', <><path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l5 5v13H7V3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M14 3v6h5M10 13h6m-6 4h6" /></>);
const scheduleIcon = icon('text-cyan-500', <><path strokeLinecap="round" strokeLinejoin="round" d="M6 3v3m12-3v3M4 8h16v13H4V8Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h3m2 0h3m-8 4h3m2 0h3" /></>);
const calendarIcon = icon('text-green-500', <><path strokeLinecap="round" strokeLinejoin="round" d="M6 3v3m12-3v3M4 8h16v13H4V8Z" /><path strokeLinecap="round" strokeLinejoin="round" d="m8 15 2 2 5-5" /></>);
const clockIcon = icon('text-orange-500', <><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" /></>);
const ticketIcon = icon('text-yellow-500', <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6Z" />);
const warningIcon = icon('text-red-500', <><path strokeLinecap="round" strokeLinejoin="round" d="m12 3 9 17H3L12 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 3h.01" /></>);
const plusIcon = icon('text-teal-500', <><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21a7 7 0 0 1 14 0" /><path strokeLinecap="round" strokeLinejoin="round" d="M19 8v6m-3-3h6" /></>);
const announcementIcon = icon('text-purple-500', <><path strokeLinecap="round" strokeLinejoin="round" d="M4 11v4h4l9 4V7l-9 4H4Z" /><path strokeLinecap="round" strokeLinejoin="round" d="m8 15 1 5h3l-1-4" /></>);
const starIcon = icon('text-amber-500', <path strokeLinecap="round" strokeLinejoin="round" d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.3 6.1-.9L12 3Z" />);

interface QuickLink {
  id: string;
  name: string;
  path: string;
  state?: object;
  icon: React.ReactNode;
  resource: Resource;
  action: Permission;
}

const QUICK_LINKS: QuickLink[] = [
  { id: 'profile', name: 'My Profile', path: '/my-profile', icon: profileIcon, resource: 'Employees', action: Permission.View },
  { id: 'oncall', name: 'Request On-Call', path: '/dashboard', state: { openManpowerModal: true }, icon: groupIcon, resource: 'Manpower', action: Permission.Create },
  { id: 'wfh', name: 'Request WFH', path: '/payroll/wfh-requests', state: { openNewModal: true }, icon: homeIcon, resource: 'WFH', action: Permission.Create },
  { id: 'coe', name: 'Request COE', path: '/dashboard', state: { openRequestCOE: true }, icon: documentIcon, resource: 'COE', action: Permission.Create },
  { id: 'schedule', name: 'View Schedule', path: '/payroll/timekeeping', icon: scheduleIcon, resource: 'Timekeeping', action: Permission.View },
  { id: 'leave', name: 'Request Leave', path: '/payroll/leave', icon: calendarIcon, resource: 'Leave', action: Permission.Create },
  { id: 'overtime', name: 'Request Overtime', path: '/payroll/overtime-requests', state: { openNewOTModal: true }, icon: clockIcon, resource: 'OT', action: Permission.Create },
  { id: 'ticket', name: 'Submit a Ticket', path: '/helpdesk/tickets', state: { openNewTicketModal: true }, icon: ticketIcon, resource: 'Helpdesk', action: Permission.Create },
  { id: 'ir', name: 'File New IR', path: '/feedback/cases', state: { openNewIrModal: true }, icon: warningIcon, resource: 'Feedback', action: Permission.Create },
  { id: 'jobreq', name: 'Job Requisition', path: '/recruitment/requisitions', state: { openNewReqModal: true }, icon: plusIcon, resource: 'Requisitions', action: Permission.Create },
  { id: 'announcements', name: 'View Announcements', path: '/helpdesk/announcements', icon: announcementIcon, resource: 'Announcements', action: Permission.View },
  { id: 'achievements', name: 'View Achievements', path: '/my-profile#achievements', icon: starIcon, resource: 'Employees', action: Permission.View },
];

const QuickLinks: React.FC = () => {
  const { can, loading } = usePermissions();
  const visibleLinks = useMemo(
    () => QUICK_LINKS.filter(link => can(link.resource, link.action)),
    [can],
  );

  if (loading || visibleLinks.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">Quick Links</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
        {visibleLinks.map(link => (
          <Link key={link.id} to={link.path} state={link.state} className="group block hover:no-underline">
            <div className="h-full rounded-lg bg-white p-4 shadow-md transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-xl dark:bg-slate-800">
              <div className="flex flex-col items-center text-center">
                {link.icon}
                <h3 className="mt-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{link.name}</h3>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
};

export default QuickLinks;
