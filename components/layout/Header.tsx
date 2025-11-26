// FIX: Refactored to use default React import and explicit hook access (e.g., React.useState) to resolve cryptic import errors.
import React from 'react';
import { NavLink as RouterNavLink, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { NAV_LINKS } from '../../constants';
import type { NavLink } from '../../types';
import { useSettings } from '../../context/SettingsContext';
import GoogleIcon from '../icons/GoogleIcon';

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

const CheckCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
);

const NavItem: React.FC<{ link: NavLink }> = ({ link }) => {
    const { user } = useAuth();
    const { can } = usePermissions();
    const location = useLocation();

    const filteredChildren = link.children?.filter(
        child => child.requiredPermission && can(child.requiredPermission.resource, child.requiredPermission.permission)
    ) || [];

    const hasVisibleChildren = filteredChildren.length > 0;
    const isVisible = hasVisibleChildren || (link.requiredPermission && can(link.requiredPermission.resource, link.requiredPermission.permission));

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
    const { user, logout, connectGoogle } = useAuth();
    const { settings } = useSettings();
    const navigate = useNavigate();
    const [isProfileMenuOpen, setProfileMenuOpen] = React.useState(false);
    const profileMenuRef = React.useRef<HTMLDivElement>(null);

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

    return (
        <header className="bg-slate-900 shadow-lg sticky top-0 z-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center flex-1 min-w-0">
                        <Link to="/dashboard" className="flex-shrink-0 text-white font-bold text-xl mr-4 flex items-center space-x-2">
                            {settings.appLogoUrl ? (
                                <img src={settings.appLogoUrl} alt={`${settings.appName} logo`} className="h-8 w-auto" />
                            ) : null}
                            <span>{settings.appName}</span>
                        </Link>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-baseline space-x-4 overflow-x-auto scrollbar-hide">
                                {NAV_LINKS.map((link) => (
                                    <NavItem key={link.name} link={link} />
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center pl-4">
                        <div className="relative" ref={profileMenuRef}>
                            <div>
                                <button onClick={() => setProfileMenuOpen(!isProfileMenuOpen)} className="max-w-xs bg-slate-800 rounded-full flex items-center text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-white" id="user-menu" aria-haspopup="true">
                                    <span className="sr-only">Open user menu</span>
                                    <div className="h-8 w-8 rounded-full bg-slate-700 text-white flex items-center justify-center">
                                       <UserIcon/>
                                    </div>
                                </button>
                            </div>
                            {isProfileMenuOpen && (
                                <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 z-20">
                                    <div className="px-4 py-2 text-sm text-gray-700 border-b">
                                        <p className="font-semibold">{user?.name}</p>
                                        <p className="text-xs text-gray-500">{user?.role}</p>
                                    </div>
                                    <RouterNavLink to="/my-profile" onClick={() => setProfileMenuOpen(false)} className="w-full text-left flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                        My Profile
                                    </RouterNavLink>
                                    {user?.isGoogleConnected ? (
                                        <div className="w-full text-left flex items-center px-4 py-2 text-sm text-green-600">
                                            <CheckCircleIcon />
                                            Google Connected
                                        </div>
                                    ) : (
                                        <button onClick={() => { connectGoogle(); setProfileMenuOpen(false); }} className="w-full text-left flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                            <GoogleIcon className="w-5 h-5 mr-2" />
                                            Connect with Google
                                        </button>
                                    )}
                                    <button onClick={handleLogout} className="w-full text-left flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                        <LogoutIcon />
                                        Sign out
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;