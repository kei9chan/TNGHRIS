
import React, { useState, useRef } from 'react';
import { Asset, AssetAssignment } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import SignaturePad, { SignaturePadRef } from '../ui/SignaturePad';
import Input from '../ui/Input';
import html2canvas from 'html2canvas';

interface AssetAcceptanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    asset: Asset;
    assignment: AssetAssignment;
    onAccept: (assignmentId: string, signedDocumentUrl: string) => void;
}

const AssetAcceptanceModal: React.FC<AssetAcceptanceModalProps> = ({ isOpen, onClose, asset, assignment, onAccept }) => {
    const signaturePadRef = useRef<SignaturePadRef>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [typedName, setTypedName] = useState('');
    const [isSignatureEmpty, setIsSignatureEmpty] = useState(true);
    const [isAcknowledged, setIsAcknowledged] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleAccept = async () => {
        if (!isAcknowledged) {
            alert('Please acknowledge the asset care policy.');
            return;
        }
        if (!typedName.trim()) {
            alert('Please enter your full name.');
            return;
        }
        
        setIsProcessing(true);

        try {
            if (contentRef.current) {
                 // Store original styles to restore later
                 const originalStyle = contentRef.current.getAttribute('style');
                 
                 // Apply temporary styles for optimal PDF/Image generation
                 // We enforce a fixed width to prevent text wrapping/cutoff that happens in responsive modals
                 contentRef.current.style.width = "800px"; 
                 contentRef.current.style.padding = "40px";
                 contentRef.current.style.backgroundColor = "#ffffff";
                 contentRef.current.style.color = "#000000";
                 contentRef.current.style.fontFamily = "Arial, sans-serif";
                 contentRef.current.style.fontSize = "12pt";
                 
                 // Use HTML2Canvas
                 const canvas = await html2canvas(contentRef.current, {
                     scale: 2, // Higher quality
                     backgroundColor: "#ffffff",
                     useCORS: true, // Ensure external images (logos) load if any
                     windowWidth: 1200 // Simulate desktop viewport
                 });
                 
                 // Restore original styles immediately
                 if (originalStyle) {
                    contentRef.current.setAttribute('style', originalStyle);
                 } else {
                    contentRef.current.removeAttribute('style');
                 }
                 
                 const signedDocumentUrl = canvas.toDataURL('image/png');
                 onAccept(assignment.id, signedDocumentUrl);
            } else {
                // Fallback if ref fails
                 onAccept(assignment.id, '');
            }
        } catch (error) {
            console.error("Failed to generate agreement document", error);
            alert("Error generating document. Please try again.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Accept Asset: ${asset.name}`}
            size="lg"
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose} disabled={isProcessing}>Cancel</Button>
                    <Button onClick={handleAccept} isLoading={isProcessing}>Accept & Sign</Button>
                </div>
            }
        >
            {/* 
                The div referenced by contentRef is what gets captured into the PDF.
                We use 'overflow-visible' to ensure nothing is clipped during capture.
            */}
            <div ref={contentRef} className="space-y-6 bg-white p-1 overflow-visible">
                
                <div className="text-center border-b pb-4 mb-4">
                    <h2 className="text-xl font-bold uppercase tracking-wide text-gray-900">Asset Accountability Agreement</h2>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                    <h4 className="font-bold text-blue-800 dark:text-blue-200 mb-3 border-b border-blue-200 pb-2">Asset Details</h4>
                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                        <div>
                            <span className="block text-xs text-gray-500 uppercase">Asset Name</span>
                            <span className="font-semibold text-gray-900 dark:text-white">{asset.name}</span>
                        </div>
                        <div>
                            <span className="block text-xs text-gray-500 uppercase">Asset Tag</span>
                            <span className="font-mono font-semibold text-gray-900 dark:text-white">{asset.assetTag}</span>
                        </div>
                        <div>
                            <span className="block text-xs text-gray-500 uppercase">Serial Number</span>
                            <span className="text-gray-900 dark:text-white">{asset.serialNumber || 'N/A'}</span>
                        </div>
                         <div>
                            <span className="block text-xs text-gray-500 uppercase">Date Acquired</span>
                            <span className="text-gray-900 dark:text-white">{new Date(assignment.dateAssigned).toLocaleDateString()}</span>
                        </div>
                        <div className="col-span-2 mt-2">
                            <span className="block text-xs text-gray-500 uppercase">Condition Details</span>
                            <span className="font-medium text-gray-900 dark:text-white bg-white dark:bg-gray-800 px-2 py-1 rounded border block mt-1">
                                {assignment.conditionOnAssign || 'Good / New'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="border-t dark:border-gray-700 pt-4">
                    <h4 className="font-bold mb-3 text-gray-900 dark:text-white">Terms & Conditions</h4>
                    <div className="text-sm text-gray-700 dark:text-gray-300 space-y-3 text-justify leading-relaxed">
                        <p>1. The employee acknowledges receipt of the above-described asset in the condition stated.</p>
                        <p>2. The employee agrees to use the asset primarily for company business purposes.</p>
                        <p>3. The employee agrees to exercise reasonable care of the asset and take all necessary precautions to prevent loss, damage, or theft.</p>
                        <p>4. In case of loss or damage due to negligence or misuse, the employee understands they may be held liable for repair or replacement costs in accordance with company policy.</p>
                        <p>5. The asset remains the property of the company and must be returned immediately upon termination of employment, or at any time upon request by the company.</p>
                    </div>
                    
                    <div className="mt-4 flex items-start p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                        <input 
                            type="checkbox" 
                            id="acknowledge-policy" 
                            className="mt-1 h-4 w-4 text-indigo-600 border-gray-300 rounded flex-shrink-0"
                            checked={isAcknowledged}
                            onChange={(e) => setIsAcknowledged(e.target.checked)}
                        />
                        <label htmlFor="acknowledge-policy" className="ml-3 text-sm text-gray-900 dark:text-gray-200 font-medium">
                            I have read, understood, and agree to the terms of this Asset Accountability Agreement.
                        </label>
                    </div>
                </div>

                <div className="border-t dark:border-gray-700 pt-6 mt-6">
                    <div className="grid grid-cols-1 gap-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Employee Full Name</label>
                            <Input 
                                label=""
                                id="full-name-input"
                                value={typedName}
                                onChange={(e) => setTypedName(e.target.value)}
                                placeholder="Type your full name"
                                className="font-bold"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Signature</label>
                            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-1">
                                <div className="relative">
                                    <SignaturePad
                                        ref={signaturePadRef}
                                        onEnd={() => setIsSignatureEmpty(signaturePadRef.current?.isEmpty() ?? true)}
                                    />
                                    {isSignatureEmpty && typedName.trim() && (
                                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl italic text-gray-600 dark:text-gray-300 font-['Brush_Script_MT',_cursive]">
                                            {typedName}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 mt-1 text-center">Sign above to confirm acceptance</p>
                        </div>
                    </div>
                </div>
                
                <div className="text-center pt-4 text-xs text-gray-400">
                    <p>Generated by TNG HRIS on {new Date().toLocaleString()}</p>
                </div>
            </div>
        </Modal>
    );
};

export default AssetAcceptanceModal;
