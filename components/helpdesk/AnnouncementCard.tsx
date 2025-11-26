import React from 'react';
import { Announcement, AnnouncementType } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';

interface AnnouncementCardProps {
    announcement: Announcement;
    onAcknowledge: (id: string) => void;
    hasAcknowledged: boolean;
    canManage: boolean;
    onEdit: (announcement: Announcement) => void;
}

const DocumentArrowDownIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13l-3 3m0 0l-3-3m3 3V8" /></svg>);

const AnnouncementCard: React.FC<AnnouncementCardProps> = ({ announcement, onAcknowledge, hasAcknowledged, canManage, onEdit }) => {
    
    const isPolicy = announcement.type === AnnouncementType.Policy;

    return (
        <Card>
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{announcement.title}</h2>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        <span>Posted by {announcement.createdBy}</span>
                        <span className="mx-2">|</span>
                        <span>{new Date(announcement.createdAt).toLocaleString()}</span>
                        <span className="mx-2">|</span>
                        <span>To: {announcement.targetGroup}</span>
                    </div>
                </div>
                 {isPolicy && (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                        POLICY ALERT
                    </span>
                )}
            </div>
            
            <p className="mt-4 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{announcement.message}</p>
            
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-grow">
                    {announcement.attachmentUrl && (
                        <Button variant="secondary" size="sm" onClick={() => alert(`(Mock) Downloading ${announcement.attachmentUrl}`)}>
                            <DocumentArrowDownIcon />
                            {announcement.attachmentUrl}
                        </Button>
                    )}
                </div>
                
                <div className="mt-4 sm:mt-0 flex items-center space-x-4">
                    {canManage && (
                         <Button variant="secondary" size="sm" onClick={() => onEdit(announcement)}>
                            Edit
                        </Button>
                    )}
                    {isPolicy && (
                        <Button 
                            onClick={() => onAcknowledge(announcement.id)} 
                            disabled={hasAcknowledged}
                            className={hasAcknowledged ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500' : ''}
                        >
                            {hasAcknowledged ? 'Acknowledged' : 'Read & Acknowledge'}
                        </Button>
                    )}
                </div>
            </div>

            {canManage && isPolicy && (
                <div className="mt-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {announcement.acknowledgementIds.length} employee(s) have acknowledged this policy.
                    </p>
                </div>
            )}
        </Card>
    );
};

export default AnnouncementCard;