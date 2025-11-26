
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Award, User, EmployeeAward } from '../../types';
import { mockAwards, mockUsers, mockBusinessUnits } from '../../services/mockData';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import EmployeeMultiSelect from '../feedback/EmployeeMultiSelect';
import CertificateRenderer from './CertificateRenderer';
import html2canvas from 'html2canvas';

interface AssignAwardModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAssign: (employeeId: string, awardId: string, notes: string, businessUnitId: string, approvers: User[], certificateUrl: string) => void;
}

const AssignAwardModal: React.FC<AssignAwardModalProps> = ({ isOpen, onClose, onAssign }) => {
    const [step, setStep] = useState<'details' | 'preview'>('details');
    const [employeeId, setEmployeeId] = useState('');
    const [awardId, setAwardId] = useState('');
    const [notes, setNotes] = useState('');
    const [businessUnitId, setBusinessUnitId] = useState('');
    const [selectedApprovers, setSelectedApprovers] = useState<User[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);

    // Ref for the certificate container to capture
    const certificateRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setStep('details');
            const firstEmployee = mockUsers.find(u => u.status === 'Active');
            setEmployeeId(firstEmployee?.id || '');
            setAwardId(mockAwards.find(a => a.isActive)?.id || '');
            
            const bu = mockBusinessUnits.find(b => b.name === firstEmployee?.businessUnit);
            setBusinessUnitId(bu?.id || '');
            
            setNotes('');
            setSelectedApprovers([]);
        }
    }, [isOpen]);

    // Update BU when employee changes
    useEffect(() => {
        if (employeeId) {
            const employee = mockUsers.find(u => u.id === employeeId);
            const bu = mockBusinessUnits.find(b => b.name === employee?.businessUnit);
            if (bu) {
                setBusinessUnitId(bu.id);
            }
        }
    }, [employeeId]);

    const selectedEmployee = useMemo(() => mockUsers.find(u => u.id === employeeId), [employeeId]);
    const selectedAward = useMemo(() => mockAwards.find(a => a.id === awardId), [awardId]);

    const handleNext = () => {
        if (!employeeId || !awardId || !businessUnitId || selectedApprovers.length === 0) {
            alert("Please select an employee, award, business unit, and at least one approver.");
            return;
        }
        setStep('preview');
    };

    const handleGrant = async () => {
        if (!certificateRef.current) return;

        setIsGenerating(true);
        try {
            // Capture the certificate
            // We select the specific element ID rendered by CertificateRenderer
            const element = certificateRef.current.querySelector('#certificate-container') as HTMLElement;
            
            if (element) {
                const canvas = await html2canvas(element, {
                    scale: 2, // Higher quality
                    useCORS: true, // Needed if images are external
                    backgroundColor: null,
                });
                const certificateUrl = canvas.toDataURL('image/png');
                
                onAssign(employeeId, awardId, notes, businessUnitId, selectedApprovers, certificateUrl);
            } else {
                console.error("Certificate element not found");
            }
        } catch (error) {
            console.error("Failed to generate certificate image", error);
            alert("Failed to generate certificate image. Please try again.");
        } finally {
            setIsGenerating(false);
        }
    };

    const renderDetailsStep = () => (
        <div className="space-y-4">
            <div>
                <label htmlFor="employeeId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Employee</label>
                <select 
                    id="employeeId" 
                    value={employeeId} 
                    onChange={e => setEmployeeId(e.target.value)} 
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                    {mockUsers.filter(u => u.status === 'Active').map(user => (
                        <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                </select>
            </div>
            <div>
                <label htmlFor="businessUnitId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                <select 
                    id="businessUnitId" 
                    value={businessUnitId} 
                    onChange={e => setBusinessUnitId(e.target.value)} 
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                    {mockBusinessUnits.map(bu => (
                        <option key={bu.id} value={bu.id}>{bu.name}</option>
                    ))}
                </select>
            </div>
            <div>
                <label htmlFor="awardId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Award Template</label>
                <select 
                    id="awardId" 
                    value={awardId} 
                    onChange={e => setAwardId(e.target.value)} 
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                    {mockAwards.filter(a => a.isActive).map(award => (
                        <option key={award.id} value={award.id}>{award.title}</option>
                    ))}
                </select>
            </div>
            <Textarea 
                label="Notes / Reason for Award" 
                value={notes} 
                onChange={e => setNotes(e.target.value)} 
                rows={3} 
                placeholder="e.g., For demonstrating exceptional leadership during the project..."
            />
            <EmployeeMultiSelect 
                label="Request Approval From"
                allUsers={mockUsers.filter(u => u.role !== 'Employee')}
                selectedUsers={selectedApprovers}
                onSelectionChange={setSelectedApprovers}
            />
        </div>
    );

    const renderPreviewStep = () => (
        <div className="flex flex-col items-center space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 text-center">
                Review the certificate below. This image will be generated and emailed to the employee upon approval.
            </p>
            
            {/* Certificate Preview Container */}
            <div 
                className="border shadow-lg overflow-hidden bg-gray-100 dark:bg-gray-900 flex justify-center items-center p-2"
                style={{ maxWidth: '100%', overflowX: 'auto' }}
            >
                <div ref={certificateRef}>
                    {selectedAward?.design && selectedEmployee && (
                        <CertificateRenderer 
                            design={selectedAward.design}
                            data={{
                                employeeName: selectedEmployee.name,
                                date: new Date(),
                                awardTitle: selectedAward.title,
                                citation: notes
                            }}
                            scale={0.6} // Scale down for preview visibility
                        />
                    )}
                </div>
            </div>
        </div>
    );

    const renderFooter = () => (
        <div className="flex justify-between w-full">
            {step === 'preview' ? (
                <Button variant="secondary" onClick={() => setStep('details')}>Back</Button>
            ) : (
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
            )}
            
            {step === 'details' ? (
                <Button onClick={handleNext}>Preview Certificate</Button>
            ) : (
                <Button onClick={handleGrant} isLoading={isGenerating}>Grant Award & Send Email</Button>
            )}
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={step === 'details' ? "Assign an Award" : "Preview Certificate"}
            size={step === 'preview' ? '4xl' : 'lg'}
            footer={renderFooter()}
        >
            {step === 'details' ? renderDetailsStep() : renderPreviewStep()}
        </Modal>
    );
};

export default AssignAwardModal;
