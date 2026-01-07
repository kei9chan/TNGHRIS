import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Asset, AssetStatus, User } from '../../types';
import { mockUsers, mockBusinessUnits } from '../../services/mockData';
import { supabase } from '../../services/supabaseClient';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';

interface AssetModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (assetData: Partial<Asset>, employeeIdToAssign?: string) => void;
    asset: Asset | null;
}

const AssetModal: React.FC<AssetModalProps> = ({ isOpen, onClose, onSave, asset }) => {
    const [current, setCurrent] = useState<Partial<Asset>>({});
    const [employeeToAssign, setEmployeeToAssign] = useState<string>('');
    const [employees, setEmployees] = useState<User[]>([]);
    const [employeeSearch, setEmployeeSearch] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const searchWrapperRef = useRef<HTMLDivElement>(null);

    const isEditing = !!asset;
    const isAvailable = isEditing ? asset?.status === AssetStatus.Available : true;

    useEffect(() => {
        if (isOpen) {
            setCurrent(asset || {
                type: 'Laptop',
                status: AssetStatus.Available,
                purchaseDate: new Date(),
                businessUnitId: mockBusinessUnits[0]?.id || '',
            });
            setEmployeeToAssign('');
            setEmployeeSearch('');

            const loadEmployees = async () => {
                try {
                    const { data, error } = await supabase
                        .from('hris_users')
                        .select('id, full_name, role, status');
                    if (error) throw error;
                    const mapped =
                        data?.map((u: any) => ({
                            id: u.id,
                            name: u.full_name,
                            email: '',
                            role: u.role,
                            status: u.status,
                        })) || [];
                    setEmployees(mapped);
                } catch (err) {
                    console.error('Failed to load employees for asset modal', err);
                    setEmployees(mockUsers);
                }
            };
            loadEmployees();
        }
    }, [asset, isOpen]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
          if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target as Node)) {
            setIsDropdownOpen(false);
            const selectedUser = assignableUsers.find(u => u.id === employeeToAssign);
            if (employeeSearch !== selectedUser?.name) {
                handleSelectEmployee(null);
            }
          }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
          document.removeEventListener("mousedown", handleClickOutside);
        };
      }, [employeeToAssign, employeeSearch]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        setCurrent(prev => ({
            ...prev,
            [name]: type === 'number' ? parseFloat(value) || 0 : type === 'date' ? new Date(value) : value
        }));
    };

    const handleSave = () => {
        if (!current.assetTag?.trim() || !current.name?.trim()) {
            alert('Asset Tag and Name are required.');
            return;
        }
        onSave(current, isAvailable ? employeeToAssign : undefined);
    };

    const assignableUsers = useMemo(() => {
        return (employees.length ? employees : mockUsers).filter(u => (u as any).status === 'Active');
    }, [employees]);

    const filteredUsers = useMemo(() => {
        if (!employeeSearch) return [];
        const lowerSearch = employeeSearch.toLowerCase();
        return assignableUsers.filter(user => user.name.toLowerCase().includes(lowerSearch) && user.id !== employeeToAssign);
    }, [employeeSearch, assignableUsers, employeeToAssign]);

    const handleSelectEmployee = (user: User | null) => {
        setEmployeeToAssign(user ? user.id : '');
        setEmployeeSearch(user ? user.name : '');
        setIsDropdownOpen(false);
    };

    const footer = (
        <div className="flex justify-end w-full space-x-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>{isEditing ? 'Save Changes' : 'Create Asset'}</Button>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditing ? 'Edit Asset' : 'Add New Asset'}
            footer={footer}
        >
            <div className="space-y-4">
                <Input label="Asset Tag" name="assetTag" value={current.assetTag || ''} onChange={handleChange} required />
                <Input label="Asset Name" name="name" value={current.name || ''} onChange={handleChange} required />
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                    <select name="businessUnitId" value={current.businessUnitId || ''} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 border-gray-300 dark:bg-slate-700 dark:border-slate-600 rounded-md">
                        {mockBusinessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                    </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
                        <select name="type" value={current.type || ''} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 border-gray-300 dark:bg-slate-700 dark:border-slate-600 rounded-md">
                            <option>Laptop</option>
                            <option>Mobile Phone</option>
                            <option>Monitor</option>
                            <option>Software License</option>
                            <option>Other</option>
                        </select>
                    </div>
                    <Input label="Serial Number" name="serialNumber" value={current.serialNumber || ''} onChange={handleChange} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <Input label="Purchase Date" name="purchaseDate" type="date" value={current.purchaseDate ? new Date(current.purchaseDate).toISOString().split('T')[0] : ''} onChange={handleChange} required />
                     <Input label="Value" name="value" type="number" value={current.value || ''} onChange={handleChange} />
                </div>
                <Textarea label="Notes" name="notes" value={current.notes || ''} onChange={handleChange} rows={3} />
                
                {isAvailable && (
                    <div className="pt-4 border-t dark:border-gray-600">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Assign Asset</h3>
                        <p className="text-sm text-gray-500 mb-2">This asset is available. Select an employee to assign it to.</p>
                         <div className="relative" ref={searchWrapperRef}>
                            <Input
                                label="Employee"
                                id="employee-search"
                                value={employeeSearch}
                                onChange={(e) => {
                                    setEmployeeSearch(e.target.value);
                                    if (e.target.value === '') { handleSelectEmployee(null); }
                                    if (!isDropdownOpen) setIsDropdownOpen(true);
                                }}
                                onFocus={() => setIsDropdownOpen(true)}
                                autoComplete="off"
                                placeholder="Search by name..."
                            />
                            {isDropdownOpen && filteredUsers.length > 0 && (
                                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-md shadow-lg max-h-48 overflow-y-auto">
                                    <div onClick={() => handleSelectEmployee(null)} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-gray-500 italic">
                                        -- Do not assign --
                                    </div>
                                    {filteredUsers.map(u => (
                                        <div key={u.id} onClick={() => handleSelectEmployee(u)} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                                            <p className="text-sm font-medium">{u.name}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default AssetModal;
