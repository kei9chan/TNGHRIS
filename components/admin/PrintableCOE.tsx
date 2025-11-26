
import React, { useState, useMemo } from 'react';
import { COETemplate, COERequest, User } from '../../types';
import { useSettings } from '../../context/SettingsContext';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import { useAuth } from '../../hooks/useAuth';
import { logActivity } from '../../services/auditService';

interface PrintableCOEProps {
    template: COETemplate;
    request: COERequest;
    employee: User;
    onClose: () => void;
}

const PrintableCOE: React.FC<PrintableCOEProps> = ({ template, request, employee, onClose }) => {
    const { settings } = useSettings();
    const { user } = useAuth();
    
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [emailRecipient, setEmailRecipient] = useState(employee.email);

    const processedBody = useMemo(() => {
        let text = template.body;
        
        const replacements: Record<string, string> = {
            '{{employee_name}}': employee.name,
            '{{position}}': employee.position,
            '{{date_hired}}': new Date(employee.dateHired).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            '{{salary}}': `${settings.currency} ${(employee.monthlySalary || 0).toLocaleString()}`,
            '{{purpose}}': request.purpose === 'OTHERS' ? (request.otherPurposeDetail || 'personal matters') : request.purpose.replace(/_/g, ' ').toLowerCase(),
            '{{date_today}}': new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        };

        Object.entries(replacements).forEach(([key, value]) => {
            // Use a regex with 'g' flag to replace all occurrences
            text = text.replace(new RegExp(key, 'g'), value);
        });

        return text;
    }, [template, employee, request, settings]);

    const handlePrint = () => {
        window.print();
    };

    const handleSendEmail = () => {
         alert(`(Simulation) Certificate successfully emailed to ${emailRecipient}`);
         if (user) {
             logActivity(user, 'EXPORT', 'COE', request.id, `Emailed COE to ${emailRecipient}`);
         }
         setIsEmailModalOpen(false);
    };

    return (
        <div className="print-overlay">
            <style>
                {`
                @media screen {
                    .print-overlay { 
                        position: fixed; 
                        top: 0; 
                        left: 0; 
                        width: 100%; 
                        height: 100%; 
                        background-color: #323639; /* Dark background like PDF viewers */
                        z-index: 2000; 
                        display: flex; 
                        flex-direction: column; 
                    }
                    .print-toolbar { 
                        flex-shrink: 0; 
                        background: white; 
                        padding: 1rem 1.5rem; 
                        display: flex; 
                        justify-content: space-between; 
                        align-items: center; 
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1); 
                        z-index: 2010; 
                    }
                    .print-scroll-container { 
                        flex-grow: 1; 
                        overflow-y: auto; 
                        display: flex; 
                        justify-content: center; 
                        padding: 2rem; 
                    }
                    .print-content-wrapper { 
                        background-color: white; 
                        width: 210mm; 
                        min-height: 297mm; 
                        box-shadow: 0 0 15px rgba(0,0,0,0.5); 
                    }
                }
                @media print {
                    @page { size: A4; margin: 20mm; }
                    body > *:not(.print-overlay) { display: none !important; }
                    .print-overlay { position: absolute; top: 0; left: 0; width: 100%; height: auto; }
                    .print-toolbar, .no-print { display: none !important; }
                    .print-scroll-container { display: block; padding: 0; margin: 0; }
                    .print-content-wrapper { box-shadow: none; width: 100%; min-height: auto; }
                }
                .print-content { font-family: 'Times New Roman', serif; font-size: 12pt; color: black; line-height: 1.6; }
                .print-content h1 { font-size: 16pt; font-weight: bold; text-align: center; text-transform: uppercase; margin-bottom: 2rem; }
                `}
            </style>

            {/* Toolbar */}
            <div className="print-toolbar no-print">
                <div>
                    <h3 className="font-semibold text-gray-800">Certificate Preview</h3>
                    <p className="text-xs text-gray-500">Request ID: {request.id}</p>
                </div>
                <div className="flex space-x-3">
                     <Button variant="secondary" onClick={() => setIsEmailModalOpen(true)}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 00-2-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        Email
                     </Button>
                     <Button variant="secondary" onClick={handlePrint}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        Print / Save PDF
                     </Button>
                     <Button variant="danger" onClick={onClose}>Close</Button>
                </div>
            </div>

            {/* Document View */}
            <div className="print-scroll-container">
                <div className="print-content-wrapper">
                    <div className="print-content p-12 relative h-full">
                        {/* Header / Logo */}
                        <div className="text-center mb-8">
                            {template.logoUrl && (
                                <img src={template.logoUrl} alt="Logo" className="h-24 mx-auto mb-4 object-contain" />
                            )}
                            {template.address && (
                                <p className="text-xs text-gray-500">{template.address}</p>
                            )}
                        </div>

                        <h1 className="text-center font-bold text-xl mb-8 uppercase">Certificate of Employment</h1>

                        <div className="mb-8 text-justify" dangerouslySetInnerHTML={{ __html: processedBody }} />

                        <div className="mt-16">
                            <p>Sincerely,</p>
                            <div className="mt-12">
                                <p className="font-bold uppercase">{template.signatoryName}</p>
                                <p>{template.signatoryPosition}</p>
                            </div>
                        </div>
                        
                        <div className="absolute bottom-12 left-12 right-12 text-center text-xs text-gray-400 border-t pt-2">
                            Generated by TNG HRIS on {new Date().toLocaleString()} | Request ID: {request.id}
                        </div>
                    </div>
                </div>
            </div>

             <Modal
                isOpen={isEmailModalOpen}
                onClose={() => setIsEmailModalOpen(false)}
                title="Email Certificate"
                footer={
                    <div className="flex justify-end w-full space-x-2">
                        <Button variant="secondary" onClick={() => setIsEmailModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSendEmail}>Send Email</Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        The Certificate of Employment PDF will be sent to the email address below.
                    </p>
                    <Input 
                        label="Recipient Email Address" 
                        type="email" 
                        value={emailRecipient} 
                        onChange={e => setEmailRecipient(e.target.value)} 
                        required
                    />
                </div>
            </Modal>
        </div>
    );
};

export default PrintableCOE;
