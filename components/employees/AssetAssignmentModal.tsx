
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Asset, User, AssetStatus } from '../../types';
import { mockAssets, mockUsers } from '../../services/mockData';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';

interface AssetAssignmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAssign: (assetId: string, employeeId: string, condition: string) => void;
}

const AssetAssignmentModal: React.FC<AssetAssignmentModalProps> = ({ isOpen, onClose, onAssign }) => {
    const [selectedAssetId, setSelectedAssetId] = useState('');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [condition, setCondition] = useState('Good / New');
    
    const [employeeSearch, setEmployeeSearch] = useState('');
    const [isEmployeeDropdownOpen, setIsEmployeeDropdownOpen] = useState(false);
    const employeeWrapperRef = useRef<HTMLDivElement>(null);

    const [assetSearch, setAssetSearch] = useState('');
    const [isAssetDropdownOpen, setIsAssetDropdownOpen] = useState(false);
    const assetWrapperRef = useRef<HTMLDivElement>(null);

    // Filter only Available assets
    const availableAssets = useMemo(() => {
        return mockAssets.filter(a => a.status === AssetStatus.Available);
    }, []);

    // Filter active employees
    const activeUsers = useMemo(() => {
        return mockUsers.filter(u => u.status === 'Active');
    }, []);

    const filteredUsers = useMemo(() => {
        if (!employeeSearch) return activeUsers.slice(0, 5);
        const lowerSearch = employeeSearch.toLowerCase();
        return activeUsers.filter(user => 
            user.name.toLowerCase().includes(lowerSearch) && user.id !== selectedEmployeeId
        ).slice(0, 10);
    }, [employeeSearch, activeUsers, selectedEmployeeId]);

    const filteredAssets = useMemo(() => {
        if (!assetSearch) return availableAssets.slice(0, 5);
        const lowerSearch = assetSearch.toLowerCase();
        return availableAssets.filter(asset => 
            asset.assetTag.toLowerCase().includes(lowerSearch) ||
            asset.name.toLowerCase().includes(lowerSearch) ||
            asset.type.toLowerCase().includes(lowerSearch)
        ).slice(0, 10);
    }, [assetSearch, availableAssets]);

    // Reset form on open
    useEffect(() => {
        if (isOpen) {
            setSelectedAssetId('');
            setSelectedEmployeeId('');
            setEmployeeSearch('');
            setAssetSearch('');
            setCondition('Good / New');
            setIsEmployeeDropdownOpen(false);
            setIsAssetDropdownOpen(false);
        }
    }, [isOpen]);

    // Click outside handler
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

    const handleSelectEmployee = (user: User) => {
        setSelectedEmployeeId(user.id);
        setEmployeeSearch(user.name);
        setIsEmployeeDropdownOpen(false);
    };

    const handleSelectAsset = (asset: Asset) => {
        setSelectedAssetId(asset.id);
        setAssetSearch(`${asset.assetTag} - ${asset.name}`);
        setIsAssetDropdownOpen(false);
    };

    const handleSubmit = () => {
        if (!selectedAssetId || !selectedEmployeeId) {
            alert('Please select both an asset and an employee.');
            return;
        }
        onAssign(selectedAssetId, selectedEmployeeId, condition);
    };

    const footer = (
        <div className="flex justify-end w-full space-x-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!selectedAssetId || !selectedEmployeeId}>Assign Asset</Button>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Assign Existing Asset"
            footer={footer}
        >
            <div className="space-y-6">
                <div className="relative" ref={assetWrapperRef}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Asset</label>
                    <Input
                        label=""
                        value={assetSearch}
                        onChange={(e) => {
                            setAssetSearch(e.target.value);
                            if (e.target.value === '') setSelectedAssetId('');
                            setIsAssetDropdownOpen(true);
                        }}
                        onFocus={() => setIsAssetDropdownOpen(true)}
                        placeholder="Search asset tag or name..."
                        autoComplete="off"
                    />
                    {isAssetDropdownOpen && (
                        <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-md shadow-lg max-h-48 overflow-y-auto">
                            {filteredAssets.length > 0 ? (
                                filteredAssets.map(asset => (
                                    <div
                                        key={asset.id}
                                        onClick={() => handleSelectAsset(asset)}
                                        className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                                    >
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">{asset.assetTag} - {asset.name}</p>
                                        <p className="text-xs text-gray-500">{asset.type}</p>
                                    </div>
                                ))
                            ) : (
                                <div className="px-4 py-2 text-sm text-gray-500">No available assets found.</div>
                            )}
                        </div>
                    )}
                </div>

                <div className="relative" ref={employeeWrapperRef}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Assign To</label>
                    <Input
                        label=""
                        value={employeeSearch}
                        onChange={(e) => {
                            setEmployeeSearch(e.target.value);
                            if (e.target.value === '') setSelectedEmployeeId('');
                            setIsEmployeeDropdownOpen(true);
                        }}
                        onFocus={() => setIsEmployeeDropdownOpen(true)}
                        placeholder="Search employee name..."
                        autoComplete="off"
                    />
                    {isEmployeeDropdownOpen && (
                        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-md shadow-lg max-h-48 overflow-y-auto">
                            {filteredUsers.length > 0 ? (
                                filteredUsers.map(u => (
                                    <div
                                        key={u.id}
                                        onClick={() => handleSelectEmployee(u)}
                                        className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                                    >
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">{u.name}</p>
                                        <p className="text-xs text-gray-500">{u.position}</p>
                                    </div>
                                ))
                            ) : (
                                <div className="px-4 py-2 text-sm text-gray-500">No employees found.</div>
                            )}
                        </div>
                    )}
                </div>

                <Textarea 
                    label="Condition / Notes" 
                    value={condition} 
                    onChange={(e) => setCondition(e.target.value)} 
                    rows={2} 
                />
            </div>
        </Modal>
    );
};

export default AssetAssignmentModal;
