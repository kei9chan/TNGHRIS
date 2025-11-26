
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';
import { NAV_LINKS } from '../../constants';
import type { NavLink as NavLinkType } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { Role } from '../../types';
import { mockOnboardingChecklists } from '../../services/mockData';


// SVG Icon Components
const UsersIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-2.253-9.527-9.527 0 0 0-4.121-2.253M15 19.128v-3.857A14.975 14.975 0 0 1 12 15c-2.648 0-5.131-.69-7.244-1.942v3.857m7.244 3.286A14.975 14.975 0 0 0 12 21c-2.648 0-5.131-.69-7.244-1.942m0 0a15.015 15.015 0 0 1-2.13-1.64m16.74 0a15.015 15.015 0 0 0 2.13-1.64m-18.86 0A14.975 14.975 0 0 0 12 15c2.648 0 5.131.69 7.244 1.942M12 15V9a3 3 0 0 0-3-3H9m1.5-3A3 3 0 0 1 12 3v3m-3.879 1.121a3 3 0 0 0-4.242 0M19.5 7.5a3 3 0 0 0-4.243 0" /></svg>);
const DocumentTextIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>);
const ClipboardCheckIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 0 1 9 9v.375M10.125 2.25A3.375 3.375 0 0 1 13.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375M9 15l2.25 2.25L15 12" /></svg>);
const PencilSquareIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>);
const TagIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>);
const ChartBarIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>);
const GiftIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 0 1-1.5 1.5H4.5a1.5 1.5 0 0 1-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 1 0 9.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1 1 14.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg>);
const DocumentDuplicateIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m9.75 11.625-3.375-3.375" /></svg>);

const iconMap: { [key: string]: React.FC<{className?: string}> } = {
    'Employee List': UsersIcon,
    'Personnel Action Notice': DocumentTextIcon,
    'Employee Lifecycle': ClipboardCheckIcon,
    'Contracts & Signing': PencilSquareIcon,
    'Benefits': GiftIcon,
    'Asset Management': TagIcon,
    'Analytics': ChartBarIcon,
    'COE': DocumentDuplicateIcon,
};


const EmployeeSubNav: React.FC = () => {
    const { user } = useAuth();
    const { can } = usePermissions();
    const location = useLocation();
    const employeeLink = NAV_LINKS.find(link => link.name === 'Employees');

    if (!employeeLink) {
        return null;
    }

    const subLinks = employeeLink.children?.filter(
        child => {
            const hasPermission = child.requiredPermission && can(child.requiredPermission.resource, child.requiredPermission.permission);
            if (!hasPermission) return false;

            // Special logic for Lifecycle for standard employees: 
            // Only show if they have an assigned checklist.
            if (child.name === 'Employee Lifecycle' && user?.role === Role.Employee) {
                return mockOnboardingChecklists.some(c => c.employeeId === user.id);
            }

            return true;
        }
    ) || [];

    if (!subLinks.length) {
        return null;
    }

    const baseClasses = 'flex items-center py-4 px-2 md:px-3 border-b-2 text-sm font-medium transition-colors duration-150 ease-in-out';
    const activeClasses = 'border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400';
    const inactiveClasses = 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600';

    return (
        <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
            <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mb-px">
                <div className="flex space-x-2 sm:space-x-4 md:space-x-8 overflow-x-auto">
                    {subLinks.map(link => {
                        const Icon = iconMap[link.name];
                        // Special check for COE to keep parent active when in sub-routes
                        const isActive = location.pathname.startsWith(link.path) || (link.name === 'COE' && location.pathname.startsWith('/employees/coe'));

                        return (
                            <NavLink
                                key={link.path}
                                to={link.path}
                                className={({ isActive: isLinkActive }) => `${baseClasses} ${isLinkActive || isActive ? activeClasses : inactiveClasses}`}
                            >
                                {Icon && <Icon className="w-5 h-5 mr-2 flex-shrink-0" />}
                                <span className="whitespace-nowrap">{link.name}</span>
                            </NavLink>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
};

export default EmployeeSubNav;
