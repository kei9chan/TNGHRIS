import React, { useEffect, useMemo, useState } from 'react';
import {
    COE_PURPOSE_OPTIONS,
    COEPurpose,
    COERequest,
    COERequestStatus,
    COETemplate,
    getCoePurposeLabel,
} from '../../types';
import { useBusinessUnits } from '../../hooks/useHRData';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabaseClient';
import { fetchActiveCoeTemplates } from '../../services/coeService';
import { COE_SAMPLE_EMPLOYEE } from '../../services/coeDocument';
import COEDocumentPreview from '../admin/COEDocumentPreview';

interface RequestCOEModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (request: Partial<COERequest>) => void | Promise<void>;
}

const isUuid = (value?: string | null) =>
    !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const RequestCOEModal: React.FC<RequestCOEModalProps> = ({ isOpen, onClose, onSave }) => {
    const { user } = useAuth();
    const { businessUnits } = useBusinessUnits();
    const [purpose, setPurpose] = useState<COEPurpose | null>(null);
    const [otherPurpose, setOtherPurpose] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const [templates, setTemplates] = useState<COETemplate[]>([]);
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
    const [templateError, setTemplateError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [positionLabel, setPositionLabel] = useState<string | undefined>(user?.role);

    const businessUnit = useMemo(
        () => businessUnits.find(item => item.id === user?.businessUnitId)
            || businessUnits.find(item => item.name === user?.businessUnit),
        [businessUnits, user?.businessUnit, user?.businessUnitId],
    );
    const businessUnitId = businessUnit?.id || (isUuid(user?.businessUnitId) ? user.businessUnitId : '') || '';

    useEffect(() => {
        if (!isOpen) return;

        setPurpose(null);
        setOtherPurpose('');
        setSelectedTemplateId(null);
        setTemplateError(null);

        let active = true;
        setIsLoadingTemplates(true);
        Promise.all([
            user?.id
                ? supabase.from('hris_users').select('role').eq('id', user.id).maybeSingle()
                : Promise.resolve({ data: null }),
            fetchActiveCoeTemplates(),
        ])
            .then(([roleResult, activeTemplates]) => {
                if (!active) return;
                setPositionLabel(roleResult.data?.role || user?.role);
                setTemplates(activeTemplates);
            })
            .catch(error => {
                if (!active) return;
                setPositionLabel(user?.role);
                setTemplates([]);
                setTemplateError(error?.message || 'COE templates could not be loaded.');
            })
            .finally(() => {
                if (active) setIsLoadingTemplates(false);
            });

        return () => {
            active = false;
        };
    }, [isOpen, user]);

    const filteredTemplates = useMemo(() => {
        if (!purpose || !businessUnitId) return [];
        return templates.filter(template => {
            if (template.businessUnitId !== businessUnitId) return false;
            // Empty metadata is treated as compatible for legacy templates. HR can
            // assign the exact purpose set while editing the existing template.
            return !template.purposes?.length || template.purposes.includes(purpose);
        });
    }, [businessUnitId, purpose, templates]);

    const selectedTemplate = useMemo(
        () => filteredTemplates.find(template => template.id === selectedTemplateId),
        [filteredTemplates, selectedTemplateId],
    );

    useEffect(() => {
        if (selectedTemplateId && !selectedTemplate) setSelectedTemplateId(null);
    }, [selectedTemplate, selectedTemplateId]);

    const previewEmployee = useMemo(() => ({
        ...COE_SAMPLE_EMPLOYEE,
        businessUnit: businessUnit?.name || user?.businessUnit || 'Selected Business Unit',
        businessUnitId,
        purpose: purpose ? getCoePurposeLabel(purpose, otherPurpose).toLowerCase() : COE_SAMPLE_EMPLOYEE.purpose,
    }), [businessUnit?.name, businessUnitId, otherPurpose, purpose, user?.businessUnit]);

    const previewRequest = useMemo<COERequest>(() => ({
        id: 'SAMPLE-COE-REQUEST',
        employeeId: previewEmployee.id,
        employeeName: previewEmployee.name,
        employeePosition: previewEmployee.position,
        businessUnitId,
        purpose: purpose || COEPurpose.LoanApplication,
        dateRequested: new Date(),
        status: COERequestStatus.Approved,
        templateId: selectedTemplate?.id,
        approvedAt: new Date(),
        documentVersion: 1,
    }), [businessUnitId, previewEmployee, purpose, selectedTemplate?.id]);

    const handleSave = async () => {
        if (!user) return;
        if (!purpose) {
            alert('Please choose what this COE is for.');
            return;
        }
        if (purpose === COEPurpose.Others && !otherPurpose.trim()) {
            alert('Please specify the purpose.');
            return;
        }
        if (!selectedTemplate) {
            alert('Please choose a COE template.');
            return;
        }

        setIsSubmitting(true);
        try {
            await onSave({
                employeeId: user.id,
                employeeName: user.name,
                businessUnitId,
                purpose,
                otherPurposeDetail: purpose === COEPurpose.Others ? otherPurpose.trim() : undefined,
                templateId: selectedTemplate.id,
                templateName: selectedTemplate.name,
                dateRequested: new Date(),
                status: COERequestStatus.PendingHRManagerApproval,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Request Certificate of Employment"
            size="5xl"
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave} isLoading={isSubmitting} disabled={!purpose || !selectedTemplate || isSubmitting}>
                        Submit Request
                    </Button>
                </div>
            }
        >
            <div className="space-y-5">
                <div className="p-4 bg-gray-50 dark:bg-slate-700 rounded-md border border-gray-200 dark:border-gray-600">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Employee Details</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="block text-xs text-gray-500 dark:text-gray-400">Name</span>
                            <span className="font-medium text-gray-900 dark:text-white">{user?.name}</span>
                        </div>
                        <div>
                            <span className="block text-xs text-gray-500 dark:text-gray-400">Position</span>
                            <span className="font-medium text-gray-900 dark:text-white">{positionLabel || 'N/A'}</span>
                        </div>
                        <div className="col-span-2">
                            <span className="block text-xs text-gray-500 dark:text-gray-400">Business Unit</span>
                            <span className="font-medium text-gray-900 dark:text-white">{businessUnit?.name || user?.businessUnit || 'N/A'}</span>
                        </div>
                    </div>
                </div>

                <section>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">What is this COE for?</h3>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {COE_PURPOSE_OPTIONS.map(option => {
                            const isSelected = purpose === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() => setPurpose(option.value)}
                                    className={`rounded-lg border px-3 py-3 text-left text-sm transition ${isSelected
                                        ? 'border-indigo-500 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-200 dark:border-indigo-400 dark:bg-indigo-950/40 dark:text-indigo-100 dark:ring-indigo-900'
                                        : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300 dark:border-gray-600 dark:bg-slate-800 dark:text-gray-200'}`}
                                >
                                    <span className="font-medium">{option.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </section>

                {purpose === COEPurpose.Others && (
                    <Input
                        label="Please specify"
                        value={otherPurpose}
                        onChange={event => setOtherPurpose(event.target.value)}
                        placeholder="Enter purpose..."
                        required
                    />
                )}

                <section>
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Choose a COE Template</h3>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Templates are filtered for your business unit and purpose.</p>
                        </div>
                        {purpose && <span className="text-xs font-medium text-indigo-600 dark:text-indigo-300">{filteredTemplates.length} available</span>}
                    </div>

                    {templateError && (
                        <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
                            {templateError}
                        </p>
                    )}

                    {!purpose ? (
                        <p className="mt-3 rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                            Choose a purpose to see the available templates.
                        </p>
                    ) : isLoadingTemplates ? (
                        <p className="mt-3 rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                            Loading templates…
                        </p>
                    ) : filteredTemplates.length === 0 ? (
                        <p className="mt-3 rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                            No active template is available for this purpose and business unit.
                        </p>
                    ) : (
                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                            {filteredTemplates.map(template => {
                                const isSelected = selectedTemplateId === template.id;
                                const isRecommended = template.recommendedPurposes?.includes(purpose);
                                return (
                                    <button
                                        key={template.id}
                                        type="button"
                                        aria-pressed={isSelected}
                                        onClick={() => setSelectedTemplateId(template.id)}
                                        className={`overflow-hidden rounded-lg border text-left transition ${isSelected
                                            ? 'border-indigo-500 ring-2 ring-indigo-200 dark:border-indigo-400 dark:ring-indigo-900'
                                            : 'border-gray-200 hover:border-indigo-300 dark:border-gray-600'}`}
                                    >
                                        <div className="flex items-start justify-between gap-2 bg-gray-50 px-3 py-3 dark:bg-slate-700">
                                            <div>
                                                <h4 className="font-semibold text-gray-900 dark:text-white">{template.name || 'Certificate of Employment'}</h4>
                                                {template.description && <p className="mt-1 text-xs text-gray-500 dark:text-gray-300">{template.description}</p>}
                                            </div>
                                            {isRecommended && (
                                                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                                                    Recommended
                                                </span>
                                            )}
                                        </div>
                                        <div className="h-40 overflow-hidden bg-slate-200 p-2 dark:bg-slate-900">
                                            <div className="mx-auto h-[680px] w-[480px] origin-top-left scale-[0.28]">
                                                <COEDocumentPreview
                                                    template={{ ...template, businessUnitName: template.businessUnitName || businessUnit?.name }}
                                                    request={previewRequest}
                                                    employee={previewEmployee}
                                                    showSystemFooter={false}
                                                />
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </section>

                <p className="text-xs text-gray-500 dark:text-gray-400">
                    Your request will be submitted to the active HR Manager for approval. The selected purpose and template will be retained with the request and used for the generated COE.
                </p>
            </div>
        </Modal>
    );
};

export default RequestCOEModal;
