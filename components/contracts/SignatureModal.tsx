import React, { useState, useRef } from 'react';
import { RoutingStep } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import SignaturePad, { SignaturePadRef } from '../ui/SignaturePad';

interface SignatureModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSign: (signatureDataUrl: string) => void;
    recipient: RoutingStep;
    envelopeTitle: string;
}

const SignatureModal: React.FC<SignatureModalProps> = ({ isOpen, onClose, onSign, recipient, envelopeTitle }) => {
    const [typedName, setTypedName] = useState(recipient.name);
    const signaturePadRef = useRef<SignaturePadRef>(null);

    const handleSign = () => {
        if (signaturePadRef.current?.isEmpty() || !typedName) {
            alert('Please type your name and provide a signature.');
            return;
        }
        const signatureDataUrl = signaturePadRef.current.getSignatureDataUrl();
        if (signatureDataUrl) {
            onSign(signatureDataUrl);
        }
    };
    
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Sign Document"
            footer={
                <div className="flex justify-end w-full">
                    <Button onClick={handleSign}>Accept & Sign</Button>
                </div>
            }
        >
            <div className="space-y-4">
                <div className="p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">You are signing:</p>
                    <p className="font-semibold text-lg text-gray-900 dark:text-white">{envelopeTitle}</p>
                </div>
                <Input 
                    label="Full Name"
                    id="signer-name"
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    required
                />
                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Digital Signature</label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Type your name or draw your signature below.</p>
                    <SignaturePad ref={signaturePadRef} />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    By clicking "Accept & Sign", you agree that your electronic signature is the legal equivalent of your manual signature on this agreement.
                </p>
            </div>
        </Modal>
    );
};

export default SignatureModal;