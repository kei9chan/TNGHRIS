import React from 'react';
import { NavLink } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';
import { Permission } from '../../types';

// Icons
const HomeIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h7.5" /></svg>);
const UsersIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-2.253-9.527-9.527 0 0 0-4.121-2.253M15 19.128v-3.857A14.975 14.975 0 0 1 12 15c-2.648 0-5.131-.69-7.244-1.942v3.857m7.244 3.286A14.975 14.975 0 0 0 12 21c-2.648 0-5.131-.69-7.244-1.942m0 0a15.015 15.015 0 0 1-2.13-1.64m16.74 0a15.015 15.015 0 0 0 2.13-1.64m-18.86 0A14.975 14.975 0 0 0 12 15c2.648 0 5.131.69 7.244 1.942M12 15V9a3 3 0 0 0-3-3H9m1.5-3A3 3 0 0 1 12 3v3m-3.879 1.121a3 3 0 0 0-4.242 0M19.5 7.5a3 3 0 0 0-4.243 0" /></svg>);
const ClockIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>);
const UserCircleIcon: React.FC<{className?: string}> = ({className}) => (<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}><path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>);


const MobileFooter: React.FC = () => {
    const { can } = usePermissions();

    const navItems = [
        { name: 'Dashboard', path: '/dashboard', icon: HomeIcon, permission: can('Dashboard', Permission.View) },
        { name: 'Employees', path: '/employees/list', icon: UsersIcon, permission: can('Employees', Permission.View) },
        { name: 'Clock-In', path: '/payroll/clock-in-out', icon: ClockIcon, permission: can('Clock', Permission.View) },
        { name: 'My Profile', path: '/my-profile', icon: UserCircleIcon, permission: true },
    ].filter(item => item.permission);


    return (
        <footer className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700 z-30">
            <div className="flex justify-around items-center h-16">
                {navItems.map(item => (
                    <NavLink
                        key={item.name}
                        to={item.path}
                        className={({ isActive }) => 
                            `flex flex-col items-center justify-center space-y-1 w-full transition-colors 
                            ${isActive 
                                ? 'text-indigo-600 dark:text-indigo-400' 
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`
                        }
                    >
                        <item.icon className="w-6 h-6" />
                        <span className="text-xs font-medium">{item.name}</span>
                    </NavLink>
                ))}
            </div>
        </footer>
    );
};

export default MobileFooter;