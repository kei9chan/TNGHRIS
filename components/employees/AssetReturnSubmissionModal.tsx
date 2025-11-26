
import React, { useState } from 'react';
import { EnrichedAssetRequest } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import Input from '../ui/Input';
import FileUploader from '../ui/FileUploader';

interface AssetReturnSubmissionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (notes: string, proofUrl: string) => void;
    request: EnrichedAssetRequest;
}

const AssetReturnSubmissionModal: React.FC<AssetReturnSubmissionModalProps> = ({ isOpen, onClose, onSave, request }) => {
    const [notes, setNotes] = useState('');
    const [link, setLink] = useState('');
    const [file, setFile] = useState<File | null>(null);

    const handleSave = () => {
        // In a real app, we'd upload the file and get a URL. For mock, we'll just use the file name or the link.
        const proofUrl = file ? `file://${file.name}` : link;
        if (!proofUrl) {
            alert('Please provide proof of return by uploading a file or submitting a link.');
            return;
        }
        onSave(notes, proofUrl);
    };

    const footer = (
        <div className="flex justify-end w-full">
            <Button onClick={handleSave}>Submit Return</Button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Submit Return for ${request.assetTag}`} footer={footer}>
            <div className="space-y-4">
                <p>You are submitting the return for <span className="font-semibold">{request.assetName}</span>. Please provide proof of return.</p>
                <FileUploader onFileUpload={setFile} maxSize={2 * 1024 * 1024} />
                <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-300 dark:border-gray-600" /></div>
                    <div className="relative flex justify-center"><span className="bg-white dark:bg-slate-800 px-2 text-sm text-gray-500">OR</span></div>
                </div>
                <Input label="Submit Link for Proof" id="proof-link" value={link} onChange={e => setLink(e.target.value)} placeholder="e.g., tracking link, image URL" />
                <Textarea label="Notes (Optional)" id="return-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="e.g., Dropped off at IT desk with John Doe." />
            </div>
        </Modal>
    );
};

export default AssetReturnSubmissionModal;
