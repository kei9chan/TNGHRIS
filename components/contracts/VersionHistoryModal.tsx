import React from 'react';
import { ContractTemplate } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { mockUsers } from '../../services/mockData';

interface VersionHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    template: ContractTemplate;
    onRestore: (templateId: string, version: number) => void;
}

const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({ isOpen, onClose, template, onRestore }) => {
    
    const getUserName = (id: string) => mockUsers.find(u => u.id === id)?.name || 'N/A';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Version History for: ${template.title}`}
            footer={<div className="flex justify-end w-full"><Button variant="secondary" onClick={onClose}>Close</Button></div>}
        >
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {/* FIX: Handle optional 'versions' property by providing a fallback to an empty array. */}
                {(template.versions || []).sort((a,b) => b.version - a.version).map(version => (
                    <li key={version.id} className="py-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="text-lg font-bold">Version {version.version} {version.version === template.activeVersion && <span className="text-sm font-normal text-green-500">(Active)</span>}</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Created on {new Date(version.createdAt).toLocaleDateString()} by {getUserName(version.createdByUserId)}</p>
                                <p className="mt-2 text-gray-700 dark:text-gray-300">Notes: <span className="italic">"{version.notes}"</span></p>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">File: {version.fileName}</p>
                            </div>
                            {version.version !== template.activeVersion && (
                                <Button size="sm" onClick={() => onRestore(template.id, version.version)}>Restore</Button>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </Modal>
    );
};

export default VersionHistoryModal;