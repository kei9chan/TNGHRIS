import React, { useState, useEffect, useMemo } from 'react';
import { Offer, OfferStatus, ApplicationStage, JobRequisition, Application, Candidate, BusinessUnit, Department } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import RichTextEditor from '../ui/RichTextEditor';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../hooks/useAuth';

interface OfferCreationDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (offer: Offer) => void;
    applications: Application[];
    candidates: Candidate[];
    requisitions: JobRequisition[];
    businessUnits?: BusinessUnit[];
    departments?: Department[];
}

interface Allowance {
    id: number;
    type: string;
    amount: number;
}

const XIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transition-transform ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;

const Section: React.FC<{ title: string; id: string; openSection: string; setOpenSection: (id: string) => void; children: React.ReactNode }> = ({ title, id, openSection, setOpenSection, children }) => {
    const isOpen = openSection === id;
    return (
        <div className="border-b dark:border-slate-700">
            <button onClick={() => setOpenSection(isOpen ? '' : id)} className="w-full flex justify-between items-center p-4 text-left">
                <h3 className="text-lg font-semibold">{title}</h3>
                <ChevronDownIcon className={isOpen ? 'rotate-180' : ''} />
            </button>
            {isOpen && <div className="p-4 space-y-4">{children}</div>}
        </div>
    );
};

