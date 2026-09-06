import React from 'react';
import EmployeePhoto from './EmployeePhoto';
import { User } from '../../types';
import Button from '../ui/Button';

interface ProfileHeaderProps {
    user: User;
    onEditClick: () => void;
    canEdit: boolean;
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({ user, onEditClick, canEdit }) => {
    return (
        <div className="bg-white dark:bg-slate-800 shadow-md rounded-lg p-6">
            <div className="flex flex-col md:flex-row items-center md:items-start md:space-x-6">
                <div className="flex-shrink-0">
                    <EmployeePhoto employeeId={user.id} name={user.name} editable={canEdit} large/>
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
