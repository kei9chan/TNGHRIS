
import React, { useState, useMemo } from 'react';
import { mockAnnouncements, mockBusinessUnits } from '../../services/mockData';
import { Announcement, Permission, Role } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import Button from '../../components/ui/Button';
import AnnouncementCard from '../../components/helpdesk/AnnouncementCard';
import AnnouncementModal from '../../components/helpdesk/AnnouncementModal';
import { useSettings } from '../../context/SettingsContext';
import RichTextEditor from '../../components/ui/RichTextEditor';
import { logActivity } from '../../services/auditService';

const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>;

const Announcements: React.FC = () => {
    const { user } = useAuth();
    const { can } = usePermissions();
    const { settings, updateSettings } = useSettings();
    const [isEditingDesc, setIsEditingDesc] = useState(false);
    const [editText, setEditText] = useState('');

    const [announcements, setAnnouncements] = useState<Announcement[]>(mockAnnouncements);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
    
    const canManage = can('Announcements', Permission.Manage);
    
    const isAdmin = user?.role === Role.Admin;
    const descriptionKey = 'helpdeskAnnouncementsDesc';
    const description = settings[descriptionKey] as string || '';

    const handleEditDesc = () => {
        setEditText(description);
        setIsEditingDesc(true);
    };
    
    const handleSaveDesc = () => {
        updateSettings({ [descriptionKey]: editText });
        setIsEditingDesc(false);
    };

    const visibleAnnouncements = useMemo(() => {
        if (!user) return [];
        
        // Resolve User's Business Unit ID
        // user.businessUnit contains the Name, we need the ID to compare with announcement.businessUnitId
        const userBuId = mockBusinessUnits.find(bu => bu.name === user.businessUnit)?.id;

        return announcements
            .filter(a => {
                // 1. Target Group Filter
                const groupMatch = a.targetGroup === 'All' || a.targetGroup === user.department;
                
                // 2. Business Unit Filter
                // Show if: 
                // - No BU specified (Global/All BUs)
                // - OR Specified BU matches User's BU
                const buMatch = !a.businessUnitId || a.businessUnitId === userBuId;

                return groupMatch && buMatch;
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [announcements, user]);

    const handleNewAnnouncement = () => {
        setSelectedAnnouncement(null);
        setIsModalOpen(true);
    };

    const handleEditAnnouncement = (announcement: Announcement) => {
        setSelectedAnnouncement(announcement);
        setIsModalOpen(true);
    };

    const handleSave = (announcementToSave: Partial<Announcement>) => {
        if (announcementToSave.id) { // Editing
            setAnnouncements(prev => prev.map(a => a.id === announcementToSave.id ? { ...a, ...announcementToSave } as Announcement : a));
            logActivity(user, 'UPDATE', 'Announcement', announcementToSave.id, `Updated announcement: ${announcementToSave.title}`);
        } else { // Creating
            const newAnnouncement: Announcement = {
                id: `AN-${Date.now()}`,
                createdBy: user?.name || 'System',
                createdAt: new Date(),
                acknowledgementIds: [],
                ...announcementToSave
            } as Announcement;
            setAnnouncements(prev => [newAnnouncement, ...prev]);
            logActivity(user, 'CREATE', 'Announcement', newAnnouncement.id, `Created announcement: ${newAnnouncement.title}`);
        }
        setIsModalOpen(false);
    };

    const handleAcknowledge = (announcementId: string) => {
        if (!user) return;

        const announcementIndex = mockAnnouncements.findIndex(a => a.id === announcementId);
        if (announcementIndex > -1) {
            const announcement = mockAnnouncements[announcementIndex];
            if (!announcement.acknowledgementIds.includes(user.id)) {
                // Update the mock data source directly to simulate persistence
                announcement.acknowledgementIds.push(user.id);
                // Update local state from the modified source of truth
                setAnnouncements([...mockAnnouncements]);
            }
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Announcements</h1>
                {canManage && <Button onClick={handleNewAnnouncement}>New Announcement</Button>}
            </div>
            {isEditingDesc ? (
                <div className="p-4 border rounded-lg bg-gray-50 dark:bg-slate-800/50 dark:border-slate-700 space-y-4">
                    <RichTextEditor
                        label="Edit Description"
                        value={editText}
                        onChange={setEditText}
                    />
                    <div className="flex justify-end space-x-2">
                        <Button variant="secondary" onClick={() => setIsEditingDesc(false)}>Cancel</Button>
                        <Button onClick={handleSaveDesc}>Save</Button>
                    </div>
                </div>
            ) : (
                <div className="relative group">
                    <div 
                        className="text-gray-600 dark:text-gray-400 mt-2" 
                        dangerouslySetInnerHTML={{ __html: description }}
                    />
                    {isAdmin && (
                        <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="sm" variant="secondary" onClick={handleEditDesc} title="Edit description">
                                <EditIcon />
                            </Button>
                        </div>
                    )}
                </div>
            )}
            <div className="space-y-4">
                {visibleAnnouncements.length > 0 ? (
                    visibleAnnouncements.map(announcement => (
                        <AnnouncementCard
                            key={announcement.id}
                            announcement={announcement}
                            onAcknowledge={handleAcknowledge}
                            hasAcknowledged={user ? announcement.acknowledgementIds.includes(user.id) : false}
                            canManage={canManage}
                            onEdit={handleEditAnnouncement}
                        />
                    ))
                ) : (
                    <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                        <p>No announcements found for your department or business unit.</p>
                    </div>
                )}
            </div>

            {isModalOpen && canManage && (
                <AnnouncementModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    announcement={selectedAnnouncement}
                    onSave={handleSave}
                />
            )}
        </div>
    );
};

export default Announcements;
