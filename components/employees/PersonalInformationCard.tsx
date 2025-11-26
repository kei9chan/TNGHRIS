import React from 'react';
import { User } from '../../types';
import Card from '../ui/Card';

// FIX: Inlined DetailItem component to avoid creating a new file.
const DetailItem: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm text-gray-900 dark:text-white">{value || 'N/A'}</dd>
    </div>
);

const PersonalInformationCard: React.FC<{ user: User }> = ({ user }) => {
    return (
        <Card title="Personal Information">
            <dl className="space-y-4">
                <DetailItem label="Birth Date" value={user.birthDate ? new Date(user.birthDate).toLocaleDateString() : 'N/A'} />
                
                <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Emergency Contact</dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white space-y-1 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                        <p><strong>Name:</strong> {user.emergencyContact?.name || 'N/A'}</p>
                        <p><strong>Relationship:</strong> {user.emergencyContact?.relationship || 'N/A'}</p>
                        <p><strong>Phone:</strong> {user.emergencyContact?.phone || 'N/A'}</p>
                    </dd>
                </div>

                <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Government IDs</dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white space-y-1 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                        <p><strong>SSS No:</strong> {user.sssNo || 'N/A'}</p>
                        <p><strong>Pag-IBIG No:</strong> {user.pagibigNo || 'N/A'}</p>
                        <p><strong>PhilHealth No:</strong> {user.philhealthNo || 'N/A'}</p>
                        <p><strong>TIN:</strong> {user.tin || 'N/A'}</p>
                    </dd>
                </div>
                
                <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Banking Details</dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white space-y-1 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                        <p><strong>Bank Name:</strong> {user.bankingDetails?.bankName || 'N/A'}</p>
                        <p><strong>Account No:</strong> {user.bankingDetails?.accountNumber || 'N/A'}</p>
                        <p><strong>Account Type:</strong> {user.bankingDetails?.accountType || 'N/A'}</p>
                    </dd>
                </div>
            </dl>
        </Card>
    );
};

export default PersonalInformationCard;