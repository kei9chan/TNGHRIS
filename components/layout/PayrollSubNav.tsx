
import React, { useState, useEffect, useMemo } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';
import { NAV_LINKS } from '../../constants';
import type { NavLink as NavLinkType } from '../../types';

// SVG Icon Components
const ClockIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>);
const FingerPrintIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0 1 19.5 12c0 4.142-3.358 7.5-7.5 7.5S4.5 16.142 4.5 12a7.5 7.5 0 0 1 3.364-5.757m-2.26-2.26L5.604 5.604m12.792 12.792 1.414 1.414M5.604 18.396 4.19 19.81m15.62-14.206L18.396 5.604M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm-3-6a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z" /></svg>);
const DocumentMagnifyingGlassIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.5h-8.021a1.125 1.125 0 0 1-1.125-1.125v-1.5A1.125 1.125 0 0 1 5.625 15h12.75a1.125 1.125 0 0 1 1.125 1.125v1.5a1.125 1.125 0 0 1-1.125 1.125H13.5m-3.031-1.125a3 3 0 1 0-5.962 0 3 3 0 0 0 5.962 0ZM15 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></svg>);
const BriefcaseIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>);
const CalculatorIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 3h.008v.008H8.25v-.008Zm0 3h.008v.008H8.25v-.008Zm3-6h.008v.008H11.25v-.008Zm0 3h.008v.008H11.25v-.008Zm0 3h.008v.008H11.25v-.008Zm3-6h.008v.008H14.25v-.008Zm0 3h.008v.008H14.25v-.008Zm0 3h.008v.008H14.25v-.008ZM6 6h12v12H6V6Z" /></svg>);
const ShieldExclamationIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>);
const CreditCardIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15A2.25 2.25 0 0 0 2.25 6.75v10.5A2.25 2.25 0 0 0 4.5 19.5Z" /></svg>);
const ChartBarIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>);
const BanknotesIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>);
const DocumentTextIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>);
const BuildingLibraryIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z" /></svg>);
const DocumentDuplicateIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m9.75 11.625-3.375-3.375" /></svg>);
const ArchiveBoxXMarkIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /><path strokeLinecap="round" strokeLinejoin="round" d="m14.25 7.5-1.5-1.5-1.5 1.5m1.5-1.5v4.5" /></svg>);
const SunIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>);
const ClipboardDocumentCheckIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" /></svg>);
const UserGroupIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" /></svg>);
const HomeIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h7.5" /></svg>);
const ChartPieIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" /></svg>);

const iconMap: { [key: string]: React.FC<{className?: string}> } = {
    'Timekeeping': ClockIcon,
    'Clock-in/Out': FingerPrintIcon,
    'Overtime Requests': BriefcaseIcon,
    'WFH Requests': HomeIcon,
    'Leave': SunIcon,
    'Loan Application System': CreditCardIcon,
    'Exceptions': ShieldExclamationIcon,
    'Payroll Prep': CalculatorIcon,
    'Payroll Staging': BanknotesIcon,
    'Payslips': DocumentTextIcon,
    'Government Reports': BuildingLibraryIcon,
    'Report Templates': DocumentDuplicateIcon,
    'Reports': ChartBarIcon,
    'Final Pay Calculator': ArchiveBoxXMarkIcon,
    'Clock Log': DocumentMagnifyingGlassIcon,
    'Daily Time Review': ClipboardDocumentCheckIcon,
    'Manpower Planning': UserGroupIcon,
    'Workforce Planning': ChartPieIcon,
};


const PayrollSubNav: React.FC = () => {
    const { can } = usePermissions();
    const location = useLocation();
    const navigate = useNavigate();
    const payrollLink = NAV_LINKS.find(link => link.name === 'Payroll');

    const [activeGroup, setActiveGroup] = useState<string | null>(null);

    const navGroups = useMemo(() => {
        if (!payrollLink?.children) return [];

        const subLinks = payrollLink.children.filter(
            child => child.requiredPermission && can(child.requiredPermission.resource, child.requiredPermission.permission)
        ) || [];

        return [
            {
                name: 'Timekeeping & Attendance',
                links: subLinks.filter(link => ['Timekeeping', 'Manpower Planning', 'Workforce Planning', 'Daily Time Review', 'Clock-in/Out', 'Overtime Requests', 'WFH Requests', 'Leave', 'Exceptions', 'Clock Log'].includes(link.name))
            },
            {
                name: 'Payroll',
                links: subLinks.filter(link => ['Payroll Prep', 'Payroll Staging', 'Payslips', 'Loan Application System', 'Final Pay Calculator'].includes(link.name))
            },
            {
                name: 'Compliance & Reports',
                links: subLinks.filter(link => ['Government Reports', 'Report Templates', 'Reports'].includes(link.name))
            }
        ].filter(group => group.links.length > 0);

    }, [can, payrollLink]);

    useEffect(() => {
        const currentGroup = navGroups.find(group => 
            group.links.some(link => 
                location.pathname === link.path || 
                (location.pathname.startsWith(link.path) && location.pathname.charAt(link.path.length) === '/')
            )
        );
        setActiveGroup(currentGroup ? currentGroup.name : navGroups[0]?.name || null);
    }, [location.pathname, navGroups]);

    if (navGroups.length === 0) {
        return null;
    }

    const activeGroupLinks = navGroups.find(g => g.name === activeGroup)?.links || [];

    const groupBaseClasses = 'py-4 px-1 border-b-2 font-medium text-sm focus:outline-none cursor-pointer';
    const groupActiveClasses = 'border-indigo-500 text-indigo-600 dark:text-indigo-400';
    const groupInactiveClasses = 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200';

    const linkBaseClasses = 'flex items-center py-3 px-2 text-sm font-medium transition-colors duration-150 ease-in-out';
    const linkActiveClasses = 'text-indigo-600 dark:text-indigo-400';
    const linkInactiveClasses = 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white';


    return (
        <div className="bg-white dark:bg-gray-800 shadow-sm">
            {/* Level 1: Groups */}
            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mb-px">
                    <div className="flex space-x-8 overflow-x-auto">
                        {navGroups.map(group => {
                            const firstLink = group.links[0];
                            if (!firstLink) return null;

                            return (
                                <div
                                    key={group.name}
                                    onClick={() => {
                                        setActiveGroup(group.name);
                                        navigate(firstLink.path);
                                    }}
                                    className={`${groupBaseClasses} ${activeGroup === group.name ? groupActiveClasses : groupInactiveClasses}`}
                                >
                                    {group.name}
                                </div>
                            );
                        })}
                    </div>
                </nav>
            </div>

            {/* Level 2: Sub-submenu */}
            {activeGroup && (
                <div className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                    <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex space-x-8 overflow-x-auto">
                            {activeGroupLinks.map(link => {
                                const Icon = iconMap[link.name];
                                return (
                                    <NavLink
                                        key={link.path}
                                        to={link.path}
                                        className={({ isActive }) => `${linkBaseClasses} ${isActive ? linkActiveClasses : linkInactiveClasses}`}
                                    >
                                        {Icon && <Icon className="w-5 h-5 mr-2 flex-shrink-0" />}
                                        <span className="whitespace-nowrap">{link.name}</span>
                                    </NavLink>
                                );
                            })}
                        </div>
                    </nav>
                </div>
            )}
        </div>
    );
};

export default PayrollSubNav;
