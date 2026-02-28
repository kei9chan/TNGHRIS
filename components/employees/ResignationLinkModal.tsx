import React, { useState, useEffect, useRef, useMemo } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import { Role, User } from '../../types';
import { mockUsers } from '../../services/mockData';
import { useAuth } from '../../hooks/useAuth';
import { logActivity } from '../../services/auditService';
import { supabase } from '../../services/supabaseClient';

interface ResignationLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ResignationLinkModal: React.FC<ResignationLinkModalProps> = ({ isOpen, onClose }) => {
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [users, setUsers] = useState<User[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    const defaultSubject = "Resignation Process & Offboarding Guidance";
    const [subject, setSubject] = useState(defaultSubject);
    const [message, setMessage] = useState('');

    // Filter active employees
    const filteredUsers = useMemo(() => {
        if (!searchQuery) return [];
        const lowerQuery = searchQuery.toLowerCase();
        return users.filter(u => 
            u.status === 'Active' && 
            (u.name.toLowerCase().includes(lowerQuery) || u.email.toLowerCase().includes(lowerQuery))
        ).slice(0, 5);
    }, [searchQuery, users]);

    useEffect(() => {
        if (!isOpen) return;
        const loadUsers = async () => {
            setIsLoadingUsers(true);
            try {
                const { data } = await supabase
                    .from('hris_users')
                    .select('id, full_name, email, role, status, business_unit, business_unit_id, department, department_id, position, date_hired');
                if (data) {
                    const mapped: User[] = data.map((u: any) => ({
                        id: u.id,
                        name: u.full_name || u.email,
                        email: u.email,
                        role: (u.role as Role) || Role.Employee,
                        department: u.department || '',
                        businessUnit: u.business_unit || '',
                        departmentId: u.department_id || undefined,
                        businessUnitId: u.business_unit_id || undefined,
                        status: (u.status as 'Active' | 'Inactive') || 'Active',
                        isPhotoEnrolled: false,
                        dateHired: u.date_hired ? new Date(u.date_hired) : new Date(),
                        position: u.position || '',
                    }));
                    setUsers(mapped);
                } else {
                    setUsers([]);
                }
            } catch (error) {
                console.error('Failed to load employees from hris_users', error);
                setUsers([]);
            } finally {
                setIsLoadingUsers(false);
            }
        };
        loadUsers();
    }, [isOpen]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Generate message when user is selected
    useEffect(() => {
        if (selectedUser) {
            const isLocalhost =
                window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1';
            const resignationLink = isLocalhost
                ? `${window.location.origin}/#/submit-resignation`
                : 'https://hris.thenextperience.com/submit-resignation';
            const template = `Dear ${selectedUser.name.split(' ')[0]},

We are sorry to hear that you are considering moving on, but we wish you the best in your next chapter. We truly appreciate your contributions to the team.

To formally begin the resignation and clearance process, please submit your resignation details via the HRIS portal using the link below:

${resignationLink}

This will trigger the automated offboarding checklist to ensure a smooth transition.

If you have any questions, please don't hesitate to reach out to HR.

Best regards,
HR Department`;
            setMessage(template);
        } else {
            setMessage('');
        }
    }, [selectedUser]);

    const handleSelectUser = (user: User) => {
        setSelectedUser(user);
        setSearchQuery(user.name);
        setIsDropdownOpen(false);
    };

    const handleSend = async () => {
        if (!selectedUser) {
            alert("Please select an employee.");
            return;
        }
        if (!selectedUser.email) {
            alert('Selected employee has no email address.');
            return;
        }

        setIsSending(true);
        try {
            const response = await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: selectedUser.email,
                    subject,
                    message,
                }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data?.error || 'Failed to send email.');
            }

            logActivity(
                user, 
                'EXPORT', 
                'ResignationLink', 
                selectedUser.id, 
                `Sent resignation guidance email to ${selectedUser.email}`
            );

            alert(`Resignation link and guidance sent to ${selectedUser.email}.`);
            onClose();
        } catch (error: any) {
            alert(error?.message || 'Failed to send email.');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Send Resignation Link & Guidance"
            footer={
                <div className="flex justify-end space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSend} disabled={!selectedUser || isSending}>
                        {isSending ? 'Sending...' : 'Send Email'}
                    </Button>
                </div>
            }
        >
            <div className="space-y-4">
                <div className="relative" ref={searchRef}>
                    <Input
                        label="Search Employee"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setIsDropdownOpen(true);
                            if (e.target.value === '') setSelectedUser(null);
                        }}
                        placeholder="Type name or email..."
                        autoComplete="off"
                    />
                    {isDropdownOpen && isLoadingUsers && (
                        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                            Loading employees...
                        </div>
                    )}
                    {isDropdownOpen && filteredUsers.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg">
                            {filteredUsers.map(u => (
                                <div
                                    key={u.id}
                                    className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                                    onClick={() => handleSelectUser(u)}
                                >
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{u.name}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{u.email} - {u.position}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {selectedUser && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-800">
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                            <strong>To:</strong> {selectedUser.email}
                        </p>
                    </div>
                )}

                <Input
                    label="Subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                />

                <Textarea
                    label="Message Body"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={12}
                    placeholder="Select an employee to generate the guidance message..."
                />
            </div>
        </Modal>
    );
};

export default ResignationLinkModal;
