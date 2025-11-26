import React, { useState, useEffect, useRef, useMemo } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import { User } from '../../types';
import { mockUsers } from '../../services/mockData';
import { useAuth } from '../../hooks/useAuth';
import { logActivity } from '../../services/auditService';

interface ResignationLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ResignationLinkModal: React.FC<ResignationLinkModalProps> = ({ isOpen, onClose }) => {
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    const defaultSubject = "Resignation Process & Offboarding Guidance";
    const [subject, setSubject] = useState(defaultSubject);
    const [message, setMessage] = useState('');

    // Filter active employees
    const filteredUsers = useMemo(() => {
        if (!searchQuery) return [];
        const lowerQuery = searchQuery.toLowerCase();
        return mockUsers.filter(u => 
            u.status === 'Active' && 
            (u.name.toLowerCase().includes(lowerQuery) || u.email.toLowerCase().includes(lowerQuery))
        ).slice(0, 5);
    }, [searchQuery]);

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
            const template = `Dear ${selectedUser.name.split(' ')[0]},

We are sorry to hear that you are considering moving on, but we wish you the best in your next chapter. We truly appreciate your contributions to the team.

To formally begin the resignation and clearance process, please submit your resignation details via the HRIS portal using the link below:

${window.location.origin}/#/submit-resignation

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

    const handleSend = () => {
        if (!selectedUser) {
            alert("Please select an employee.");
            return;
        }
        
        // Simulate sending email
        console.log(`Sending email to ${selectedUser.email}`, { subject, message });
        
        logActivity(
            user, 
            'EXPORT', 
            'ResignationLink', 
            selectedUser.id, 
            `Sent resignation guidance email to ${selectedUser.email}`
        );

        alert(`Resignation link and guidance sent to ${selectedUser.email}.`);
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Send Resignation Link & Guidance"
            footer={
                <div className="flex justify-end space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSend} disabled={!selectedUser}>Send Email</Button>
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