const OfferCreationDrawer: React.FC<OfferCreationDrawerProps> = ({ isOpen, onClose, onSave, applications, candidates, requisitions, businessUnits = [], departments = [] }) => {
    const { settings } = useSettings();
    const { user } = useAuth();
    const [openSection, setOpenSection] = useState('applicant');
    
    // Form State
    const [applicationId, setApplicationId] = useState('');
    const [offerData, setOfferData] = useState<Partial<Offer>>({});
    const [allowances, setAllowances] = useState<Allowance[]>([]);
    const [error, setError] = useState('');
    
    const applicantsInOfferStage = useMemo(() => {
        return applications
            .filter(app => [ApplicationStage.Offer, ApplicationStage.Interview, ApplicationStage.Screen, ApplicationStage.HMReview].includes(app.stage))
            .map(app => {
                const candidate = candidates.find(c => c.id === app.candidateId);
                const job = requisitions.find(j => j.id === app.requisitionId);
                return { appId: app.id, label: `${candidate?.firstName || 'Candidate'} ${candidate?.lastName || ''} - ${job?.title || 'Unknown Role'}` };
            });
    }, [applications, candidates, requisitions]);

    const selectedRequisition = useMemo(() => {
        if (!applicationId) return null;
        const app = applications.find(a => a.id === applicationId);
        return requisitions.find(r => r.id === app?.requisitionId);
    }, [applicationId, applications, requisitions]);

    useEffect(() => {
        const defaultOffer: Partial<Offer> = {
            startDate: new Date(),
            probationMonths: 6,
            paymentSchedule: "15th and 30th of each month",
            signatoryName: user?.name,
            signatoryPosition: user?.position,
        };

        if (selectedRequisition) {
            setOfferData({
                ...defaultOffer,
                basePay: selectedRequisition.budgetedSalaryMin,
                employmentType: selectedRequisition.employmentType,
                workLocation: selectedRequisition.workLocation,
                reportingTo: '',
            });
            setAllowances([]);
        } else {
            setOfferData(defaultOffer);
        }
    }, [selectedRequisition, user]);
    
    const handleDataChange = (field: keyof Offer, value: any) => {
        setOfferData(prev => ({...prev, [field]: value}));
    };
    
    const handleAddAllowance = () => setAllowances([...allowances, {id: Date.now(), type: '', amount: 0}]);
    const handleRemoveAllowance = (id: number) => setAllowances(allowances.filter(a => a.id !== id));
    const handleAllowanceChange = (id: number, field: 'type' | 'amount', value: string) => {
        setAllowances(allowances.map(a => a.id === id ? {...a, [field]: field === 'amount' ? parseFloat(value) || 0 : value} : a));
    };

    const handleSave = (status: OfferStatus) => {
        if (!applicationId || !offerData.basePay || !offerData.startDate) {
            setError('Please select an applicant and fill in all required fields.');
            return;
        }

        const allowanceObject = allowances.reduce((obj, item) => {
            if(item.type) obj[item.type.toLowerCase()] = item.amount;
            return obj;
        }, {} as Record<string, number>);

        const payload: Offer = {
            ...offerData,
            id: '', // Set by parent
            applicationId,
            status,
            allowanceJSON: JSON.stringify(allowanceObject),
            offerNumber: offerData.offerNumber || `OFFER-${Date.now().toString().slice(-6)}`
        } as Offer;
        
        onSave(payload);
    };

    return (
        <div className={`fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div className={`fixed top-0 right-0 h-full w-full max-w-4xl bg-white dark:bg-slate-800 shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="flex flex-col h-full">
                    <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10">
                        <h2 className="text-xl font-semibold">New Job Offer</h2>
                        <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700"><XIcon /></button>
                    </div>

                    <div className="flex-grow overflow-y-auto">
                        {error && <p className="m-4 text-sm text-red-500 bg-red-50 p-3 rounded-md">{error}</p>}
                        
                        <Section id="applicant" title="1. Applicant & Position Details" openSection={openSection} setOpenSection={setOpenSection}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium">Applicant*</label>
                                    <select value={applicationId} onChange={e => setApplicationId(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 border-gray-300 rounded-md dark:bg-gray-700">
                                        <option value="">-- Select an Applicant in Offer Stage --</option>
                                        {applicantsInOfferStage.map(opt => <option key={opt.appId} value={opt.appId}>{opt.label}</option>)}
                                    </select>
                                </div>
                                <Input label="Job Title" value={selectedRequisition?.title || ''} readOnly />
                                <Input label="Department" value={departments.find(d=>d.id === selectedRequisition?.departmentId)?.name || ''} readOnly />
                                <Input label="Reporting To" name="reportingTo" value={offerData.reportingTo || ''} onChange={(e) => handleDataChange('reportingTo', e.target.value)} />
                                <div>
                                    <label className="block text-sm font-medium">Employment Type</label>
                                    <select name="employmentType" value={offerData.employmentType || ''} onChange={(e) => handleDataChange('employmentType', e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 border-gray-300 rounded-md dark:bg-gray-700">
                                        <option>Full-Time</option><option>Part-Time</option><option>Contract</option>
                                    </select>
                                </div>
                            </div>
                        </Section>

                        <Section id="jd" title="2. Job Description" openSection={openSection} setOpenSection={setOpenSection}>
                            <RichTextEditor label="Main Responsibilities" value={offerData.jobDescription || ''} onChange={(value) => handleDataChange('jobDescription', value)} />
                        </Section>
                        
                        <Section id="compensation" title="3. Compensation" openSection={openSection} setOpenSection={setOpenSection}>
                             <Input label={`Base Pay (Monthly)`} unit={settings.currency} type="number" value={offerData.basePay || ''} onChange={(e) => handleDataChange('basePay', parseFloat(e.target.value) || 0)} required />
                             <Input label="Payment Schedule" name="paymentSchedule" value={offerData.paymentSchedule || ''} onChange={(e) => handleDataChange('paymentSchedule', e.target.value)} />
                             <RichTextEditor label="Additional Pay Information (OT, Holidays, etc.)" value={offerData.additionalPayInfo || ''} onChange={(value) => handleDataChange('additionalPayInfo', value)} />
                             <div>
                                <h4 className="text-sm font-medium">Allowances</h4>
                                {allowances.map((allowance) => (
                                    <div key={allowance.id} className="flex items-center space-x-2 mt-2">
                                        <Input label="" id={`type-${allowance.id}`} placeholder="Type" value={allowance.type} onChange={e => handleAllowanceChange(allowance.id, 'type', e.target.value)} />
                                        <Input label="" id={`amount-${allowance.id}`} placeholder="Amount" type="number" unit={settings.currency} value={allowance.amount} onChange={e => handleAllowanceChange(allowance.id, 'amount', e.target.value)} />
                                        <Button variant="danger" size="sm" onClick={() => handleRemoveAllowance(allowance.id)} className="mt-1 self-center">X</Button>
                                    </div>
                                ))}
                                <Button variant="secondary" size="sm" onClick={handleAddAllowance} className="mt-2">+ Add Allowance</Button>
                            </div>
                        </Section>

                        <Section id="schedule" title="4. Work Schedule & Location" openSection={openSection} setOpenSection={setOpenSection}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input label="Work Days" name="workScheduleDays" value={offerData.workScheduleDays || ''} onChange={(e) => handleDataChange('workScheduleDays', e.target.value)} placeholder="e.g. Monday to Friday" />
                                <Input label="Work Hours" name="workScheduleHours" value={offerData.workScheduleHours || ''} onChange={(e) => handleDataChange('workScheduleHours', e.target.value)} placeholder="e.g. 9:00 AM to 6:00 PM" />
                                <div className="md:col-span-2">
                                    <Input label="Work Location" name="workLocation" value={offerData.workLocation || ''} onChange={(e) => handleDataChange('workLocation', e.target.value)} />
                                </div>
                            </div>
                        </Section>

                        <Section id="benefits" title="5. Benefits & Conditions" openSection={openSection} setOpenSection={setOpenSection}>
                            <RichTextEditor label="Company Benefits" value={offerData.companyBenefits || ''} onChange={(value) => handleDataChange('companyBenefits', value)} />
                            <RichTextEditor label="Pre-employment Requirements" value={offerData.preEmploymentRequirements || ''} onChange={(value) => handleDataChange('preEmploymentRequirements', value)} />
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input label="Start Date" type="date" value={offerData.startDate ? new Date(offerData.startDate).toISOString().split('T')[0] : ''} onChange={(e) => handleDataChange('startDate', new Date(e.target.value))} required />
                                <Input label="Probation (Months)" type="number" value={offerData.probationMonths || ''} onChange={(e) => handleDataChange('probationMonths', parseInt(e.target.value))} />
                            </div>
                        </Section>
                        
                    </div>

                    <div className="p-4 border-t border-gray-200 dark:border-slate-700 sticky bottom-0 bg-white dark:bg-slate-800 z-10 flex justify-end space-x-2">
                        <Button variant="secondary" onClick={onClose}>Cancel</Button>
                        <Button onClick={() => handleSave(OfferStatus.Draft)}>Save as Draft</Button>
                        <Button onClick={() => handleSave(OfferStatus.Sent)}>Send Offer</Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OfferCreationDrawer;
