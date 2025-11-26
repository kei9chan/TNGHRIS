
import React from 'react';
import { NavLink } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';
import { NAV_LINKS } from '../../constants';

// SVG Icon Components
const KeyIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" /></svg>);
const UsersIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-2.253-9.527-9.527 0 0 0-4.121-2.253M15 19.128v-3.857A14.975 14.975 0 0 1 12 15c-2.648 0-5.131-.69-7.244-1.942v3.857m7.244 3.286A14.975 14.975 0 0 0 12 21c-2.648 0-5.131-.69-7.244-1.942m0 0a15.015 15.015 0 0 1-2.13-1.64m16.74 0a15.015 15.015 0 0 0 2.13-1.64m-18.86 0A14.975 14.975 0 0 0 12 15c2.648 0 5.131.69 7.244 1.942M12 15V9a3 3 0 0 0-3-3H9m1.5-3A3 3 0 0 1 12 3v3m-3.879 1.121a3 3 0 0 0-4.242 0M19.5 7.5a3 3 0 0 0-4.243 0" /></svg>);
const Cog6ToothIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.26.716.53 1.003l.82 1.123c.345.47.909.734 1.503.734h2.096c.65 0 1.218.424 1.41 1.022l.188.633c.094.317.022.659-.188.89l-1.06 1.06c-.345.345-.515.823-.464 1.305l.114 1.054c.094.87-.503 1.648-1.37 1.815l-1.51.34c-.53.12-1.043.442-1.435.856l-1.06 1.06c-.345.345-.788.525-1.25.525h-2.593c-.463 0-.905-.18-1.25-.525l-1.06-1.06c-.392-.414-.906-.736-1.435-.856l-1.51-.34a1.648 1.648 0 0 1-1.37-1.815l.114-1.054c.05-.482-.12-.96-.464-1.305l-1.06-1.06c-.21-.23-.282-.572-.188-.89l.188-.633c.192-.598.76-1.022 1.41-1.022h2.096c.594 0 1.158-.264 1.503-.734l.82-1.123c.27-.287.467-.63.53-1.003l.213-1.281Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>);
const DocumentMagnifyingGlassIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.5h-8.021a1.125 1.125 0 0 1-1.125-1.125v-1.5A1.125 1.125 0 0 1 5.625 15h12.75a1.125 1.125 0 0 1 1.125 1.125v1.5a1.125 1.125 0 0 1-1.125 1.125H13.5m-3.031-1.125a3 3 0 1 0-5.962 0 3 3 0 0 0 5.962 0ZM15 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></svg>);
const InboxArrowDownIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>);
const CalendarDaysIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0h18" /></svg>);
const BuildingOffice2Icon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h6M9 12h6m-6 5.25h6M5.25 6.75h.008v.008H5.25V6.75zm0 5.25h.008v.008H5.25V12zm0 5.25h.008v.008H5.25v-5.25zm13.5-5.25h.008v.008h-.008V6.75zm0 5.25h.008v.008h-.008V12zm0 5.25h.008v.008h-.008v-5.25z" /></svg>);
const MapPinIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>);
const ChartPieIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" /></svg>);
const DocumentDuplicateIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m9.75 11.625-3.375-3.375" /></svg>);

const iconMap: { [key: string]: React.FC<{className?: string}> } = {
    'Roles & Permissions': KeyIcon,
    'User Management': UsersIcon,
    'Departments': BuildingOffice2Icon,
    'Site Management': MapPinIcon,
    'Audit Log': DocumentMagnifyingGlassIcon,
    'Settings': Cog6ToothIcon,
    'Leave Policies': CalendarDaysIcon,
    'Workforce Planning': ChartPieIcon,
    'COE Templates': DocumentDuplicateIcon,
};


const AdminSubNav: React.FC = () => {
    const { can } = usePermissions();
    const adminLink = NAV_LINKS.find(link => link.name === 'Admin');

    if (!adminLink) {
        return null;
    }

    const subLinks = adminLink.children?.filter(
        child => child.requiredPermission && can(child.requiredPermission.resource, child.requiredPermission.permission)
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
                        return (
                            <NavLink
                                key={link.path}
                                to={link.path}
                                className={({ isActive }) => `${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
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

export default AdminSubNav;
