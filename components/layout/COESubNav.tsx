
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';
import { NAV_LINKS } from '../../constants';
import type { NavLink as NavLinkType } from '../../types';


// SVG Icon Components
const DocumentDuplicateIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m9.75 11.625-3.375-3.375" /></svg>);
const DocumentTextIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>);


const iconMap: { [key: string]: React.FC<{className?: string}> } = {
    'Requests': DocumentTextIcon,
    'Templates': DocumentDuplicateIcon,
};


const COESubNav: React.FC = () => {
    const { can } = usePermissions();
    const location = useLocation();
    const employeeLink = NAV_LINKS.find(link => link.name === 'Employees');
    const coeLink = employeeLink?.children?.find(link => link.name === 'COE');


    if (!coeLink?.children) {
        return null;
    }

    const subLinks = coeLink.children.filter(
        child => child.requiredPermission && can(child.requiredPermission.resource, child.requiredPermission.permission)
    ) || [];

    if (!subLinks.length) {
        return null;
    }

    const baseClasses = 'flex items-center py-3 px-2 md:px-3 border-b-2 text-sm font-medium transition-colors duration-150 ease-in-out';
    const activeClasses = 'border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400';
    const inactiveClasses = 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600';

    return (
        <div className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700">
            <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mb-px">
                <div className="flex space-x-2 sm:space-x-4 md:space-x-8 overflow-x-auto">
                    {subLinks.map(link => {
                        const Icon = iconMap[link.name];
                        const isActive = location.pathname.startsWith(link.path);
                        return (
                            <NavLink
                                key={link.path}
                                to={link.path}
                                className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
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

export default COESubNav;
