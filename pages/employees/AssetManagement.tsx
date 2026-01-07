
import React, { useState, useMemo, useEffect } from 'react';
import { Asset, AssetAssignment, AssetStatus, Permission, User, NotificationType, EnrichedAsset } from '../../types';
import { mockUsers, mockBusinessUnits, mockAssetRequests, mockNotifications } from '../../services/mockData';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { logActivity } from '../../services/auditService';
import { supabase } from '../../services/supabaseClient';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import AssetModal from '../../components/employees/AssetModal';
import AssetHistoryModal from '../../components/employees/AssetHistoryModal';
import AssetReturnRequestModal from '../../components/employees/AssetReturnRequestModal';
import AssetAssignmentModal from '../../components/employees/AssetAssignmentModal';

const getStatusColor = (status: AssetStatus) => {
    switch (status) {
        case AssetStatus.Available: return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200';
        case AssetStatus.Assigned: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200';
        case AssetStatus.InRepair: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200';
        case AssetStatus.Retired: return 'bg-gray-500 text-white dark:bg-gray-700';
        default: return 'bg-gray-100 text-gray-800';
    }
};

// Icon for the export button
const DocumentArrowDownIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);

type AssetRow = {
    id: string;
    asset_tag: string;
    name: string;
    type: string;
    business_unit_id: string;
    serial_number?: string | null;
    purchase_date: string;
    value?: number | null;
    status: AssetStatus | string;
    notes?: string | null;
};

type AssignmentRow = {
    id: string;
    asset_id: string;
    employee_id: string;
    date_assigned: string;
    date_returned?: string | null;
    condition_on_assign: string;
    condition_on_return?: string | null;
    manager_proof_url_on_return?: string | null;
    is_acknowledged?: boolean | null;
    acknowledged_at?: string | null;
    signed_document_url?: string | null;
    assets?: AssetRow | null;
};

const mapAssetRow = (row: AssetRow): Asset => ({
    id: row.id,
    assetTag: row.asset_tag,
    name: row.name,
    type: row.type as Asset['type'],
    businessUnitId: row.business_unit_id,
    serialNumber: row.serial_number || undefined,
    purchaseDate: new Date(row.purchase_date),
    value: row.value ?? 0,
    status: row.status as AssetStatus,
    notes: row.notes || undefined,
});

const mapAssignmentRow = (row: AssignmentRow): AssetAssignment => ({
    id: row.id,
    assetId: row.asset_id,
    employeeId: row.employee_id,
    dateAssigned: new Date(row.date_assigned),
    dateReturned: row.date_returned ? new Date(row.date_returned) : undefined,
    conditionOnAssign: row.condition_on_assign,
    conditionOnReturn: row.condition_on_return || undefined,
    managerProofUrlOnReturn: row.manager_proof_url_on_return || undefined,
    isAcknowledged: !!row.is_acknowledged,
    acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : undefined,
    signedDocumentUrl: row.signed_document_url || undefined,
});

