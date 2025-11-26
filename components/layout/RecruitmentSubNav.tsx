
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';
import { NAV_LINKS } from '../../constants';
import type { NavLink as NavLinkType } from '../../types';


// SVG Icon Components
const DocumentMagnifyingGlassIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.5h-8.021a1.125 1.125 0 0 1-1.125-1.125v-1.5A1.125 1.125 0 0 1 5.625 15h12.75a1.125 1.125 0 0 1 1.125 1.125v1.5a1.125 1.125 0 0 1-1.125 1.125H13.5m-3.031-1.125a3 3 0 1 0-5.962 0 3 3 0 0 0 5.962 0ZM15 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></svg>);
const ClipboardDocumentListIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 0 1 9 9v.375M10.125 2.25A3.375 3.375 0 0 1 13.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375" /></svg>);
const DocumentDuplicateIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m9.75 11.625-3.375-3.375" /></svg>);
const ApplicantsIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-2.253-9.527-9.527 0 0 0-4.121-2.253M15 19.128v-3.857A14.975 14.975 0 0 1 12 15c-2.648 0-5.131-.69-7.244-1.942v3.857m7.244 3.286A14.975 14.975 0 0 0 12 21c-2.648 0-5.131-.69-7.244-1.942m0 0a15.015 15.015 0 0 1-2.13-1.64m16.74 0a15.015 15.015 0 0 0 2.13-1.64m-18.86 0A14.975 14.975 0 0 0 12 15c2.648 0 5.131.69 7.244 1.942M12 15V9a3 3 0 0 0-3-3H9m1.5-3A3 3 0 0 1 12 3v3m-3.879 1.121a3 3 0 0 0-4.242 0M19.5 7.5a3 3 0 0 0-4.243 0" /></svg>);
const IdentificationIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789" /></svg>);
const CalendarIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0h18" /></svg>);
const DocumentCheckIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="m9 12.75 1.5 1.5 3-3M9 21H7.5A2.25 2.25 0 0 1 5.25 18.75V5.25A2.25 2.25 0 0 1 7.5 3h9A2.25 2.25 0 0 1 18.75 5.25V9" /></svg>);
const ChevronDownIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>);
const GlobeAltIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>);

const iconMap: { [key: string]: React.FC<{className?: string}> } = {
    'Requisitions': DocumentMagnifyingGlassIcon,
    'Job Posts': ClipboardDocumentListIcon,
    'Job Post Manager': ClipboardDocumentListIcon,
    'Job Post Templates': DocumentDuplicateIcon,
    'Application Pages': GlobeAltIcon,
    'Applicants': ApplicantsIcon,
    'Candidates': IdentificationIcon,
    'Interviews': CalendarIcon,
    'Offers': DocumentCheckIcon,
};


const RecruitmentSubNav: React.FC = () => {
    const { can } = usePermissions();
    const location = useLocation();
    const recruitmentLink = NAV_LINKS.find(link => link.name === 'Recruitment') as NavLinkType | undefined;

    if (!recruitmentLink) {
        return null;
    }

    // Manually inject "Application Pages" for this view since it's a new feature
    const navItems: NavLinkType[] = [
        ...(recruitmentLink.children || []),
        { name: 'Application Pages', path: '/recruitment/application-pages', requiredPermission: { resource: 'Recruitment', permission: 'manage' } } as any
    ];

    const hasVisibleChildren = (link: NavLinkType): boolean => {
      if (!link.children) {
        return can(link.requiredPermission.resource, link.requiredPermission.permission);
      }
      return link.children.some((child: NavLinkType) => can(child.requiredPermission.resource, child.requiredPermission.permission));
    }

    const subLinks = navItems.filter(hasVisibleChildren);

    if (!subLinks.length) {
        return null;
    }
    
    const jobPostsLink = subLinks.find(link => link.name === 'Job Posts');
    const isJobPostsSectionActive = location.pathname.startsWith('/recruitment/job-post') && !location.pathname.includes('application-pages');

    const baseClasses = 'flex items-center py-4 px-2 md:px-3 border-b-2 text-sm font-medium transition-colors duration-150 ease-in-out';
    const activeClasses = 'border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400';
    const inactiveClasses = 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600';

    const level3BaseClasses = 'flex items-center py-3 px-2 text-sm font-medium transition-colors duration-150 ease-in-out';
    const level3ActiveClasses = 'text-indigo-600 dark:text-indigo-400';
    const level3InactiveClasses = 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white';


    return (
        <div className="bg-white dark:bg-gray-800 shadow-sm">
            {/* Level 2 SubNav */}
            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mb-px">
                    <div className="flex space-x-2 sm:space-x-4 md:space-x-8 overflow-x-auto">
                        {subLinks.map(link => {
                            const Icon = iconMap[link.name];
                            const isParentActive = link.name === 'Job Posts' && isJobPostsSectionActive;
                            const destinationPath = link.children ? link.children[0].path : link.path;

                            return (
                                <NavLink
                                    key={link.name}
                                    to={destinationPath}
                                    className={({ isActive }) => `${baseClasses} ${isActive || isParentActive ? activeClasses : inactiveClasses}`}
                                >
                                    {Icon && <Icon className="w-5 h-5 mr-2 flex-shrink-0" />}
                                    <span className="whitespace-nowrap">{link.name}</span>
                                    {link.children && <ChevronDownIcon className="w-4 h-4 ml-1" />}
                                </NavLink>
                            );
                        })}
                    </div>
                </nav>
            </div>

            {/* Level 3 Sub-SubNav for Job Posts */}
            {isJobPostsSectionActive && jobPostsLink && jobPostsLink.children && (
                 <div className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                    <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex space-x-8 overflow-x-auto">
                            {jobPostsLink.children.map(childLink => {
                                const Icon = iconMap[childLink.name];
                                return (
                                    <NavLink
                                        key={childLink.name}
                                        to={childLink.path}
                                        className={({ isActive }) => `${level3BaseClasses} ${isActive ? level3ActiveClasses : level3InactiveClasses}`}
                                    >
                                        {Icon && <Icon className="w-5 h-5 mr-2 flex-shrink-0" />}
                                        <span className="whitespace-nowrap">{childLink.name}</span>
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

export default RecruitmentSubNav;