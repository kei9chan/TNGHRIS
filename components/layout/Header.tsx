// FIX: Refactored to use default React import and explicit hook access (e.g., React.useState) to resolve cryptic import errors.
import React from 'react';
import { NavLink as RouterNavLink, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { NAV_LINKS } from '../../constants';
import { Permission, type NavLink } from '../../types';
import { useSettings } from '../../context/SettingsContext';
import NotificationBell from './NotificationBell';
import { useEvaluationAssignmentAccess } from '../../hooks/useEvaluationAssignmentAccess';
import { useTheme } from '../../context/ThemeContext';

const UserIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
);

const LogoutIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
);

const SunIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364-.707-.707M6.343 6.343l-.707-.707m12.728 0-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
);

const MoonIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646a9.003 9.003 0 1011.708 11.708z" />
    </svg>
);

const MenuIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
);

const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
    </svg>
);

const MobileNavTree: React.FC<{ links: NavLink[]; depth?: number; onNavigate: () => void }> = ({ links, depth = 0, onNavigate }) => (
    <div className={depth ? 'ml-3 border-l border-slate-200 pl-3 dark:border-slate-700' : 'space-y-4'}>
        {links.map(link => link.children?.length ? (
            <section key={`${depth}-${link.name}`} className={depth ? 'mb-3' : ''}>
                <h3 className={`${depth ? 'text-xs' : 'text-sm'} mb-2 font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400`}>{link.name}</h3>
                <MobileNavTree links={link.children} depth={depth + 1} onNavigate={onNavigate} />
            </section>
        ) : (
            <RouterNavLink
                key={`${depth}-${link.name}`}
                to={link.path}
                onClick={onNavigate}
                className={({ isActive }) => `mb-1 flex min-h-11 items-center rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}
            >
                {link.name}
            </RouterNavLink>
        ))}
    </div>
);

const NavItem: React.FC<{ link: NavLink; hasEvaluationAccess: boolean }> = ({ link, hasEvaluationAccess }) => {
    const { user } = useAuth();
    const { can } = usePermissions();
    const location = useLocation();

    const filteredChildren = link.children?.filter(
        child => child.requiredPermission && can(child.requiredPermission.resource, child.requiredPermission.permission)
    ) || [];

    const assignmentOnlyEvaluation = link.name === 'Evaluation' && hasEvaluationAccess && filteredChildren.length === 0;
    const hasVisibleChildren = filteredChildren.length > 0;
    const isVisible = assignmentOnlyEvaluation || hasVisibleChildren || (link.requiredPermission && can(link.requiredPermission.resource, link.requiredPermission.permission));

    if (!user || !isVisible) {
        return null;
    }
    
    const isParentActive = hasVisibleChildren && location.pathname.startsWith(`/${link.path.split('/')[1]}`);
    const navLinkClasses = "text-gray-300 hover:bg-slate-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap";
    const activeNavLinkClasses = "bg-slate-700 text-white";

    return (
         <RouterNavLink
            to={hasVisibleChildren ? filteredChildren[0].path : link.path}
            className={({ isActive }) => `${navLinkClasses} ${(isActive && !isParentActive) || isParentActive ? activeNavLinkClasses : ''}`}
        >
            {link.name}
        </RouterNavLink>
    );
};

const Header: React.FC = () => {
    const { user, logout } = useAuth();
    const { can } = usePermissions();
    const { settings } = useSettings();
    const { theme, setTheme } = useTheme();
    const navigate = useNavigate();
    const canViewEvaluation = can('Evaluation', Permission.View);
    const { hasAssignment: hasAssignedEvaluation } = useEvaluationAssignmentAccess(!canViewEvaluation);
    const hasEvaluationAccess = canViewEvaluation || hasAssignedEvaluation;
    const [isProfileMenuOpen, setProfileMenuOpen] = React.useState(false);
    const [isMobileMenuOpen, setMobileMenuOpen] = React.useState(false);
    const profileMenuRef = React.useRef<HTMLDivElement>(null);
    const location = useLocation();

    const visibleMobileLinks = React.useMemo(() => {
        const filterLinks = (links: NavLink[]): NavLink[] => links.flatMap(link => {
            const children = link.children ? filterLinks(link.children) : [];
            const hasDirectPermission = Boolean(link.requiredPermission && can(link.requiredPermission.resource, link.requiredPermission.permission));
            const hasAssignmentOnlyAccess = link.name === 'Evaluation' && hasEvaluationAccess;
            if (!hasDirectPermission && !hasAssignmentOnlyAccess && children.length === 0) return [];
            return [{ ...link, children: children.length ? children : undefined }];
        });
        return filterLinks(NAV_LINKS);
    }, [can, hasEvaluationAccess]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setProfileMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    React.useEffect(() => {
        setMobileMenuOpen(false);
        setProfileMenuOpen(false);
    }, [location.pathname]);

    React.useEffect(() => {
        if (!isMobileMenuOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMobileMenuOpen(false);
        };
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [isMobileMenuOpen]);

    return (
        <header className="sticky top-0 z-20 bg-slate-900 shadow-lg">
            <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 xl:px-10">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center flex-1 min-w-0">
                        <button
                            type="button"
                            onClick={() => setMobileMenuOpen(true)}
                            aria-label="Open navigation menu"
                            aria-expanded={isMobileMenuOpen}
                            aria-controls="mobile-navigation"
                            className="mr-2 inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-white lg:hidden"
                        >
                            <MenuIcon />
                        </button>
                        <Link to="/dashboard" className="mr-2 flex min-w-0 flex-shrink items-center space-x-2 font-bold text-white sm:mr-4 sm:text-xl">
                            {settings.appLogoUrl ? (
                                <img src={settings.appLogoUrl} alt={`${settings.appName} logo`} className="h-8 w-auto" />
                            ) : null}
                            <span className="truncate">{settings.appName}</span>
                        </Link>
                        <div className="hidden min-w-0 flex-1 lg:block">
                            <div className="flex items-baseline space-x-4 overflow-x-auto scrollbar-hide">
                                {NAV_LINKS.map((link) => (
                                    <NavItem key={link.name} link={link} hasEvaluationAccess={hasEvaluationAccess} />
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1 pl-1 sm:gap-2 sm:pl-4">
                        <NotificationBell />
                        <div className="relative" ref={profileMenuRef}>
                            <div>
                                <button onClick={() => setProfileMenuOpen(!isProfileMenuOpen)} className="flex h-11 w-11 max-w-xs items-center justify-center rounded-full bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-slate-900" id="user-menu" aria-haspopup="true" aria-expanded={isProfileMenuOpen}>
                                    <span className="sr-only">Open user menu</span>
                                    <div className="h-8 w-8 rounded-full bg-slate-700 text-white flex items-center justify-center">
                                       <UserIcon/>
                                    </div>
                                </button>
                            </div>
                            {isProfileMenuOpen && (
                                <div className="absolute right-0 z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-xl bg-white py-1 shadow-2xl ring-1 ring-black/5 dark:bg-slate-800 dark:ring-white/10">
                                    <div className="px-4 py-2 text-sm text-gray-700 border-b">
                                        <p className="font-semibold dark:text-white">{user?.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-slate-300">{user?.role}</p>
                                    </div>
                                    <RouterNavLink to="/my-profile" onClick={() => setProfileMenuOpen(false)} className="flex min-h-11 w-full items-center px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-slate-100 dark:hover:bg-slate-700">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                        My Profile
                                    </RouterNavLink>
                                    <div className="border-y border-slate-100 px-4 py-3 dark:border-slate-700">
                                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300">Appearance</p>
                                        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Appearance">
                                            <button type="button" onClick={() => setTheme('light')} aria-pressed={theme === 'light'} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${theme === 'light' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700'}`}><SunIcon /> Light</button>
                                            <button type="button" onClick={() => setTheme('dark')} aria-pressed={theme === 'dark'} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${theme === 'dark' ? 'border-indigo-400 bg-indigo-950 text-indigo-200' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700'}`}><MoonIcon /> Dark</button>
                                        </div>
                                    </div>
                                    <button onClick={handleLogout} className="flex min-h-11 w-full items-center px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-slate-100 dark:hover:bg-slate-700">
                                        <LogoutIcon />
                                        Sign out
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {isMobileMenuOpen && (
                <div className="fixed inset-x-0 bottom-0 top-16 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
                    <button type="button" className="absolute inset-0 bg-slate-950/55" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation menu" />
                    <aside id="mobile-navigation" className="relative flex h-full w-[min(21rem,calc(100vw-3rem))] flex-col bg-white shadow-2xl dark:bg-slate-900">
                        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                            <div><p className="font-bold text-slate-900 dark:text-white">Menu</p><p className="text-xs text-slate-500 dark:text-slate-400">Your authorized modules</p></div>
                            <button type="button" onClick={() => setMobileMenuOpen(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800" aria-label="Close navigation menu"><CloseIcon /></button>
                        </div>
                        <nav className="flex-1 overflow-y-auto overscroll-contain px-4 py-4" aria-label="Mobile navigation">
                            <RouterNavLink to="/approvals" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => `mb-4 flex min-h-11 items-center rounded-xl px-3 py-2.5 text-sm font-bold ${isActive ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200'}`}>Approval Center</RouterNavLink>
                            <MobileNavTree links={visibleMobileLinks} onNavigate={() => setMobileMenuOpen(false)} />
                        </nav>
                    </aside>
                </div>
            )}
        </header>
    );
};

export default Header;
