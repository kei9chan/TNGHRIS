
import React, { useMemo } from 'react';
import { AssetAssignment, EnrichedAsset } from '../../types';
import { mockUsers, mockAssetRepairs } from '../../services/mockData';
import Modal from '../ui/Modal';
import { useSettings } from '../../context/SettingsContext';

interface AssetHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    asset: EnrichedAsset | null;
    assignments: AssetAssignment[];
}

const calculateDuration = (start: Date, end?: Date): string => {
    if (!start) return 'N/A';
    const endDate = end || new Date();
    let diff = endDate.getTime() - new Date(start).getTime();

    if (diff < 0) return 'Invalid dates';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const years = Math.floor(days / 365);
    const remainingDaysAfterYears = days % 365;
    const months = Math.floor(remainingDaysAfterYears / 30);
    const remainingDays = remainingDaysAfterYears % 30;

    const parts = [];
    if (years > 0) parts.push(`${years} year${years > 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} month${months > 1 ? 's' : ''}`);
    if (remainingDays > 0) parts.push(`${remainingDays} day${remainingDays > 1 ? 's' : ''}`);

    if (parts.length === 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
        return 'Less than an hour';
    }
    
    return parts.join(', ');
};

const DetailItem: React.FC<{ label: string, children: React.ReactNode }> = ({ label, children }) => (
    <div>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
        <p className="mt-1 text-sm text-gray-900 dark:text-white font-semibold">{children || 'N/A'}</p>
    </div>
);

const AssetHistoryModal: React.FC<AssetHistoryModalProps> = ({ isOpen, onClose, asset, assignments }) => {
    const { settings } = useSettings();

    const history = useMemo(() => {
        if (!asset || !asset.id) return [];
        return assignments
            .filter(a => a.assetId === asset.id)
            .sort((a, b) => new Date(b.dateAssigned).getTime() - new Date(a.dateAssigned).getTime())
            .map(assignment => ({
                ...assignment,
                employeeName: mockUsers.find(u => u.id === assignment.employeeId)?.name || 'Unknown User'
            }));
    }, [asset, assignments]);

    const repairs = useMemo(() => {
        if (!asset || !asset.id) return [];
        return mockAssetRepairs
            .filter(r => r.assetId === asset.id)
            .sort((a, b) => new Date(b.dateIn).getTime() - new Date(a.dateIn).getTime());
    }, [asset]);

    if (!asset) return null;

    const purchaseDateStr = asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString() : 'N/A';
    const valueStr = asset.value ? `${settings.currency} ${asset.value.toLocaleString()}` : 'N/A';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Audit Trail for ${asset.assetTag || 'Asset'}`}
            size="4xl"
        >
            <div className="space-y-6">
                <div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{asset.name}</h3>
                    <p className="text-md text-gray-500">{asset.type} | {asset.businessUnitName}</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 dark:bg-slate-900/40 rounded-lg border dark:border-slate-700">
                    <DetailItem label="Purchase Date">{purchaseDateStr}</DetailItem>
                    <DetailItem label="Value">{valueStr}</DetailItem>
                    <DetailItem label="Serial No.">{asset.serialNumber || 'N/A'}</DetailItem>
                    <DetailItem label="Current Status">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800`}>{asset.status}</span>
                    </DetailItem>
                </div>

                {asset.notes && (
                     <div>
                        <h4 className="font-semibold text-gray-800 dark:text-gray-200">Notes</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 p-3 bg-gray-50 dark:bg-slate-900/40 rounded-md">{asset.notes}</p>
                    </div>
                )}
                
                <div>
                    <h4 className="font-semibold text-lg text-gray-800 dark:text-gray-200 mb-2">Assignment History</h4>
                    <div className="overflow-x-auto border rounded-lg dark:border-slate-700">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                             <thead className="bg-gray-50 dark:bg-gray-700/50">
                                <tr>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Assigned To</th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date Assigned</th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date Returned</th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Condition</th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Duration</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {history.map(item => (
                                    <tr key={item.id}>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">{item.employeeName}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm">{new Date(item.dateAssigned).toLocaleDateString()}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                                            {item.isAcknowledged ? (
                                                <div className="flex flex-col">
                                                    <span className="text-green-600 font-semibold">Accepted</span>
                                                    {item.signedDocumentUrl && (
                                                        <a href={item.signedDocumentUrl} download={`Agreement_${asset.assetTag}.png`} className="text-xs text-indigo-600 hover:underline">Agreement</a>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-yellow-600 font-semibold">Pending Acceptance</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                                            {item.dateReturned ? new Date(item.dateReturned).toLocaleDateString() : <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200">In Use</span>}
                                        </td>
                                        <td className="px-4 py-4 whitespace-normal text-sm">{item.dateReturned ? item.conditionOnReturn : item.conditionOnAssign}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm">{calculateDuration(item.dateAssigned, item.dateReturned)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                         {history.length === 0 && (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                <p>No assignment history found for this asset.</p>
                            </div>
                        )}
                    </div>
                </div>

                {repairs.length > 0 && (
                     <div>
                        <h4 className="font-semibold text-lg text-gray-800 dark:text-gray-200 mb-2">Repair & Maintenance Log</h4>
                         <div className="overflow-x-auto border rounded-lg dark:border-slate-700">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-700/50">
                                    <tr>
                                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date In</th>
                                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date Out</th>
                                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Notes</th>
                                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Cost</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                    {repairs.map(item => (
                                        <tr key={item.id}>
                                            <td className="px-4 py-4 whitespace-nowrap text-sm">{new Date(item.dateIn).toLocaleDateString()}</td>
                                            <td className="px-4 py-4 whitespace-nowrap text-sm">{item.dateOut ? new Date(item.dateOut).toLocaleDateString() : 'In Progress'}</td>
                                            <td className="px-4 py-4 whitespace-normal text-sm">{item.notes}</td>
                                            <td className="px-4 py-4 whitespace-nowrap text-sm">{item.cost ? `${settings.currency} ${item.cost.toLocaleString()}`: 'N/A'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default AssetHistoryModal;
