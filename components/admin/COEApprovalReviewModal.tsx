import React, { useEffect, useMemo, useRef, useState } from 'react';
import { COEDocumentData, COEPurpose, COERequest, COETemplate, getCoePurposeLabel } from '../../types';
import { approveCoeRequestWithReview, fetchActiveCoeTemplates, fetchCoeReviewDocument } from '../../services/coeService';
import { renderCoeBody, sanitizeCoeHtml } from '../../services/coeDocument';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import COEDocumentPreview from './COEDocumentPreview';

type COEApprovalReviewModalProps = {
    isOpen: boolean;
    request: COERequest | null;
    onClose: () => void;
    onApproved: (documentData: COEDocumentData) => void;
};

const normalizePurpose = (purpose: COEPurpose | string) => {
    const value = String(purpose);
    if (value === 'TRAVEL' || value === 'VISA_APPLICATION') return COEPurpose.VisaTravel;
    if (value === 'SCHOOL_APPLICATION') return COEPurpose.SchoolEducation;
    if (value === 'LEGAL_PURPOSES') return COEPurpose.GovernmentLegal;
    return value as COEPurpose;
};

const COEApprovalReviewModal: React.FC<COEApprovalReviewModalProps> = ({
    isOpen,
    request,
    onClose,
    onApproved,
}) => {
    const [documentData, setDocumentData] = useState<COEDocumentData | null>(null);
    const [templates, setTemplates] = useState<COETemplate[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [bodyHtml, setBodyHtml] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editorRevision, setEditorRevision] = useState(0);
    const editedBodyRef = useRef('');
    const baselineBodyRef = useRef('');

    useEffect(() => {
        if (!isOpen || !request) return;

        let active = true;
        setIsLoading(true);
        setError(null);
        setIsEditing(false);
        Promise.all([
            fetchCoeReviewDocument(request.id),
            fetchActiveCoeTemplates(),
        ])
            .then(([review, activeTemplates]) => {
                if (!active) return;
                const rendered = renderCoeBody(review.template, review.request, review.employee);
                setDocumentData(review);
                setTemplates(activeTemplates);
                setSelectedTemplateId(review.template.id);
                setBodyHtml(rendered);
                editedBodyRef.current = rendered;
                baselineBodyRef.current = rendered;
                setEditorRevision(value => value + 1);
            })
            .catch(loadError => {
                if (active) setError(loadError?.message || 'The COE review could not be prepared.');
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => {
            active = false;
        };
    }, [isOpen, request]);

    const compatibleTemplates = useMemo(() => {
        if (!documentData) return [];
        const purpose = normalizePurpose(documentData.request.purpose);
        return templates.filter(template => {
            if (template.businessUnitId !== documentData.employee.businessUnitId) return false;
            return !template.purposes?.length || template.purposes.map(normalizePurpose).includes(purpose);
        });
    }, [documentData, templates]);

    const selectedTemplate = useMemo(
        () => compatibleTemplates.find(template => template.id === selectedTemplateId) || documentData?.template || null,
        [compatibleTemplates, documentData?.template, selectedTemplateId],
    );

    const changeTemplate = (templateId: string) => {
        if (!documentData) return;
        const template = compatibleTemplates.find(item => item.id === templateId);
        if (!template) return;
        const rendered = renderCoeBody(template, documentData.request, documentData.employee);
        setSelectedTemplateId(templateId);
        setBodyHtml(rendered);
        editedBodyRef.current = rendered;
        baselineBodyRef.current = rendered;
        setIsEditing(false);
        setEditorRevision(value => value + 1);
    };

    const approveAndSend = async () => {
        if (!request || !selectedTemplate) return;
        setIsApproving(true);
        setError(null);
        try {
            const finalBody = sanitizeCoeHtml(editedBodyRef.current || bodyHtml);
            const baselineBody = sanitizeCoeHtml(baselineBodyRef.current);
            const finalized = await approveCoeRequestWithReview(
                request.id,
                selectedTemplate.id,
                finalBody === baselineBody ? undefined : finalBody,
            );
            onApproved(finalized);
        } catch (approvalError: any) {
            setError(approvalError?.message || 'The COE could not be approved and sent.');
        } finally {
            setIsApproving(false);
        }
    };

    const toggleEditing = () => {
        if (isEditing) {
            const currentBody = sanitizeCoeHtml(editedBodyRef.current || bodyHtml);
            editedBodyRef.current = currentBody;
            setBodyHtml(currentBody);
        }
        setIsEditing(value => !value);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Review Certificate of Employment"
            size="full"
            centered={false}
            footer={
                <div className="flex w-full items-center justify-between gap-4">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Changes here apply only to this employee's COE. The master template is not changed.
                    </p>
                    <div className="flex shrink-0 gap-2">
                        <Button variant="secondary" onClick={onClose} disabled={isApproving}>Cancel</Button>
                        <Button variant="success" onClick={approveAndSend} isLoading={isApproving} disabled={!documentData || !selectedTemplate || isLoading || isApproving}>
                            Approve and Send
                        </Button>
                    </div>
                </div>
            }
        >
            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200" role="alert">
                    {error}
                </div>
            )}

            {isLoading ? (
                <div className="py-16 text-center text-gray-500 dark:text-gray-400">Preparing the COE review…</div>
            ) : documentData && selectedTemplate ? (
                <div className="grid items-start gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
                    <aside className="space-y-5 xl:sticky xl:top-0">
                        <section className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-slate-700/60">
                            <h4 className="font-semibold text-gray-900 dark:text-white">Employee and request</h4>
                            <dl className="mt-3 space-y-3 text-sm">
                                <div><dt className="text-xs text-gray-500 dark:text-gray-400">Employee</dt><dd className="font-medium text-gray-900 dark:text-white">{documentData.employee.name}</dd></div>
                                <div><dt className="text-xs text-gray-500 dark:text-gray-400">Position</dt><dd className="text-gray-800 dark:text-gray-200">{documentData.employee.position || 'N/A'}</dd></div>
                                <div><dt className="text-xs text-gray-500 dark:text-gray-400">Business Unit</dt><dd className="text-gray-800 dark:text-gray-200">{documentData.employee.businessUnit || 'N/A'}</dd></div>
                                <div><dt className="text-xs text-gray-500 dark:text-gray-400">Purpose</dt><dd className="text-gray-800 dark:text-gray-200">{getCoePurposeLabel(documentData.request.purpose, documentData.request.otherPurposeDetail)}</dd></div>
                                {documentData.request.otherPurposeDetail && <div><dt className="text-xs text-gray-500 dark:text-gray-400">Details</dt><dd className="text-gray-800 dark:text-gray-200">{documentData.request.otherPurposeDetail}</dd></div>}
                                <div><dt className="text-xs text-gray-500 dark:text-gray-400">Date requested</dt><dd className="text-gray-800 dark:text-gray-200">{documentData.request.dateRequested.toLocaleDateString()}</dd></div>
                            </dl>
                        </section>

                        <section>
                            <label htmlFor="coe-review-template" className="block text-sm font-semibold text-gray-900 dark:text-white">COE template</label>
                            <select
                                id="coe-review-template"
                                value={selectedTemplateId}
                                onChange={event => changeTemplate(event.target.value)}
                                className="mt-2 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-600 dark:bg-slate-700 dark:text-white"
                            >
                                {compatibleTemplates.map(template => (
                                    <option key={template.id} value={template.id}>
                                        {template.name}{template.recommendedPurposes?.map(normalizePurpose).includes(normalizePurpose(documentData.request.purpose)) ? ' — Recommended' : ''}
                                    </option>
                                ))}
                            </select>
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Filtered by the employee's business unit and request purpose.</p>
                        </section>

                        <section className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-950/30">
                            <h4 className="text-sm font-semibold text-indigo-950 dark:text-indigo-100">Generated content</h4>
                            <p className="mt-1 text-xs text-indigo-800 dark:text-indigo-200">Enable editing, then click directly in the certificate body.</p>
                            <Button
                                variant={isEditing ? 'secondary' : 'primary'}
                                size="sm"
                                className="mt-3"
                                onClick={toggleEditing}
                            >
                                {isEditing ? 'Finish Editing' : 'Edit COE Content'}
                            </Button>
                        </section>
                    </aside>

                    <section className="overflow-x-auto rounded-lg bg-slate-200 p-4 dark:bg-slate-950 sm:p-6">
                        <div className="mx-auto w-fit shadow-2xl">
                            <COEDocumentPreview
                                key={`${selectedTemplate.id}-${editorRevision}`}
                                template={selectedTemplate}
                                request={documentData.request}
                                employee={documentData.employee}
                                bodyHtml={bodyHtml}
                                bodyEditable={isEditing}
                                onBodyInput={html => {
                                    editedBodyRef.current = html;
                                }}
                            />
                        </div>
                    </section>
                </div>
            ) : (
                !error && <div className="py-16 text-center text-gray-500 dark:text-gray-400">The COE review is unavailable.</div>
            )}
        </Modal>
    );
};

export default COEApprovalReviewModal;
