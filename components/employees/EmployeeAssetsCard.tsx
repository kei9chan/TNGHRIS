
import React, { useMemo, useState } from 'react';
import { Asset, AssetAssignment, AssetStatus, User } from '../../types';
import { mockAssets, mockAssetAssignments } from '../../services/mockData';
import Card from '../ui/Card';
import Button from '../ui/Button';
import AssetAcceptanceModal from './AssetAcceptanceModal';
import { logActivity } from '../../services/auditService';
import { useAuth } from '../../hooks/useAuth';

interface EmployeeAssetsCardProps {
    employeeId: string;
    isMyProfile: boolean;
}

const EmployeeAssetsCard: React.FC<EmployeeAssetsCardProps> = ({ employeeId, isMyProfile }) => {
    const { user } = useAuth();
    const [assets, setAssets] = useState<Asset[]>(mockAssets);
    const [assignments, setAssignments] = useState<AssetAssignment[]>(mockAssetAssignments);
    const [selectedAssignment, setSelectedAssignment] = useState<{asset: Asset, assignment: AssetAssignment} | null>(null);

    // Polling for updates
    React.useEffect(() => {
        const interval = setInterval(() => {
            if (mockAssets.length !== assets.length) setAssets([...mockAssets]);
            if (mockAssetAssignments.length !== assignments.length) setAssignments([...mockAssetAssignments]);
        }, 2000);
        return () => clearInterval(interval);
    }, [assets.length, assignments.length]);

    const myAssets = useMemo(() => {
        const activeAssignments = assignments.filter(a => a.employeeId === employeeId && !a.dateReturned);
        // Safely map and filter out any assignments where the asset has been deleted or not found
        const validItems = activeAssignments.map(assignment => {
            const asset = assets.find(a => a.id === assignment.assetId);
            if (!asset) return null;
            return { assignment, asset };
        }).filter((item): item is { assignment: AssetAssignment, asset: Asset } => item !== null);
        
        return validItems;
    }, [assignments, assets, employeeId]);

    const handleAcceptAsset = (assignmentId: string, signedDocumentUrl: string) => {
        const index = mockAssetAssignments.findIndex(a => a.id === assignmentId);
        if (index > -1) {
            mockAssetAssignments[index].isAcknowledged = true;
            mockAssetAssignments[index].acknowledgedAt = new Date();
            mockAssetAssignments[index].signedDocumentUrl = signedDocumentUrl; // Store the PDF/Image
            
            setAssignments([...mockAssetAssignments]);
            
            if (user) {
                logActivity(user, 'UPDATE', 'AssetAssignment', assignmentId, 'Employee accepted asset assignment.');
            }
            alert('Asset accepted successfully.');
            setSelectedAssignment(null);
        }
    };

    if (myAssets.length === 0) return null;

    return (
        <>
            <Card title="Assigned Assets">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-slate-800">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Tag</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Name</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date Assigned</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                                {isMyProfile && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Action</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {myAssets.map(({ asset, assignment }) => (
                                <tr key={assignment.id}> {/* Use assignment ID for key uniqueness */}
                                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-mono">{asset.assetTag}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{asset.name}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{new Date(assignment.dateAssigned).toLocaleDateString()}</td>
                                    <td className="px-4 py-3 text-sm">
                                        {assignment.isAcknowledged ? (
                                            <div>
                                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200">Accepted</span>
                                                {assignment.signedDocumentUrl && (
                                                    <div className="mt-1">
                                                        <a 
                                                            href={assignment.signedDocumentUrl} 
                                                            download={`Asset_Agreement_${asset.assetTag}.png`}
                                                            className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                                                        >
                                                            Download Agreement
                                                        </a>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200">Pending Acceptance</span>
                                        )}
                                    </td>
                                    {isMyProfile && (
                                        <td className="px-4 py-3 text-right">
                                            {!assignment.isAcknowledged && (
                                                <Button size="sm" onClick={() => setSelectedAssignment({ asset, assignment })}>Review & Accept</Button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            {selectedAssignment && (
                <AssetAcceptanceModal
                    isOpen={!!selectedAssignment}
                    onClose={() => setSelectedAssignment(null)}
                    asset={selectedAssignment.asset}
                    assignment={selectedAssignment.assignment}
                    onAccept={handleAcceptAsset}
                />
            )}
        </>
    );
};

export default EmployeeAssetsCard;
