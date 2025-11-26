
import React, { useState, useMemo, useEffect } from 'react';
import { Asset, AssetAssignment, AssetStatus, Permission, User, NotificationType, EnrichedAsset } from '../../types';
import { mockAssets, mockAssetAssignments, mockUsers, mockBusinessUnits, mockAssetRequests, mockNotifications } from '../../services/mockData';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { logActivity } from '../../services/auditService';
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

const AssetManagement: React.FC = () => {
    const { user } = useAuth();
    const { can, getAccessibleBusinessUnits } = usePermissions();
    const canManage = can('Assets', Permission.Manage);
    const canRequest = can('AssetRequests', Permission.Create);

    const [assets, setAssets] = useState<Asset[]>(mockAssets);
    const [assignments, setAssignments] = useState<AssetAssignment[]>(mockAssetAssignments);
    
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

    // Keep data fresh with mock DB
    useEffect(() => {
        const interval = setInterval(() => {
            if (mockAssets.length !== assets.length) setAssets([...mockAssets]);
            if (mockAssetAssignments.length !== assignments.length) setAssignments([...mockAssetAssignments]);
        }, 1000);
        return () => clearInterval(interval);
    }, [assets.length, assignments.length]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    // 1. Enrich Assets with BU Name and Assigned User info
    const enrichedAssets = useMemo(() => {
        // Only show assets for BUs the user has access to
        const accessibleBuIds = new Set(accessibleBus.map(b => b.id));
        
        return assets
            .filter(asset => accessibleBuIds.has(asset.businessUnitId))
            .map(asset => {
                let assignedTo: User | undefined;
                let dateAssigned: Date | undefined;
                let isPendingAcceptance = false;
                
                if (asset.status === AssetStatus.Assigned) {
                    const assignment = assignments.find(a => a.assetId === asset.id && !a.dateReturned);
                    if (assignment) {
                        assignedTo = mockUsers.find(u => u.id === assignment.employeeId);
                        dateAssigned = assignment.dateAssigned;
                        isPendingAcceptance = !assignment.isAcknowledged;
                    }
                }
                const businessUnitName = mockBusinessUnits.find(bu => bu.id === asset.businessUnitId)?.name || 'N/A';
                return { ...asset, assignedTo, dateAssigned, businessUnitName, isPendingAcceptance };
            });
    }, [assets, assignments, accessibleBus]);

    // 2. Apply UI Filters (Search, Status, Type, Specific BU)
    const filteredAssets = useMemo(() => {
        return enrichedAssets.filter(asset => {
            const search = filters.searchTerm.toLowerCase();
            const searchMatch = !search ||
                asset.name.toLowerCase().includes(search) ||
                asset.assetTag.toLowerCase().includes(search) ||
                asset.assignedTo?.name.toLowerCase().includes(search);
            
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
        
        // 1. Update Asset Status
        const assetIndex = mockAssets.findIndex(a => a.id === assetId);
        if (assetIndex > -1) {
            mockAssets[assetIndex] = { ...mockAssets[assetIndex], status: AssetStatus.Assigned };
            setAssets([...mockAssets]);
        }

        // 2. Create Assignment Record
        const newAssignment: AssetAssignment = {
            id: `ASSIGN-${Date.now()}`,
            assetId: assetId,
            employeeId: employeeId,
            dateAssigned: new Date(),
            conditionOnAssign: condition,
            isAcknowledged: false,
        };
        mockAssetAssignments.unshift(newAssignment);
        setAssignments([...mockAssetAssignments]);

        // 3. Audit & Notification
        const assetName = mockAssets[assetIndex]?.name || 'Unknown Asset';
        logActivity(user, 'CREATE', 'AssetAssignment', newAssignment.id, `Assigned existing asset ${assetName} to employee ${employeeId}`);
        
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

        setIsAssignmentModalOpen(false);
        alert("Asset assigned successfully.");
    };

    const handleSaveAsset = (assetData: Partial<Asset>, employeeIdToAssign?: string) => {
        if (!user) return;
        let savedAsset: Asset;
        if (assetData.id) { // Editing
            const index = mockAssets.findIndex(a => a.id === assetData.id);
            if (index > -1) {
                savedAsset = { ...mockAssets[index], ...assetData } as Asset;
                if (employeeIdToAssign) savedAsset.status = AssetStatus.Assigned;
                mockAssets[index] = savedAsset;
                setAssets([...mockAssets]);
                logActivity(user, 'UPDATE', 'Asset', savedAsset.id, `Updated asset: ${savedAsset.name}`);
            }
        } else { // Creating
            savedAsset = {
                id: `ASSET-${Date.now()}`,
                ...assetData,
                status: employeeIdToAssign ? AssetStatus.Assigned : AssetStatus.Available,
            } as Asset;
            mockAssets.unshift(savedAsset);
            setAssets([...mockAssets]);
            logActivity(user, 'CREATE', 'Asset', savedAsset.id, `Created new asset: ${savedAsset.name}`);
        }

        if (employeeIdToAssign) {
            const newAssignment: AssetAssignment = {
                id: `ASSIGN-${Date.now()}`,
                assetId: savedAsset!.id,
                employeeId: employeeIdToAssign,
                dateAssigned: new Date(),
                conditionOnAssign: 'New',
                isAcknowledged: false, 
            };
            mockAssetAssignments.unshift(newAssignment);
            setAssignments([...mockAssetAssignments]);
            
            logActivity(user, 'CREATE', 'AssetAssignment', newAssignment.id, `Assigned asset ${savedAsset!.name} to employee ID ${employeeIdToAssign}`);
             mockNotifications.unshift({
                id: `notif-asset-assign-${Date.now()}`,
                userId: employeeIdToAssign,
                type: NotificationType.ASSET_ASSIGNED,
                message: `You have been assigned a new asset: ${savedAsset!.name}. Please review and accept.`,
                link: '/my-profile',
                isRead: false,
                createdAt: new Date(),
                relatedEntityId: savedAsset!.id,
            });
        }
        setIsModalOpen(false);
    };

    const handleSaveReturnRequest = (request: any) => {
        if (!user) return;
        mockAssetRequests.unshift(request);
        logActivity(user, 'CREATE', 'AssetRequest', request.id, `Created return request for asset ID ${request.assetId}`);
        alert('Return request created successfully.');
        setIsReturnRequestModalOpen(false);
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
                />
            )}
            
            {isReturnRequestModalOpen && canRequest && (
                <AssetReturnRequestModal
                    isOpen={isReturnRequestModalOpen}
                    onClose={() => setIsReturnRequestModalOpen(false)}
                    onSave={handleSaveReturnRequest}
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
