import React, { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { mockEnvelopes, mockUsers } from '../../services/mockData';
import { Envelope, RoutingStep, RoutingStepStatus, EnvelopeStatus, EnvelopeEventType } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import EnvelopeTimeline from '../../components/contracts/EnvelopeTimeline';
import SignatureModal from '../../components/contracts/SignatureModal';
import PrintableContract from '../../components/contracts/PrintableContract';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import { logActivity } from '../../services/auditService';

const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;
const CheckCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>;
const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>;
const XCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>;
const DotsHorizontalIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor"><path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 10a2 2 0 100 4 2 2 0 000-4z" /></svg>;

const RecipientStatusIcon: React.FC<{status: RoutingStepStatus}> = ({status}) => {
    switch (status) {
        case RoutingStepStatus.Completed:
            return <CheckCircleIcon />;
        case RoutingStepStatus.Pending:
        case RoutingStepStatus.Viewed:
            return <ClockIcon />;
        case RoutingStepStatus.Declined:
            return <XCircleIcon />;
        default:
            return <DotsHorizontalIcon />;
    }
};


const EnvelopeDetail: React.FC = () => {
    const { envelopeId } = useParams<{ envelopeId: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [envelope, setEnvelope] = useState<Envelope | null>(() => mockEnvelopes.find(e => e.id === envelopeId) || null);
    const [isSigningModalOpen, setIsSigningModalOpen] = useState(false);
    const [envelopeToPrint, setEnvelopeToPrint] = useState<Envelope | null>(null);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [emailRecipient, setEmailRecipient] = useState('');

    const currentUserRecipient = useMemo(() => {
        if (!user || !envelope) return null;
        return envelope.routingSteps.find(r => r.userId === user.id);
    }, [user, envelope]);

    const isMyTurnToSign = useMemo(() => {
        if (!currentUserRecipient || currentUserRecipient.status !== RoutingStepStatus.Pending) {
            return false;
        }
        const firstPending = envelope?.routingSteps.find(r => r.status === RoutingStepStatus.Pending);
        return firstPending?.userId === user?.id;
    }, [currentUserRecipient, envelope, user]);
    
    const processedContent = useMemo(() => {
        if (!envelope?.contentSnapshot) return { body: '', sections: [] };

        const { contentSnapshot, employeeName, employeeId } = envelope;
        const employee = mockUsers.find(u => u.id === employeeId);
        
        const replacePlaceholders = (text: string) => {
            let processed = text.replace(/{{employee_name}}/g, employeeName);
            processed = processed.replace(/{{position}}/g, employee?.position || 'N/A');
            processed = processed.replace(/{{start_date}}/g, employee?.dateHired ? new Date(employee.dateHired).toLocaleDateString() : 'N/A');
            processed = processed.replace(/{{today}}/g, new Date().toLocaleDateString());
            processed = processed.replace(/{{rate}}/g, employee?.monthlySalary?.toLocaleString() || 'N/A');
            return processed;
        };

        return {
            body: replacePlaceholders(contentSnapshot.body || ''),
            sections: contentSnapshot.sections?.map(section => ({
                ...section,
                body: replacePlaceholders(section.body)
            })) || []
        };
    }, [envelope]);


    if (!envelope) {
        return <div>Envelope not found.</div>;
    }
    
    const handleSign = (signatureDataUrl: string) => {
        if (!user || !currentUserRecipient) return;

        const envelopeIndex = mockEnvelopes.findIndex(e => e.id === envelope.id);
        if (envelopeIndex === -1) return;

        const updatedEnvelope = { ...mockEnvelopes[envelopeIndex] };
        
        updatedEnvelope.routingSteps = updatedEnvelope.routingSteps.map(r => r.userId === user.id ? { ...r, status: RoutingStepStatus.Completed, action: 'Signed', timestamp: new Date(), signatureDataUrl } : r);

        updatedEnvelope.events.push({
            timestamp: new Date(),
            type: EnvelopeEventType.Signed,
            userName: user.name,
        });

        const allSigned = updatedEnvelope.routingSteps.every(r => r.role !== 'Signer' || r.status === RoutingStepStatus.Completed);
        if (allSigned) {
            updatedEnvelope.status = EnvelopeStatus.Completed;
            updatedEnvelope.events.push({
                timestamp: new Date(),
                type: EnvelopeEventType.Completed,
                userName: 'System',
            });
        }
        
        mockEnvelopes[envelopeIndex] = updatedEnvelope;
        setEnvelope(updatedEnvelope);
        setIsSigningModalOpen(false);
    };

    const handleOpenEmailModal = () => {
        if (!envelope) return;
        const employee = mockUsers.find(u => u.id === envelope.employeeId);
        setEmailRecipient(employee?.email || user?.email || '');
        setIsEmailModalOpen(true);
    };

    const handleSendEmail = () => {
        if (!emailRecipient.includes('@')) {
          alert('Please enter a valid email address.');
          return;
        }
        alert(`(Simulation) Contract PDF has been sent to ${emailRecipient}.`);
        if (user && envelope) {
            logActivity(user, 'EXPORT', 'Envelope', envelope.id, `Emailed contract PDF to ${emailRecipient}.`);
        }
        setIsEmailModalOpen(false);
    };

    return (
        <div className="space-y-6">
             <div>
                <Link to="/employees/contracts" className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-2">
                    <ArrowLeftIcon />
                    Back to All Documents
                </Link>
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{envelope.title}</h1>
                        <p className="text-gray-500 dark:text-gray-400">Status: {envelope.status} - Due by: {new Date(envelope.dueDate).toLocaleDateString()}</p>
                    </div>
                    <div className="flex space-x-2">
                        <Button variant="secondary" onClick={handleOpenEmailModal}>Send Email</Button>
                        <Button variant="secondary" onClick={() => setEnvelopeToPrint(envelope)}>Download PDF</Button>
                    </div>
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                     <Card title="Document Viewer">
                        <div className="bg-white dark:bg-gray-900 p-8 rounded-md shadow-inner overflow-y-auto h-[70vh] prose dark:prose-invert max-w-none">
                            <div dangerouslySetInnerHTML={{ __html: processedContent.body }} />
                            {processedContent.sections.map(section => (
                                <div key={section.id}>
                                    <h2 className="text-xl font-bold mt-6 mb-2">{section.title}</h2>
                                    <div dangerouslySetInnerHTML={{ __html: section.body }} />
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>

                <div className="space-y-6">
                     <Card title="Signers & Routing">
                        <ul className="space-y-4">
                            {envelope.routingSteps.map(recipient => (
                                <li key={recipient.userId} className="flex items-center space-x-3">
                                    <RecipientStatusIcon status={recipient.status} />
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">{recipient.name}</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">{recipient.role} - {recipient.status}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </Card>
                    <Card title="Timeline & Audit Trail">
                        <EnvelopeTimeline events={envelope.events} />
                    </Card>

                    {isMyTurnToSign && (
                         <Button onClick={() => setIsSigningModalOpen(true)} size="lg" className="w-full">Review & Sign</Button>
                    )}
                </div>
            </div>

            {currentUserRecipient && (
                <SignatureModal 
                    isOpen={isSigningModalOpen}
                    onClose={() => setIsSigningModalOpen(false)}
                    onSign={handleSign}
                    recipient={currentUserRecipient}
                    envelopeTitle={envelope.title}
                />
            )}
            
            {envelopeToPrint && createPortal(
              <PrintableContract envelope={envelopeToPrint} onClose={() => setEnvelopeToPrint(null)} />,
              document.body
            )}

            {isEmailModalOpen && (
                <Modal
                    isOpen={isEmailModalOpen}
                    onClose={() => setIsEmailModalOpen(false)}
                    title="Email Document as PDF"
                    footer={
                        <div className="flex justify-end w-full space-x-2">
                            <Button variant="secondary" onClick={() => setIsEmailModalOpen(false)}>Cancel</Button>
                            <Button onClick={handleSendEmail}>Send Email</Button>
                        </div>
                    }
                >
                    <Input
                        label="Recipient Email Address"
                        type="email"
                        value={emailRecipient}
                        onChange={(e) => setEmailRecipient(e.target.value)}
                        required
                    />
                </Modal>
            )}
        </div>
    );
};

export default EnvelopeDetail;
