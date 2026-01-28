
import React, { useMemo, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Asset, AssetAssignment, User } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import AssetAcceptanceModal from './AssetAcceptanceModal';
import { logActivity } from '../../services/auditService';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabaseClient';

interface EmployeeAssetsCardProps {
    employeeId: string;
    isMyProfile: boolean;
}

const EmployeeAssetsCard: React.FC<EmployeeAssetsCardProps> = ({ employeeId, isMyProfile }) => {
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [assignments, setAssignments] = useState<AssetAssignment[]>([]);
    const [selectedAssignment, setSelectedAssignment] = useState<{asset: Asset, assignment: AssetAssignment} | null>(null);

    useEffect(() => {
        let active = true;
        const loadAssets = async () => {
            try {
                const { data: assignmentRows, error: assignmentError } = await supabase
                    .from('asset_assignments')
                    .select('id, asset_id, employee_id, condition_on_assign, is_acknowledged, date_assigned, date_returned, acknowledged_at, signed_document_url')
                    .eq('employee_id', employeeId)
                    .order('date_assigned', { ascending: false });
                if (assignmentError) throw assignmentError;

                const mappedAssignments: AssetAssignment[] =
                    (assignmentRows || []).map((row: any) => ({
                        id: row.id,
                        assetId: row.asset_id,
                        employeeId: row.employee_id,
                        conditionOnAssign: row.condition_on_assign || '',
                        isAcknowledged: !!row.is_acknowledged,
                        dateAssigned: row.date_assigned ? new Date(row.date_assigned) : new Date(),
                        dateReturned: row.date_returned ? new Date(row.date_returned) : undefined,
                        acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : undefined,
                        signedDocumentUrl: row.signed_document_url || undefined,
                    })) || [];

                const assetIds = Array.from(new Set(mappedAssignments.map(a => a.assetId)));
                let mappedAssets: Asset[] = [];
                if (assetIds.length > 0) {
                    const { data: assetRows, error: assetError } = await supabase
                        .from('assets')
                        .select('id, asset_tag, name, type, business_unit_id, serial_number, purchase_date, value, status, notes')
                        .in('id', assetIds);
                    if (assetError) throw assetError;
                    mappedAssets =
                        (assetRows || []).map((row: any) => ({
                            id: row.id,
                            assetTag: row.asset_tag,
                            name: row.name,
                            type: row.type,
                            businessUnitId: row.business_unit_id,
                            serialNumber: row.serial_number || undefined,
                            purchaseDate: row.purchase_date ? new Date(row.purchase_date) : undefined,
                            value: row.value ?? undefined,
                            status: row.status,
                            notes: row.notes || undefined,
                        })) || [];
                }

                if (!active) return;
                setAssignments(mappedAssignments);
                setAssets(mappedAssets);
            } catch (err) {
                console.error('Failed to load employee assets', err);
            }
        };

        loadAssets();
        return () => {
            active = false;
        };
    }, [employeeId]);

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

    const handleAcceptAsset = async (assignmentId: string, signedDocumentUrl: string) => {
        try {
            const { error } = await supabase
                .from('asset_assignments')
                .update({
                    is_acknowledged: true,
                    acknowledged_at: new Date().toISOString(),
                    signed_document_url: signedDocumentUrl || null,
                })
                .eq('id', assignmentId);
            if (error) throw error;

            setAssignments(prev =>
                prev.map(a =>
                    a.id === assignmentId
                        ? {
                              ...a,
                              isAcknowledged: true,
                              acknowledgedAt: new Date(),
                              signedDocumentUrl: signedDocumentUrl || a.signedDocumentUrl,
                          }
                        : a
                )
            );

            if (user) {
                logActivity(user, 'UPDATE', 'AssetAssignment', assignmentId, 'Employee accepted asset assignment.');
            }
            alert('Asset accepted successfully.');
            setSelectedAssignment(null);
            navigate(location.pathname, { replace: true });
        } catch (err) {
            console.error('Failed to accept asset', err);
            alert('Failed to accept asset. Please try again.');
        }
    };

    useEffect(() => {
        if (!isMyProfile) return;
        const params = new URLSearchParams(location.search);
        const assignmentId = params.get('acceptAssetAssignmentId');
        if (!assignmentId) return;
        const match = myAssets.find(item => item.assignment.id === assignmentId);
        if (match) {
            setSelectedAssignment(match);
        }
    }, [isMyProfile, location.search, myAssets]);

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
                    onClose={() => {
                        setSelectedAssignment(null);
                        navigate(location.pathname, { replace: true });
                    }}
                    asset={selectedAssignment.asset}
                    assignment={selectedAssignment.assignment}
                    onAccept={handleAcceptAsset}
                />
            )}
        </>
    );
};

export default EmployeeAssetsCard;
