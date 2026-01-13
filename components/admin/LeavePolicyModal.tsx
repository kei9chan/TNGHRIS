
import React, { useState, useEffect } from 'react';
import { LeavePolicy, AccrualTier } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';

interface LeavePolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  policy: LeavePolicy;
  onSave: (policy: LeavePolicy) => void;
  leaveTypeName?: string;
}

const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;

const LeavePolicyModal: React.FC<LeavePolicyModalProps> = ({ isOpen, onClose, policy, onSave, leaveTypeName }) => {
    const [current, setCurrent] = useState<LeavePolicy>(policy);

    useEffect(() => {
        if (isOpen) {
            // Ensure tiers array exists, populate with default if empty for existing policies
            const tiers = policy.tiers && policy.tiers.length > 0 
                ? policy.tiers 
                : [{ minYears: 0, maxYears: null, entitlement: policy.accrualRate }]; // Fallback for legacy data
            
            setCurrent({ ...policy, tiers });
        }
    }, [policy, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        
        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setCurrent(prev => ({...prev, [name]: checked}));
        } else {
             setCurrent(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value }));
        }
    };

    const handleTierChange = (index: number, field: keyof AccrualTier, value: string) => {
        const newTiers = [...(current.tiers || [])];
        // Handle nullable maxYears
        let parsedValue: number | null = parseFloat(value);
        if (field === 'maxYears' && value === '') parsedValue = null;
        
        // @ts-ignore
        newTiers[index][field] = isNaN(parsedValue) && field !== 'maxYears' ? 0 : parsedValue;
        setCurrent(prev => ({ ...prev, tiers: newTiers }));
    };

    const handleAddTier = () => {
        const newTier: AccrualTier = { minYears: 0, maxYears: null, entitlement: 0 };
        setCurrent(prev => ({ ...prev, tiers: [...(prev.tiers || []), newTier] }));
    };

    const handleRemoveTier = (index: number) => {
        const newTiers = current.tiers.filter((_, i) => i !== index);
        setCurrent(prev => ({ ...prev, tiers: newTiers }));
    };

    const handleSave = () => {
        if (!current.tiers || current.tiers.length === 0) {
            alert("At least one accrual tier is required.");
            return;
        }
        onSave(current);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Edit Leave Policy${leaveTypeName ? ` — ${leaveTypeName}` : ''}`}
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Save Changes</Button>
                </div>
            }
            size="lg"
        >
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Accrual Rule</label>
                        <select name="accrualRule" value={current.accrualRule} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="none">None</option>
                            <option value="monthly">Monthly</option>
                            <option value="annually">Annually</option>
                        </select>
                    </div>
                    <Input label="Carry-Over Cap (days)" name="carryOverCap" type="number" value={current.carryOverCap} onChange={handleChange} />
                </div>

                <div className="border-t border-b py-4 dark:border-gray-600">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="font-medium text-gray-900 dark:text-white">Tenure-Based Entitlements (Days per Year)</h4>
                        <Button variant="secondary" size="sm" onClick={handleAddTier}>+ Add Tier</Button>
                    </div>
                    <div className="space-y-2">
                        {current.tiers.map((tier, index) => (
                            <div key={index} className="flex items-center space-x-2 bg-gray-50 dark:bg-slate-700 p-2 rounded-md">
                                <div className="flex-grow grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="block text-xs text-gray-500 dark:text-gray-400">Min Years</label>
                                        <input 
                                            type="number" 
                                            value={tier.minYears} 
                                            onChange={(e) => handleTierChange(index, 'minYears', e.target.value)}
                                            className="w-full p-1 text-sm border rounded dark:bg-gray-600 dark:border-gray-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 dark:text-gray-400">Max Years (Empty for ∞)</label>
                                        <input 
                                            type="number" 
                                            value={tier.maxYears === null ? '' : tier.maxYears} 
                                            onChange={(e) => handleTierChange(index, 'maxYears', e.target.value)}
                                            placeholder="∞"
                                            className="w-full p-1 text-sm border rounded dark:bg-gray-600 dark:border-gray-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 dark:text-gray-400">Entitlement (Days)</label>
                                        <input 
                                            type="number" 
                                            value={tier.entitlement} 
                                            onChange={(e) => handleTierChange(index, 'entitlement', e.target.value)}
                                            className="w-full p-1 text-sm border rounded dark:bg-gray-600 dark:border-gray-500"
                                        />
                                    </div>
                                </div>
                                <button 
                                    onClick={() => handleRemoveTier(index)}
                                    className="text-red-500 hover:text-red-700 p-1"
                                    title="Remove Tier"
                                >
                                    <TrashIcon />
                                </button>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        * Define ranges based on completed years of service. Leave "Max Years" empty for the highest tier.
                        <br/>For a flat rate, use Min: 0, Max: Empty.
                    </p>
                </div>

                <div className="flex items-center">
                    <input id="allowNegative" name="allowNegative" type="checkbox" checked={current.allowNegative} onChange={handleChange} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" />
                    <label htmlFor="allowNegative" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                        Allow Negative Balance
                    </label>
                </div>
            </div>
        </Modal>
    );
};

export default LeavePolicyModal;
