import React, { useState, useMemo, useRef, useEffect } from 'react';
import { User } from '../../types';

interface EmployeeMultiSelectProps {
  label: string;
  allUsers: User[];
  selectedUsers: User[];
  onSelectionChange: (users: User[]) => void;
  disabled?: boolean;
}

const XCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const UserAvatar: React.FC = () => (
    <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
    </div>
);


const EmployeeMultiSelect: React.FC<EmployeeMultiSelectProps> = ({ label, allUsers, selectedUsers, onSelectionChange, disabled = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filteredUsers = useMemo(() => {
    const selectedIds = new Set(selectedUsers.map(u => u.id));
    const pool = allUsers.filter(u => !selectedIds.has(u.id));
    if (!searchTerm) {
        return pool
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .slice(0, 20); // show first 20 by default
    }
    const lowerSearch = searchTerm.toLowerCase();
    return pool.filter(user => 
        user.name.toLowerCase().includes(lowerSearch) ||
        (user.email || '').toLowerCase().includes(lowerSearch)
    );
  }, [searchTerm, allUsers, selectedUsers]);

  const handleAddUser = (user: User) => {
    onSelectionChange([...selectedUsers, user]);
    setSearchTerm('');
    setDropdownOpen(false);
  };

  const handleRemoveUser = (userId: string) => {
    if (disabled) return;
    onSelectionChange(selectedUsers.filter(u => u.id !== userId));
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef]);

  return (
    <div ref={wrapperRef}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <div className="relative mt-1">
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          onFocus={() => !disabled && setDropdownOpen(true)}
          placeholder="Search for employees..."
          className="w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
          disabled={disabled}
        />
        {isDropdownOpen && !disabled && (
          <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
            {filteredUsers.length > 0 ? (
              filteredUsers.map(user => (
                <div
                  key={user.id}
                  onClick={() => handleAddUser(user)}
                  className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
                >
                    <UserAvatar />
                    <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {user.name}
                        </p>
                        {user.role && <p className="text-sm text-gray-500 dark:text-gray-400">{user.role}</p>}
                    </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-2 text-sm text-gray-500">No results found</div>
            )}
          </div>
        )}
      </div>
      <div className="mt-2 space-y-2">
        {selectedUsers.map(user => (
          <div key={user.id} className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
            <div className="flex items-center">
                <UserAvatar />
                <div className="ml-3">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {user.name}
                    </p>
                    {user.role && <p className="text-xs text-gray-500 dark:text-gray-400">{user.role}</p>}
                </div>
            </div>
            <button type="button" onClick={() => handleRemoveUser(user.id)} className="text-gray-400 hover:text-red-500 disabled:cursor-not-allowed disabled:hover:text-gray-400" disabled={disabled}>
              <XCircleIcon />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EmployeeMultiSelect;
