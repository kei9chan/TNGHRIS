
import React, { useState, useMemo } from 'react';
import { Site } from '../../types';
import { mockSites, mockBusinessUnits } from '../../services/mockData';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import SiteModal from '../../components/admin/SiteModal';
import { usePermissions } from '../../hooks/usePermissions';
import { logActivity } from '../../services/auditService';
import { useAuth } from '../../hooks/useAuth';

const SiteManagement: React.FC = () => {
    const { user } = useAuth();
    const { getAccessibleBusinessUnits } = usePermissions();
    const [sites, setSites] = useState<Site[]>(mockSites);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSite, setEditingSite] = useState<Site | null>(null);

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);
    const accessibleBuIds = useMemo(() => new Set(accessibleBus.map(bu => bu.id)), [accessibleBus]);

    const filteredSites = useMemo(() => {
        return sites.filter(site => accessibleBuIds.has(site.businessUnitId));
    }, [sites, accessibleBuIds]);

    const handleOpenModal = (site: Site | null) => {
        setEditingSite(site);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingSite(null);
    };

    const handleSave = (siteToSave: Site) => {
        if (siteToSave.id) { // Editing
            const updated = sites.map(s => s.id === siteToSave.id ? siteToSave : s);
            setSites(updated);
            const mockIndex = mockSites.findIndex(s => s.id === siteToSave.id);
            if (mockIndex > -1) mockSites[mockIndex] = siteToSave;
            logActivity(user, 'UPDATE', 'Site', siteToSave.id, `Updated site: ${siteToSave.name}`);
        } else { // Adding
            const newSite: Site = {
                ...siteToSave,
                id: `SITE-${Date.now()}`,
            };
            setSites(prev => [...prev, newSite]);
            mockSites.push(newSite);
            logActivity(user, 'CREATE', 'Site', newSite.id, `Created new site: ${newSite.name}`);
        }
        handleCloseModal();
    };

    const handleDelete = (siteId: string) => {
        if (window.confirm('Are you sure you want to delete this site?')) {
            const updated = sites.filter(s => s.id !== siteId);
            setSites(updated);
            const mockIndex = mockSites.findIndex(d => d.id === siteId);
            if (mockIndex > -1) mockSites.splice(mockIndex, 1);
            logActivity(user, 'DELETE', 'Site', siteId, 'Deleted site');
        }
    };

    const getBuName = (buId: string) => {
        return mockBusinessUnits.find(bu => bu.id === buId)?.name || 'N/A';
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Site Management</h1>
                <Button onClick={() => handleOpenModal(null)}>Add New Site</Button>
            </div>
            <p className="text-gray-600 dark:text-gray-400">Manage geofence locations for the GPS clock-in feature.</p>

            <Card>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Site Name</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Business Unit</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Coordinates (Lat, Lng)</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Radius (m)</th>
                                <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredSites.map(site => (
                                <tr key={site.id}>
                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white">{site.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{getBuName(site.businessUnitId)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {site.latitude.toFixed(6)}, {site.longitude.toFixed(6)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{site.radiusMeters}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end space-x-2">
                                            <Button size="sm" variant="secondary" onClick={() => handleOpenModal(site)}>Edit</Button>
                                            <Button size="sm" variant="danger" onClick={() => handleDelete(site.id)}>Delete</Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredSites.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                        No sites found for accessible Business Units.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {isModalOpen && (
                <SiteModal
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                    onSave={handleSave}
                    site={editingSite}
                />
            )}
        </div>
    );
};

export default SiteManagement;
