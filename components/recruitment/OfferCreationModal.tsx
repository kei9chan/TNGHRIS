import React, { useState, useEffect, useMemo } from 'react';
import { Offer, OfferStatus, ApplicationStage, JobRequisition } from '../../types';
// FIX: Added import for mockOffers to use in component logic.
import { mockApplications, mockCandidates, mockJobRequisitions, mockOffers } from '../../services/mockData';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
// FIX: Added import for Card component.
import Card from '../ui/Card';
import { useSettings } from '../../context/SettingsContext';

interface OfferCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    offer: Offer | null;
    onSave: (offer: Offer) => void;
}

interface Allowance {
    id: number;
    type: string;
    amount: number;
}

const OfferCreationModal: React.FC<OfferCreationModalProps> = ({ isOpen, onClose, offer, onSave }) => {
    const { settings } = useSettings();
    const [applicationId, setApplicationId] = useState('');
    const [basePay, setBasePay] = useState(0);
    const [startDate, setStartDate] = useState('');
    const [probationMonths, setProbationMonths] = useState(6);
    const [employmentType, setEmploymentType] = useState<'Full-Time' | 'Part-Time' | 'Contract'>('Full-Time');
    const [allowances, setAllowances] = useState<Allowance[]>([]);
    const [specialClauses, setSpecialClauses] = useState('');
    const [error, setError] = useState('');

    const applicantsInOfferStage = useMemo(() => {
        return mockApplications
            .filter(app => app.stage === ApplicationStage.Offer && !mockOffers.some(o => o.applicationId === app.id && o.status !== OfferStatus.Declined))
            .map(app => {
                const candidate = mockCandidates.find(c => c.id === app.candidateId);
                const job = mockJobRequisitions.find(j => j.id === app.requisitionId);
                return {
                    appId: app.id,
                    label: `${candidate?.firstName} ${candidate?.lastName} - ${job?.title}`
                }
            });
    }, []);
    
    const totalCompensation = useMemo(() => {
        const totalAllowances = allowances.reduce((sum, allowance) => sum + allowance.amount, 0);
        return basePay + totalAllowances;
    }, [basePay, allowances]);


    useEffect(() => {
        if (isOpen) {
            // Reset form
            setApplicationId('');
            setBasePay(0);
            setStartDate(new Date().toISOString().split('T')[0]);
            setProbationMonths(6);
            setEmploymentType('Full-Time');
            setAllowances([]);
            setSpecialClauses('');
            setError('');
        }
    }, [isOpen]);

    useEffect(() => {
        if (applicationId) {
            const application = mockApplications.find(a => a.id === applicationId);
            const requisition = mockJobRequisitions.find(r => r.id === application?.requisitionId);
            if (requisition) {
                setEmploymentType(requisition.employmentType);
                setBasePay(requisition.budgetedSalaryMin);
            }
        }
    }, [applicationId]);
    
    const handleAddAllowance = () => {
        setAllowances([...allowances, {id: Date.now(), type: '', amount: 0}]);
    }
    const handleRemoveAllowance = (id: number) => {
        setAllowances(allowances.filter(a => a.id !== id));
    }
    const handleAllowanceChange = (id: number, field: 'type' | 'amount', value: string) => {
        setAllowances(allowances.map(a => a.id === id ? {...a, [field]: field === 'amount' ? parseFloat(value) || 0 : value} : a));
    }

    const handleSave = (status: OfferStatus) => {
        if (!applicationId || basePay <= 0 || !startDate) {
            setError('Please select an applicant and fill in a valid Base Pay and Start Date.');
            return;
        }

        const allowanceObject = allowances.reduce((obj, item) => {
            if(item.type) obj[item.type.toLowerCase()] = item.amount;
            return obj;
        }, {} as Record<string, number>);

        const payload: Offer = {
            id: offer?.id || '', // Will be set in parent
            applicationId,
            basePay,
            startDate: new Date(startDate),
            probationMonths,
            employmentType,
            allowanceJSON: JSON.stringify(allowanceObject),
            specialClauses,
            status,
            offerNumber: offer?.offerNumber || `OFFER-${Date.now().toString().slice(-6)}`
        };
        
        onSave(payload);
    };

    const isSent = offer?.status && offer.status !== OfferStatus.Draft;

    const footer = (
        <div className="flex justify-end w-full space-x-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            {!isSent && <Button onClick={() => handleSave(OfferStatus.Draft)}>Save as Draft</Button>}
            {!isSent && <Button onClick={() => handleSave(OfferStatus.Sent)}>Send Offer</Button>}
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={offer ? `Edit Offer: ${offer.offerNumber}` : 'New Job Offer'}
            footer={footer}
            size="2xl"
        >
            <div className="space-y-6">
                {error && <p className="text-sm text-red-500 bg-red-50 p-3 rounded-md">{error}</p>}
                
                <Card title="Applicant & Position" className="!p-0">
                    <div className="p-4 space-y-4">
                        <div>
                            <label className="block text-sm font-medium">Applicant</label>
                            <select value={applicationId} onChange={e => setApplicationId(e.target.value)} disabled={!!offer} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                                <option value="">-- Select an Applicant in Offer Stage --</option>
                                {applicantsInOfferStage.map(opt => <option key={opt.appId} value={opt.appId}>{opt.label}</option>)}
                            </select>
                        </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input label="Start Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                             <Input label="Probation (Months)" type="number" value={probationMonths} onChange={e => setProbationMonths(parseInt(e.target.value))} />
                        </div>
                    </div>
                </Card>
                
                <Card title="Compensation Details" className="!p-0">
                    <div className="p-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input label={`Base Pay (Monthly)`} unit={settings.currency} type="number" value={basePay} onChange={e => setBasePay(parseFloat(e.target.value) || 0)} required />
                            <div>
                                <label className="block text-sm font-medium">Employment Type</label>
                                <select value={employmentType} onChange={e => setEmploymentType(e.target.value as any)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                                    <option>Full-Time</option>
                                    <option>Part-Time</option>
                                    <option>Contract</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-sm font-medium">Allowances</h4>
                            {allowances.map((allowance) => (
                                <div key={allowance.id} className="flex items-center space-x-2 mt-2">
                                    <Input label="" id={`type-${allowance.id}`} placeholder="Type (e.g., Meal)" value={allowance.type} onChange={e => handleAllowanceChange(allowance.id, 'type', e.target.value)} />
                                    <Input label="" id={`amount-${allowance.id}`} placeholder="Amount" type="number" unit={settings.currency} value={allowance.amount} onChange={e => handleAllowanceChange(allowance.id, 'amount', e.target.value)} />
                                    <Button variant="danger" size="sm" onClick={() => handleRemoveAllowance(allowance.id)} className="mt-1 self-center">X</Button>
                                </div>
                            ))}
                            <Button variant="secondary" size="sm" onClick={handleAddAllowance} className="mt-2">+ Add Allowance</Button>
                        </div>
                         <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700/50 rounded-md flex justify-between items-center">
                            <span className="font-bold text-lg">Total Compensation Package</span>
                            <span className="font-bold text-xl text-green-600 dark:text-green-400">{settings.currency} {totalCompensation.toLocaleString()}</span>
                        </div>
                    </div>
                </Card>

                <Card title="Clauses & Conditions" className="!p-0">
                    <div className="p-4">
                        <Textarea label="Special Clauses" value={specialClauses} onChange={e => setSpecialClauses(e.target.value)} rows={4} />
                    </div>
                </Card>
            </div>
        </Modal>
    );
};

export default OfferCreationModal;