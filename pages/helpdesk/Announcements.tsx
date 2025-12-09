
import React, { useState, useMemo, useEffect } from 'react';
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
import { fetchAnnouncements, saveAnnouncement, acknowledgeAnnouncement } from '../../services/announcementService';
import { supabase } from '../../services/supabaseClient';

const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>;

const Announcements: React.FC = () => {
    const { user } = useAuth();
    const { can, getAnnouncementAccess } = usePermissions();
    const { settings, updateSettings } = useSettings();
    const [isEditingDesc, setIsEditingDesc] = useState(false);
    const [editText, setEditText] = useState('');

    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
    const [businessUnits, setBusinessUnits] = useState(mockBusinessUnits);
    
    const announcementAccess = getAnnouncementAccess();
    const canManage = announcementAccess.canManage;
    const scope = announcementAccess.scope;
    
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

    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await fetchAnnouncements();
                setAnnouncements(data);
            } catch (err) {
                console.error('Failed to load announcements', err);
                setAnnouncements(mockAnnouncements);
            }
            try {
                const { data: buData, error: buErr } = await supabase.from('business_units').select('id, name, code');
                if (!buErr && buData && buData.length > 0) {
                    setBusinessUnits(buData.map((b: any) => ({ id: b.id, name: b.name, code: b.code || '' })));
                } else {
                    setBusinessUnits(mockBusinessUnits);
                }
            } catch (err) {
                console.warn('Failed to load business units for announcements', err);
                setBusinessUnits(mockBusinessUnits);
            }
        };
        loadData();
    }, []);

    const visibleAnnouncements = useMemo(() => {
        if (!user) return [];

        const userBuId = user.businessUnitId || businessUnits.find(bu => bu.name === user.businessUnit)?.id;
        const userDept = user.department;

        return announcements
            .filter(a => {
                // Target group match
                const groupMatch = a.targetGroup === 'All' || a.targetGroup === userDept;

                // Scope-based BU/Dept checks
                if (scope === 'global' || scope === 'logs') return groupMatch;
                if (scope === 'buDept') {
                    const buMatch = !a.businessUnitId || a.businessUnitId === userBuId;
                    return groupMatch && buMatch;
                }
                if (scope === 'bu' || scope === 'ownBu') {
                    return !a.businessUnitId || a.businessUnitId === userBuId;
                }
                if (scope === 'team') {
                    // Reuse BU match; team granularity is minimal here
                    return !a.businessUnitId || a.businessUnitId === userBuId;
                }
                // none -> no access
                return false;
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [announcements, user, businessUnits, scope]);

    const handleNewAnnouncement = () => {
        setSelectedAnnouncement(null);
        setIsModalOpen(true);
    };

    const handleEditAnnouncement = (announcement: Announcement) => {
        setSelectedAnnouncement(announcement);
        setIsModalOpen(true);
    };

    const handleSave = async (announcementToSave: Partial<Announcement>) => {
        try {
            const saved = await saveAnnouncement(announcementToSave, { id: user?.id, name: user?.name });
            setAnnouncements(prev => {
                const rest = prev.filter(a => a.id !== saved.id);
                return [saved, ...rest];
            });
            logActivity(user, announcementToSave.id ? 'UPDATE' : 'CREATE', 'Announcement', saved.id, `${announcementToSave.id ? 'Updated' : 'Created'} announcement: ${saved.title}`);
            setIsModalOpen(false);
        } catch (err: any) {
            alert(err?.message || 'Failed to save announcement.');
        }
    };

    const handleAcknowledge = async (announcementId: string) => {
        if (!user) return;
        const target = announcements.find(a => a.id === announcementId);
        if (!target || target.acknowledgementIds.includes(user.id)) return;
        try {
            await acknowledgeAnnouncement(announcementId, user.id, target.acknowledgementIds);
            setAnnouncements(prev => prev.map(a => a.id === announcementId ? { ...a, acknowledgementIds: [...a.acknowledgementIds, user.id] } : a));
        } catch (err: any) {
            alert(err?.message || 'Failed to acknowledge announcement.');
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
                    businessUnits={businessUnits}
                />
            )}
        </div>
    );
};

export default Announcements;