const AssetManagement: React.FC = () => {
    const { user } = useAuth();
    const { can, getAccessibleBusinessUnits } = usePermissions();
    const canManage = can('Assets', Permission.Manage);
    const canRequest = can('AssetRequests', Permission.Create);

    const [assets, setAssets] = useState<Asset[]>([]);
    const [assetsLoading, setAssetsLoading] = useState(true);
    const [assignments, setAssignments] = useState<AssetAssignment[]>([]);
    const [employees, setEmployees] = useState<User[]>([]);
    
    // Modals
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isReturnRequestModalOpen, setIsReturnRequestModalOpen] = useState(false);
    const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
    const [selectedAssetForHistory, setSelectedAssetForHistory] = useState<EnrichedAsset | null>(null);

    // Filters
    const [filters, setFilters] = useState({
        searchTerm: '',
        status: '',
        type: '',
        bu: '',
    });

    // Load accessible BUs for the filter dropdown
    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);

    // Load data from Supabase
    useEffect(() => {
        const loadAssets = async () => {
            try {
                const { data, error } = await supabase.from('assets').select('*').order('created_at', { ascending: false });
                if (error) throw error;
                setAssets((data as AssetRow[] | null)?.map(mapAssetRow) || []);
            } catch (err) {
                console.error('Failed to load assets', err);
                setAssets([]);
            } finally {
                setAssetsLoading(false);
            }
        };
        const loadAssignments = async () => {
            try {
                const { data, error } = await supabase
                    .from('asset_assignments')
                    .select('*')
                    .order('date_assigned', { ascending: false });
                if (error) throw error;
                setAssignments((data as AssignmentRow[] | null)?.map(mapAssignmentRow) || []);
            } catch (err) {
                console.error('Failed to load asset assignments', err);
                setAssignments([]);
            }
        };
        const loadEmployees = async () => {
            try {
                const { data, error } = await supabase
                    .from('hris_users')
                    .select('id, full_name, role, status, position');
                if (error) throw error;
                const mapped =
                    data?.map((u: any) => ({
                        id: u.id,
                        name: u.full_name,
                        email: '',
                        role: u.role,
                        status: u.status,
                        position: (u as any)?.position,
                    })) || [];
                setEmployees(mapped);
            } catch (err) {
                console.error('Failed to load employees for assets page', err);
                setEmployees([]);
            }
        };
        loadAssets();
        loadAssignments();
        loadEmployees();
    }, []);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    // 1. Enrich Assets with BU Name and Assigned User info
    const enrichedAssets = useMemo(() => {
        const userLookup = employees.reduce<Record<string, User>>((acc, u) => {
            acc[u.id] = u;
            return acc;
        }, {});
        return assets.map(asset => {
            const activeAssignment = assignments.find(a => a.assetId === asset.id && !a.dateReturned);
            const assignedTo = activeAssignment ? userLookup[activeAssignment.employeeId] : undefined;
            const businessUnitName = mockBusinessUnits.find(bu => bu.id === asset.businessUnitId)?.name || 'N/A';
            return {
                ...asset,
                assignedTo,
                dateAssigned: activeAssignment?.dateAssigned,
                isPendingAcceptance: activeAssignment ? !activeAssignment.isAcknowledged : false,
                businessUnitName,
            };
        });
    }, [assets, assignments, employees]);

    // 2. Apply UI Filters (Search, Status, Type, Specific BU) with dedupe
    const filteredAssets = useMemo(() => {
        const seen = new Set<string>();
        return enrichedAssets.filter(asset => {
            // de-dupe by asset id to avoid duplicate key rendering
            if (seen.has(asset.id)) return false;
            seen.add(asset.id);

            const search = filters.searchTerm.toLowerCase();
            const searchMatch = !search ||
                asset.name.toLowerCase().includes(search) ||
                asset.assetTag.toLowerCase().includes(search) ||
                asset.assignedTo?.name?.toLowerCase().includes(search);
            
            const statusMatch = !filters.status || asset.status === filters.status;
            const typeMatch = !filters.type || asset.type === filters.type;
            const buMatch = !filters.bu || asset.businessUnitId === filters.bu;

            return searchMatch && statusMatch && typeMatch && buMatch;
        });
    }, [enrichedAssets, filters]);
    
    // CSV Export Function
    const exportToCSV = () => {
        const headers = ['Asset Tag', 'Name', 'Business Unit', 'Type', 'Status', 'Serial Number', 'Value', 'Assigned To', 'Date Assigned', 'Purchase Date', 'Notes'];
        const csvRows = [headers.join(',')];

        // Helper to escape CSV fields
        const escape = (str: string | number | null | undefined) => {
            if (str === null || str === undefined) return '';
            return `"${String(str).replace(/"/g, '""')}"`;
        };

        for (const asset of filteredAssets) {
            const values = [
                escape(asset.assetTag),
                escape(asset.name),
                escape(asset.businessUnitName),
                escape(asset.type),
                escape(asset.status),
                escape(asset.serialNumber),
                asset.value || 0,
                escape(asset.assignedTo ? asset.assignedTo.name : 'N/A'),
                escape(asset.dateAssigned ? new Date(asset.dateAssigned).toLocaleDateString() : ''),
                escape(asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString() : ''),
                escape(asset.notes)
            ];
            csvRows.push(values.join(','));
        }

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', `assets_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const handleOpenModal = (asset: Asset | null) => {
        setEditingAsset(asset);
        setIsModalOpen(true);
    };
    
    const handleReturnAsset = () => setIsReturnRequestModalOpen(true);
    
    const handleViewHistory = (asset: EnrichedAsset) => {
        setSelectedAssetForHistory(asset);
        setIsHistoryModalOpen(true);
    };

    // NEW: Handle assigning an existing asset
    const handleAssignExistingAsset = (assetId: string, employeeId: string, condition: string) => {
        if (!user) return;

        const persist = async () => {
            // Update asset status
            const { error: assetError } = await supabase
                .from('assets')
                .update({ status: AssetStatus.Assigned, updated_at: new Date().toISOString() })
                .eq('id', assetId);
            if (assetError) throw assetError;

            // Insert assignment
            const { data, error } = await supabase
                .from('asset_assignments')
                .insert({
                    asset_id: assetId,
                    employee_id: employeeId,
                    condition_on_assign: condition,
                    is_acknowledged: false,
                    date_assigned: new Date().toISOString(),
                })
                .select('*')
                .single();
            if (error) throw error;

            const mappedAssign = mapAssignmentRow(data as AssignmentRow);
            setAssignments(prev => [mappedAssign, ...prev]);

            // Refresh asset list locally
            setAssets(prev => prev.map(a => a.id === assetId ? { ...a, status: AssetStatus.Assigned } : a));

            const assetName = assets.find(a => a.id === assetId)?.name || 'Asset';
            logActivity(user, 'CREATE', 'AssetAssignment', mappedAssign.id, `Assigned existing asset ${assetName} to employee ${employeeId}`);
            mockNotifications.unshift({
                id: `notif-asset-assign-${Date.now()}`,
                userId: employeeId,
                type: NotificationType.ASSET_ASSIGNED,
                message: `You have been assigned an asset: ${assetName}. Please review and accept.`,
                link: '/my-profile',
                isRead: false,
                createdAt: new Date(),
                relatedEntityId: assetId,
            });
        };

        persist()
            .then(() => {
                setIsAssignmentModalOpen(false);
                alert("Asset assigned successfully.");
            })
            .catch(err => {
                console.error('Failed to assign asset', err);
                alert('Failed to assign asset. Please try again.');
            });
    };

    const handleSaveAsset = (assetData: Partial<Asset>, employeeIdToAssign?: string) => {
        if (!user) return;

        const persist = async () => {
            const payload = {
                asset_tag: assetData.assetTag,
                name: assetData.name,
                type: assetData.type,
                business_unit_id: assetData.businessUnitId,
                serial_number: assetData.serialNumber || null,
                purchase_date: assetData.purchaseDate ? new Date(assetData.purchaseDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                value: assetData.value ?? 0,
                status: employeeIdToAssign ? AssetStatus.Assigned : (assetData.status || AssetStatus.Available),
                notes: assetData.notes || null,
                updated_at: new Date().toISOString(),
            };

            const isEdit = !!assetData.id;
            const { data, error } = isEdit
                ? await supabase.from('assets').update(payload).eq('id', assetData.id).select('*').single()
                : await supabase.from('assets').insert(payload).select('*').single();
            if (error) throw error;
            const mappedAsset = mapAssetRow(data as AssetRow);

            // Create initial assignment if provided
            if (employeeIdToAssign) {
                const { data: assignmentData, error: assignError } = await supabase
                    .from('asset_assignments')
                    .insert({
                        asset_id: mappedAsset.id,
                        employee_id: employeeIdToAssign,
                        condition_on_assign: 'New',
                        is_acknowledged: false,
                        date_assigned: new Date().toISOString(),
                    })
                    .select('*')
                    .single();
                if (assignError) throw assignError;
                const mappedAssign = mapAssignmentRow(assignmentData as AssignmentRow);
                setAssignments(prev => [mappedAssign, ...prev]);

                mockNotifications.unshift({
                    id: `notif-asset-assign-${Date.now()}`,
                    userId: employeeIdToAssign,
                    type: NotificationType.ASSET_ASSIGNED,
                    message: `You have been assigned a new asset: ${mappedAsset.name}. Please review and accept.`,
                    link: '/my-profile',
                    isRead: false,
                    createdAt: new Date(),
                    relatedEntityId: mappedAsset.id,
                });
            }

            setAssets(prev => {
                if (isEdit) {
                    return prev.map(a => a.id === mappedAsset.id ? mappedAsset : a);
                }
                return [mappedAsset, ...prev];
            });

            logActivity(user, isEdit ? 'UPDATE' : 'CREATE', 'Asset', mappedAsset.id, `${isEdit ? 'Updated' : 'Created'} asset: ${mappedAsset.name}`);
        };

        persist()
            .then(() => setIsModalOpen(false))
            .catch(err => {
                console.error('Failed to save asset', err);
                alert('Failed to save asset. Please try again.');
            });
    };

    const handleSaveReturnRequest = (request: any) => {
        if (!user) return;
        const persist = async () => {
            const { error } = await supabase
                .from('asset_requests')
                .insert({
                    request_type: 'Return',
                    employee_id: request.employeeId,
                    employee_name: request.employeeName,
                    asset_id: request.assetId,
                    asset_description: request.assetDescription,
                    justification: request.justification,
                    status: request.status,
                    requested_at: request.requestedAt ? new Date(request.requestedAt).toISOString() : new Date().toISOString(),
                    manager_id: request.managerId,
                });
            if (error) throw error;
        };

        persist()
            .then(() => {
                logActivity(user, 'CREATE', 'AssetRequest', request.id, `Created return request for asset ID ${request.assetId}`);
                alert('Return request created successfully.');
                setIsReturnRequestModalOpen(false);
            })
            .catch(err => {
                console.error('Failed to create return request', err);
                alert('Failed to create return request. Please try again.');
            });
    };

    const assetTypes = ['Laptop', 'Mobile Phone', 'Monitor', 'Software License', 'Other'];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Asset Management</h1>
                <div className="flex space-x-2">
                    <Button variant="secondary" onClick={exportToCSV} disabled={filteredAssets.length === 0} title="Download CSV report of currently filtered assets">
                         <DocumentArrowDownIcon /> Export CSV
                    </Button>
                    {canRequest && <Button variant="secondary" onClick={handleReturnAsset}>Return Asset</Button>}
                    {canManage && (
                        <>
                            <Button variant="secondary" onClick={() => setIsAssignmentModalOpen(true)}>Assign Asset</Button>
                            <Button onClick={() => handleOpenModal(null)}>Add New Asset</Button>
                        </>
                    )}
                </div>
            </div>
            
            <Card>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Input label="Search" name="searchTerm" placeholder="Tag, name, or employee..." value={filters.searchTerm} onChange={handleFilterChange} />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <select name="status" value={filters.status} onChange={handleFilterChange} className="mt-1 block w-full pl-3 pr-10 py-2 border-gray-300 dark:bg-slate-700 dark:border-slate-600 rounded-md">
                            <option value="">All</option>
                            {Object.values(AssetStatus).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
                        <select name="type" value={filters.type} onChange={handleFilterChange} className="mt-1 block w-full pl-3 pr-10 py-2 border-gray-300 dark:bg-slate-700 dark:border-slate-600 rounded-md">
                            <option value="">All</option>
                            {assetTypes.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                         <select name="bu" value={filters.bu} onChange={handleFilterChange} className="mt-1 block w-full pl-3 pr-10 py-2 border-gray-300 dark:bg-slate-700 dark:border-slate-600 rounded-md">
                            <option value="">All Accessible</option>
                            {accessibleBus.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                        </select>
                    </div>
                </div>
            </Card>

            <Card className="!p-0">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-slate-900/40">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Tag</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Asset Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Business Unit</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Assigned To</th>
                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300">Date Assigned</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredAssets.map(asset => (
                                <tr key={asset.id} onClick={() => handleViewHistory(asset)} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer">
                                    <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">{asset.assetTag}</td>
                                    <td className="px-6 py-4 whitespace-nowrap font-semibold">{asset.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{asset.businessUnitName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{asset.type}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(asset.status)}`}>
                                            {asset.status}
                                        </span>
                                        {(asset as any).isPendingAcceptance && (
                                            <div className="text-xs text-orange-600 mt-1 font-medium">Pending Acceptance</div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{asset.assignedTo?.name || 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{asset.dateAssigned ? new Date(asset.dateAssigned).toLocaleDateString() : 'N/A'}</td>
                                </tr>
                            ))}
                             {filteredAssets.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="text-center py-10 text-gray-500">No assets found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {isModalOpen && canManage && (
                <AssetModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleSaveAsset}
                    asset={editingAsset}
                />
            )}
            
            {isAssignmentModalOpen && canManage && (
                <AssetAssignmentModal
                    isOpen={isAssignmentModalOpen}
                    onClose={() => setIsAssignmentModalOpen(false)}
                    onAssign={handleAssignExistingAsset}
                    assets={assets}
                />
            )}

            {isReturnRequestModalOpen && canRequest && (
                <AssetReturnRequestModal
                    isOpen={isReturnRequestModalOpen}
                    onClose={() => setIsReturnRequestModalOpen(false)}
                    onSave={handleSaveReturnRequest}
                    assets={assets}
                    assignments={assignments}
                />
            )}

            <AssetHistoryModal
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                asset={selectedAssetForHistory}
                assignments={assignments}
            />

        </div>
    );
};

export default AssetManagement;
