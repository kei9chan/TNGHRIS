
import React, { useState, useMemo, useEffect } from 'react';
import { Site, BusinessUnit, Permission } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import SiteModal from '../../components/admin/SiteModal';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabaseClient';

const SiteManagement: React.FC = () => {
    const { user } = useAuth();
    const { getAccessibleBusinessUnits, can } = usePermissions();
    const canView = can('SiteManagement', Permission.View);
    const canManage = can('SiteManagement', Permission.Manage);
    const [sites, setSites] = useState<Site[]>([]);
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSite, setEditingSite] = useState<Site | null>(null);

    // Show all business units/sites; if you need scoping, reintroduce getAccessibleBusinessUnits
    const filteredSites = useMemo(() => sites, [sites]);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);
            const [{ data: siteRows, error: siteErr }, { data: buRows, error: buErr }] = await Promise.all([
                supabase.from('sites').select('id, name, latitude, longitude, radius_meters, business_unit_id, timezone, allowed_wifi_ssids, grace_period_minutes'),
                supabase.from('business_units').select('id, name'),
            ]);
            if (siteErr || buErr) {
                setError(siteErr?.message || buErr?.message || 'Failed to load sites.');
                setLoading(false);
                return;
            }
            setBusinessUnits((buRows || []).map((b: any) => ({ id: b.id, name: b.name } as BusinessUnit)));
            setSites((siteRows || []).map((s: any) => ({
                id: s.id,
                name: s.name,
                latitude: s.latitude ?? 0,
                longitude: s.longitude ?? 0,
                radiusMeters: s.radius_meters ?? 100,
                businessUnitId: s.business_unit_id,
                allowedWifiSSIDs: s.allowed_wifi_ssids || [],
                gracePeriodMinutes: s.grace_period_minutes ?? 0,
                timezone: s.timezone || '',
            } as Site)));
            setLoading(false);
        };
        loadData();
    }, []);

    const handleOpenModal = (site: Site | null) => {
        setEditingSite(site);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingSite(null);
    };

    const handleSave = async (siteToSave: Site) => {
        if (!siteToSave.name.trim() || !siteToSave.businessUnitId) {
            alert('Site name and Business Unit are required.');
            return;
        }
        setError(null);
        if (siteToSave.id) {
            const { error: err } = await supabase.from('sites').update({
                name: siteToSave.name,
                latitude: siteToSave.latitude,
                longitude: siteToSave.longitude,
                radius_meters: siteToSave.radiusMeters,
                business_unit_id: siteToSave.businessUnitId,
                timezone: (siteToSave as any).timezone || null,
                allowed_wifi_ssids: siteToSave.allowedWifiSSIDs || [],
                grace_period_minutes: siteToSave.gracePeriodMinutes ?? null,
            }).eq('id', siteToSave.id);
            if (err) {
                setError(err.message);
                return;
            }
            setSites(prev => prev.map(s => s.id === siteToSave.id ? siteToSave : s));
        } else {
            const { data, error: err } = await supabase.from('sites').insert({
                name: siteToSave.name,
                latitude: siteToSave.latitude,
                longitude: siteToSave.longitude,
                radius_meters: siteToSave.radiusMeters,
                business_unit_id: siteToSave.businessUnitId,
                timezone: (siteToSave as any).timezone || null,
                allowed_wifi_ssids: siteToSave.allowedWifiSSIDs || [],
                grace_period_minutes: siteToSave.gracePeriodMinutes ?? null,
            }).select('id').single();
            if (err) {
                setError(err.message);
                return;
            }
            if (data) {
                setSites(prev => [...prev, { ...siteToSave, id: data.id }]);
            }
        }
        handleCloseModal();
    };

    const handleDelete = async (siteId: string) => {
        if (!window.confirm('Are you sure you want to delete this site?')) return;
        const { error: err } = await supabase.from('sites').delete().eq('id', siteId);
        if (err) {
            setError(err.message);
            return;
        }
        setSites(prev => prev.filter(s => s.id !== siteId));
    };

    const getBuName = (buId: string) => {
        return businessUnits.find(bu => bu.id === buId)?.name || 'N/A';
    }

    if (!canView) {
        return (
            <Card>
                <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                    You do not have permission to view this page.
                </div>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Site Management</h1>
                {canManage && <Button onClick={() => handleOpenModal(null)}>Add New Site</Button>}
            </div>
            <p className="text-gray-600 dark:text-gray-400">Manage geofence locations for the GPS clock-in feature.</p>
            {error && (
                <Card>
                    <div className="p-3 text-sm text-red-600 dark:text-red-400">{error}</div>
                </Card>
            )}
            {loading && (
                <Card>
                    <div className="p-3 text-sm text-gray-600 dark:text-gray-300">Loading sites...</div>
                </Card>
            )}

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
                                            {canManage && <Button size="sm" variant="danger" onClick={() => handleDelete(site.id)}>Delete</Button>}
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
                    businessUnits={businessUnits}
                />
            )}
        </div>
    );
};

export default SiteManagement;
