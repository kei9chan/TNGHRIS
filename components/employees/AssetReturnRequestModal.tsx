
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AssetRequest, AssetRequestStatus, User, Asset, AssetAssignment, AssetStatus } from '../../types';
import { mockUsers, mockAssets, mockAssetAssignments } from '../../services/mockData';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import Input from '../ui/Input';
import { useAuth } from '../../hooks/useAuth';

interface AssetReturnRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (request: AssetRequest) => void;
}

const AssetReturnRequestModal: React.FC<AssetReturnRequestModalProps> = ({ isOpen, onClose, onSave }) => {
    const { user } = useAuth();
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
    const [justification, setJustification] = useState('');

    // Search States
    const [employeeSearch, setEmployeeSearch] = useState('');
    const [isEmployeeDropdownOpen, setIsEmployeeDropdownOpen] = useState(false);
    const employeeWrapperRef = useRef<HTMLDivElement>(null);

    const [assetSearch, setAssetSearch] = useState('');
    const [isAssetDropdownOpen, setIsAssetDropdownOpen] = useState(false);
    const assetWrapperRef = useRef<HTMLDivElement>(null);

    const employeesWithAssets = useMemo(() => {
        const userIdsWithAssets = new Set(mockAssetAssignments.filter(a => !a.dateReturned).map(a => a.employeeId));
        return mockUsers.filter(u => userIdsWithAssets.has(u.id)).sort((a, b) => a.name.localeCompare(b.name));
    }, []);

    const filteredEmployees = useMemo(() => {
        if (!employeeSearch) return employeesWithAssets.slice(0, 10);
        const lower = employeeSearch.toLowerCase();
        return employeesWithAssets.filter(e => e.name.toLowerCase().includes(lower)).slice(0, 10);
    }, [employeeSearch, employeesWithAssets]);

    const assetsForEmployee = useMemo(() => {
        if (!selectedEmployeeId) return [];
        const assignments = mockAssetAssignments.filter(a => a.employeeId === selectedEmployeeId && !a.dateReturned);
        return assignments.map(assignment => {
            const asset = mockAssets.find(asset => asset.id === assignment.assetId);
            return { assignment, asset };
        }).filter(item => item.asset) as { assignment: AssetAssignment, asset: Asset }[];
    }, [selectedEmployeeId]);

    const filteredAssets = useMemo(() => {
        if (!assetSearch) return assetsForEmployee;
        const lower = assetSearch.toLowerCase();
        return assetsForEmployee.filter(item => 
            item.asset.name.toLowerCase().includes(lower) || 
            item.asset.assetTag.toLowerCase().includes(lower)
        );
    }, [assetSearch, assetsForEmployee]);

    useEffect(() => {
        if (isOpen) {
            setSelectedEmployeeId('');
            setEmployeeSearch('');
            setSelectedAssignmentId('');
            setAssetSearch('');
            setJustification('');
            setIsEmployeeDropdownOpen(false);
            setIsAssetDropdownOpen(false);
        }
    }, [isOpen]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (employeeWrapperRef.current && !employeeWrapperRef.current.contains(event.target as Node)) {
                setIsEmployeeDropdownOpen(false);
            }
            if (assetWrapperRef.current && !assetWrapperRef.current.contains(event.target as Node)) {
                setIsAssetDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleSelectEmployee = (u: User) => {
        setSelectedEmployeeId(u.id);
        setEmployeeSearch(u.name);
        setIsEmployeeDropdownOpen(false);
        // Reset asset selection when employee changes
        setSelectedAssignmentId('');
        setAssetSearch('');
    };

    const handleSelectAsset = (item: { assignment: AssetAssignment, asset: Asset }) => {
        setSelectedAssignmentId(item.assignment.id);
        setAssetSearch(`${item.asset.assetTag} - ${item.asset.name}`);
        setIsAssetDropdownOpen(false);
    };

    const handleSave = () => {
        if (!user || !selectedEmployeeId || !selectedAssignmentId || !justification) {
            alert('Please select an employee, an asset, and provide a justification.');
            return;
        }

        const assignment = mockAssetAssignments.find(a => a.id === selectedAssignmentId);
        const asset = mockAssets.find(a => a.id === assignment?.assetId);
        const employee = mockUsers.find(u => u.id === selectedEmployeeId);

        if (!assignment || !asset || !employee) return;
        
        const newRequest: AssetRequest = {
            id: `ASSET-REQ-${Date.now()}`,
            requestType: 'Return',
            employeeId: selectedEmployeeId,
            employeeName: employee.name,
            assetId: asset.id,
            assetDescription: `${asset.assetTag} - ${asset.name}`,
            justification,
            status: AssetRequestStatus.Pending,
            requestedAt: new Date(),
            managerId: user.id,
        };

        onSave(newRequest);
    };

    const footer = (
        <div className="flex justify-end w-full space-x-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>Create Return Request</Button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Initiate Asset Return" footer={footer}>
            <div className="space-y-6">
                <div className="relative" ref={employeeWrapperRef}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Employee</label>
                    <Input
                        label=""
                        value={employeeSearch}
                        onChange={(e) => {
                            setEmployeeSearch(e.target.value);
                            if (e.target.value === '') {
                                setSelectedEmployeeId('');
                                setSelectedAssignmentId('');
                                setAssetSearch('');
                            }
                            setIsEmployeeDropdownOpen(true);
                        }}
                        onFocus={() => setIsEmployeeDropdownOpen(true)}
                        placeholder="Search employee..."
                        autoComplete="off"
                    />
                     {isEmployeeDropdownOpen && (
                        <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-md shadow-lg max-h-48 overflow-y-auto">
                            {filteredEmployees.length > 0 ? (
                                filteredEmployees.map(u => (
                                    <div
                                        key={u.id}
                                        onClick={() => handleSelectEmployee(u)}
                                        className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                                    >
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">{u.name}</p>
                                    </div>
                                ))
                            ) : (
                                <div className="px-4 py-2 text-sm text-gray-500">No employees with assets found.</div>
                            )}
                        </div>
                    )}
                </div>

                <div className="relative" ref={assetWrapperRef}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Asset to Return</label>
                    <Input
                        label=""
                        value={assetSearch}
                        onChange={(e) => {
                            setAssetSearch(e.target.value);
                            if (e.target.value === '') setSelectedAssignmentId('');
                            setIsAssetDropdownOpen(true);
                        }}
                        onFocus={() => setIsAssetDropdownOpen(true)}
                        placeholder="Search asset..."
                        disabled={!selectedEmployeeId}
                        autoComplete="off"
                    />
                     {isAssetDropdownOpen && selectedEmployeeId && (
                        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-md shadow-lg max-h-48 overflow-y-auto">
                            {filteredAssets.length > 0 ? (
                                filteredAssets.map(item => (
                                    <div
                                        key={item.assignment.id}
                                        onClick={() => handleSelectAsset(item)}
                                        className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                                    >
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">{item.asset.assetTag} - {item.asset.name}</p>
                                    </div>
                                ))
                            ) : (
                                <div className="px-4 py-2 text-sm text-gray-500">No assets found for this employee.</div>
                            )}
                        </div>
                    )}
                </div>

                <Textarea 
                    label="Justification for Return Request" 
                    value={justification} 
                    onChange={e => setJustification(e.target.value)} 
                    rows={3} 
                    required 
                />
            </div>
        </Modal>
    );
};

export default AssetReturnRequestModal;
