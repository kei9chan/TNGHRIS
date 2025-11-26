import React from 'react';
import { User } from '../../types';
import Button from '../ui/Button';

interface ProfileHeaderProps {
    user: User;
    onEditClick: () => void;
    canEdit: boolean;
}

const UserAvatar: React.FC = () => (
    <div className="h-24 w-24 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 border-4 border-white dark:border-gray-800">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
    </div>
);

const ProfileHeader: React.FC<ProfileHeaderProps> = ({ user, onEditClick, canEdit }) => {
    return (
        <div className="bg-white dark:bg-slate-800 shadow-md rounded-lg p-6">
            <div className="flex flex-col md:flex-row items-center md:items-start md:space-x-6">
                <div className="flex-shrink-0">
                    <UserAvatar />
                </div>
                <div className="flex-grow mt-4 md:mt-0 text-center md:text-left">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{user.name}</h1>
                    <p className="text-lg text-gray-600 dark:text-gray-400">{user.position || 'Position Not Set'}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-500">{user.email}</p>
                </div>
                {canEdit && (
                    <div className="mt-4 md:mt-0">
                        <Button onClick={onEditClick}>Edit Profile</Button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProfileHeader;
