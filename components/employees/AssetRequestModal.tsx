import React, { useEffect, useState } from 'react';
import { AssetRequest } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';

interface AssetRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (request: Partial<AssetRequest>) => void | Promise<void>;
}

const assetChoices = [
    { label: 'Laptop', detail: 'Computer for work' },
    { label: 'Mobile Phone', detail: 'Company phone or device' },
    { label: 'Monitor', detail: 'Additional display' },
    { label: 'Headset', detail: 'Calls and meetings' },
    { label: 'Keyboard & Mouse', detail: 'Work accessories' },
    { label: 'Software License', detail: 'Required application' },
    { label: 'Other', detail: 'Something not listed' },
];

const AssetRequestModal: React.FC<AssetRequestModalProps> = ({ isOpen, onClose, onSave }) => {
    const [selectedAsset, setSelectedAsset] = useState('');
    const [customAsset, setCustomAsset] = useState('');
    const [justification, setJustification] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setSelectedAsset('');
        setCustomAsset('');
        setJustification('');
        setIsSaving(false);
    }, [isOpen]);

    const assetDescription = selectedAsset === 'Other' ? customAsset.trim() : selectedAsset;
    const canSubmit = Boolean(assetDescription && justification.trim() && !isSaving);

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setIsSaving(true);
        try {
            await onSave({
                requestType: 'Request',
                assetDescription,
                justification: justification.trim(),
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Request an Asset"
            size="2xl"
            footer={
                <div className="flex justify-end gap-3">
                    <Button variant="secondary" onClick={onClose} disabled={isSaving}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit} isLoading={isSaving}>Submit Request</Button>
                </div>
            }
        >
            <div className="space-y-6">
                <div>
                    <h4 className="text-base font-semibold text-gray-900 dark:text-white">What do you need?</h4>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Choose an asset or select Other to describe it.</p>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {assetChoices.map(choice => {
                            const selected = selectedAsset === choice.label;
                            return (
                                <button
                                    key={choice.label}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => setSelectedAsset(choice.label)}
                                    className={`rounded-lg border p-4 text-left transition-colors ${selected
                                        ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200 dark:border-indigo-400 dark:bg-indigo-950/40 dark:ring-indigo-900'
                                        : 'border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-600 dark:bg-slate-700/60 dark:hover:border-indigo-400'
                                    }`}
                                >
                                    <span className="block font-semibold text-gray-900 dark:text-white">{choice.label}</span>
                                    <span className="mt-1 block text-sm text-gray-500 dark:text-gray-300">{choice.detail}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {selectedAsset === 'Other' && (
                    <div>
                        <label htmlFor="custom-asset" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Asset name</label>
                        <input
                            id="custom-asset"
                            value={customAsset}
                            onChange={event => setCustomAsset(event.target.value)}
                            placeholder="e.g. Tablet, printer, or training software"
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                        />
                    </div>
                )}

                <Textarea
                    label="Why do you need it?"
                    value={justification}
                    onChange={event => setJustification(event.target.value)}
                    placeholder="Briefly explain the work need."
                    rows={4}
                    required
                />
            </div>
        </Modal>
    );
};

export default AssetRequestModal;
