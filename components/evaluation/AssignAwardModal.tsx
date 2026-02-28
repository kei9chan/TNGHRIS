
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Award, User, BusinessUnit } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import EmployeeMultiSelect from '../feedback/EmployeeMultiSelect';
import CertificateRenderer from './CertificateRenderer';
import html2canvas from 'html2canvas';
import { fetchAwardTemplates } from '../../services/awardService';
import { supabase } from '../../services/supabaseClient';

interface AssignAwardModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAssign: (employeeId: string, awardId: string, notes: string, businessUnitId: string, approvers: User[], certificateUrl: string) => void;
    employees: User[];
    businessUnits: BusinessUnit[];
    awardTemplates: Award[];
}

const AssignAwardModal: React.FC<AssignAwardModalProps> = ({ isOpen, onClose, onAssign, employees, businessUnits, awardTemplates }) => {
    const [step, setStep] = useState<'details' | 'preview'>('details');
    const [employeeId, setEmployeeId] = useState('');
    const [awardId, setAwardId] = useState('');
    const [notes, setNotes] = useState('');
    const [businessUnitId, setBusinessUnitId] = useState('');
    const [selectedApprovers, setSelectedApprovers] = useState<User[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [templates, setTemplates] = useState<Award[]>(awardTemplates);
    const [people, setPeople] = useState<User[]>(employees);
    const [bus, setBus] = useState<BusinessUnit[]>(businessUnits);

    // Ref for the certificate container (on-screen preview and capture)
    const certificateRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loadData = async () => {
            let loadedPeople = people.length ? people : employees;
            let loadedTemplates = templates.length ? templates : awardTemplates;
            let loadedBus = bus.length ? bus : businessUnits;

            try {
                const { data: userRows } = await supabase
                    .from('hris_users')
                    .select('id, full_name, email, role, position, business_unit, business_unit_id, status');
                if (userRows) {
                    loadedPeople = userRows.map((u: any) => ({
                        id: u.id,
                        authUserId: undefined,
                        name: u.full_name || u.email,
                        email: u.email,
                        role: u.role,
                        department: '',
                        businessUnit: u.business_unit || '',
                        departmentId: undefined,
                        businessUnitId: u.business_unit_id || undefined,
                        status: (u.status as 'Active' | 'Inactive') || 'Active',
                        isPhotoEnrolled: false,
                        dateHired: new Date(),
                        position: u.position || '',
                    }));
                    setPeople(loadedPeople);
                }
            } catch {
                loadedPeople = employees;
                setPeople(employees);
            }

            try {
                loadedTemplates = await fetchAwardTemplates();
                setTemplates(loadedTemplates);
            } catch {
                loadedTemplates = awardTemplates;
                setTemplates(awardTemplates);
            }

            try {
                const { data: buRows } = await supabase.from('business_units').select('id, name, code, color');
                if (buRows) {
                    loadedBus = buRows.map((b: any) => ({
                        id: b.id,
                        name: b.name,
                        code: b.code,
                        color: b.color || '#4F46E5',
                    }));
                    setBus(loadedBus);
                }
            } catch {
                loadedBus = businessUnits;
                setBus(businessUnits);
            }

            return { loadedPeople, loadedTemplates, loadedBus };
        };
        if (isOpen) {
            loadData().then(({ loadedPeople, loadedTemplates, loadedBus }) => {
                setStep('details');
                const activeEmployees = loadedPeople.length ? loadedPeople : employees;
                const firstEmployee = (activeEmployees.find(u => u.status === 'Active') || activeEmployees[0]);
                setEmployeeId(firstEmployee?.id || '');
                const activeTemplates = loadedTemplates.length ? loadedTemplates : awardTemplates;
                setAwardId(activeTemplates.find(a => a.isActive)?.id || activeTemplates[0]?.id || '');
                const buId =
                    loadedBus.find(b => b.id === firstEmployee?.businessUnitId)?.id ||
                    loadedBus.find(b => b.name === firstEmployee?.businessUnit)?.id ||
                    firstEmployee?.businessUnitId ||
                    '';
                setBusinessUnitId(buId || '');
                setNotes('');
                setSelectedApprovers([]);
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Update BU when employee changes
    useEffect(() => {
        if (employeeId) {
            const employee = people.find(u => u.id === employeeId) || employees.find(u => u.id === employeeId);
            const bu = bus.find(b => b.id === employee?.businessUnitId) || bus.find(b => b.name === employee?.businessUnit);
            if (bu) setBusinessUnitId(bu.id);
        }
    }, [employeeId, people, employees, bus]);

    const selectedEmployee = useMemo(
        () => (people.find(u => u.id === employeeId) || employees.find(u => u.id === employeeId)),
        [employeeId, people, employees]
    );
    const selectedAward = useMemo(
        () => templates.find(a => a.id === awardId) || awardTemplates.find(a => a.id === awardId),
        [awardId, templates, awardTemplates]
    );

    const handleNext = () => {
        if (!employeeId || !awardId || !businessUnitId || selectedApprovers.length === 0) {
            alert("Please select an employee, award, business unit, and at least one approver.");
            return;
        }
        setStep('preview');
    };

    const handleGrant = async () => {
        await new Promise(requestAnimationFrame); // allow preview to paint
        const src = document.getElementById('certificate-preview') as HTMLElement | null;
        if (!src) return;
        if (!selectedEmployee || !selectedAward) {
            alert('Please select an employee and award.');
            return;
        }
        if (!selectedEmployee.email) {
            alert('Selected employee has no email address.');
            return;
        }

        // Clone the preview at full scale off-screen to avoid overlays/transform issues
        const clone = src.cloneNode(true) as HTMLElement;
        clone.style.position = 'absolute';
        clone.style.left = '-12000px';
        clone.style.top = '0';
        clone.style.transform = 'none';
        clone.style.width = '1000px';
        clone.style.height = '700px';
        clone.id = 'certificate-download-clone';
        document.body.appendChild(clone);

        setIsGenerating(true);
        try {
            const canvas = await html2canvas(clone, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
            });
            const certificateUrl = canvas.toDataURL('image/png');
            await Promise.resolve(
                onAssign(employeeId, awardId, notes, businessUnitId, selectedApprovers, certificateUrl)
            );

            const senderName =
                (import.meta as any).env?.VITE_SMTP_FROM_NAME ||
                user?.name ||
                'HR Team';
            const subject = `Award Certificate - ${selectedAward.title}`;
            const message = `Dear ${selectedEmployee.name.split(' ')[0]},\n\nCongratulations on receiving the ${selectedAward.title} award. Your certificate is attached.\n\nBest regards,\n${senderName}`;
            const html = `
<p>Dear ${selectedEmployee.name.split(' ')[0]},</p>
<p>Congratulations on receiving the <strong>${selectedAward.title}</strong> award. Your certificate is attached.</p>
${notes ? `<p><strong>Citation:</strong> ${notes}</p>` : ''}
<p>Best regards,<br />${senderName}</p>
            `.trim();

            const certificateBase64 = certificateUrl.split(',')[1] || '';
            if (!certificateBase64) {
                throw new Error('Unable to prepare certificate attachment.');
            }

            const response = await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: selectedEmployee.email,
                    subject,
                    message,
                    html,
                    attachments: [
                        {
                            filename: `Award_Certificate_${selectedEmployee.name.replace(/\\s+/g, '_')}.png`,
                            contentBase64: certificateBase64,
                            contentType: 'image/png',
                        },
                    ],
                }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data?.error || 'Failed to send award email.');
            }
        } catch (error) {
            console.error("Failed to generate certificate image", error);
            alert((error as Error)?.message || "Failed to generate certificate image. Please try again.");
        } finally {
            clone.remove();
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
                    {(people.length ? people : employees).filter(u => u.status === 'Active').map(user => (
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
                    {(bus.length ? bus : businessUnits).map(bu => (
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
                    {(templates.length ? templates : awardTemplates).filter(a => a.isActive).map(award => (
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
                allUsers={(people.length ? people : employees).filter(u => u.role !== 'Employee')}
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
                className="border shadow-lg bg-gray-100 dark:bg-gray-900 p-2 w-full overflow-auto"
                style={{ maxWidth: '100%' }}
            >
                <div
                  ref={certificateRef}
                  className="w-full flex justify-center"
                  style={{ minHeight: '760px' }}
                >
                    <div
                      className="inline-block"
                      style={{
                        transform: 'scale(0.6)',
                        transformOrigin: 'top center',
                        margin: '0 auto',
                      }}
                    >
                        {selectedAward?.design && selectedEmployee && (
                            <div id="certificate-preview">
                                <CertificateRenderer 
                                    design={selectedAward.design}
                                    data={{
                                        employeeName: selectedEmployee.name,
                                        date: new Date(),
                                        awardTitle: selectedAward.title,
                                        citation: notes
                                    }}
                                />
                            </div>
                        )}
                    </div>
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
