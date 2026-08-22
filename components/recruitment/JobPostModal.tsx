import React, { useState, useEffect, useMemo, useRef } from 'react';
import { JobPost, JobPostStatus, JobRequisitionStatus, JobRequisition, BusinessUnit, RoleApplicationQuestion, RoleApplicationQuestionType, RoleDetails, RoleFAQ } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import FileUploader from '../ui/FileUploader';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabaseClient';

interface JobPostModalProps {
    isOpen: boolean;
    onClose: () => void;
    jobPost: JobPost | null;
    onSave: (jobPost: JobPost) => void;
    jobRequisitions: JobRequisition[];
    businessUnits: BusinessUnit[];
    saving?: boolean;
}

const MAX_APPLICATION_QUESTIONS = 5;

type StarterTemplate = {
    id: string;
    name: string;
    businessUnit: string;
    jobTitle: string;
    description: string;
    details: Array<{ icon: string; label: string }>;
    col2Content: string;
    sections: Array<{ title: string; content: string }>;
};

const JobPostModal: React.FC<JobPostModalProps> = ({ isOpen, onClose, jobPost, onSave, jobRequisitions, businessUnits, saving }) => {
    const { getAccessibleBusinessUnits } = usePermissions();
    const { user } = useAuth();
    const [current, setCurrent] = useState<Partial<JobPost>>(jobPost || {});
    const [roleImageUploadError, setRoleImageUploadError] = useState('');
    const [isRoleImageUploading, setIsRoleImageUploading] = useState(false);
    const [starterTemplates, setStarterTemplates] = useState<StarterTemplate[]>([]);
    const [selectedStarterId, setSelectedStarterId] = useState('');
    const [starterTemplateError, setStarterTemplateError] = useState('');
    
    // Searchable Requisition State
    const [reqSearchTerm, setReqSearchTerm] = useState('');
    const [isReqDropdownOpen, setIsReqDropdownOpen] = useState(false);
    const reqWrapperRef = useRef<HTMLDivElement>(null);

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(businessUnits), [getAccessibleBusinessUnits, businessUnits]);
    const accessibleBuIds = useMemo(() => new Set(accessibleBus.map(b => b.id)), [accessibleBus]);

    const approvedRequisitions = useMemo(() => {
        return jobRequisitions.filter(r => {
            const status = (r.status || '').toString().trim().toLowerCase();
            // Show all approved requisitions to avoid hiding valid records due to BU mismatches.
            return status === 'approved';
        });
    }, [jobRequisitions]);

    useEffect(() => {
        if (isOpen) {
            const initialData: Partial<JobPost> = jobPost 
                ? { ...jobPost, channels: jobPost.channels || { careerSite: false, qr: false, social: false, jobBoards: false } }
                : {
                    status: JobPostStatus.Draft,
                    channels: { careerSite: true, qr: false, social: false, jobBoards: false },
                    requisitionId: '',
                  };
            setCurrent(initialData);
            setRoleImageUploadError('');
            setSelectedStarterId('');
            setStarterTemplateError('');

            // Initialize search term if a requisition is already selected
            if (initialData.requisitionId) {
                const r = jobRequisitions.find(req => req.id === initialData.requisitionId);
                setReqSearchTerm(r ? `${r.reqCode}: ${r.title}` : '');
            } else {
                setReqSearchTerm('');
            }
            setIsReqDropdownOpen(false);
        }
    }, [jobPost, isOpen]);

    useEffect(() => {
        if (!isOpen || jobPost) return;
        let cancelled = false;
        const loadStarterTemplates = async () => {
            const { data, error } = await supabase
                .from('job_post_templates')
                .select('id, name, business_unit, job_title, description, details, col2_content, sections, is_starter')
                .eq('is_starter', true)
                .order('name');
            if (cancelled) return;
            if (error) {
                console.warn('Starter templates are not available in Job Post Manager yet', error);
                setStarterTemplateError('Starter templates are unavailable until the template migration is applied.');
                setStarterTemplates([]);
                return;
            }
            setStarterTemplates((data || []).map((row: any) => ({
                id: row.id,
                name: row.name || 'Starter template',
                businessUnit: row.business_unit || '',
                jobTitle: row.job_title || '',
                description: row.description || '',
                details: Array.isArray(row.details) ? row.details : [],
                col2Content: row.col2_content || '',
                sections: Array.isArray(row.sections) ? row.sections : [],
            })));
        };
        loadStarterTemplates();
        return () => { cancelled = true; };
    }, [isOpen, jobPost]);

    // Sync search term when requisitions load after opening
    useEffect(() => {
        if (isOpen && current.requisitionId && !reqSearchTerm) {
            const r = jobRequisitions.find(req => req.id === current.requisitionId);
            if (r) setReqSearchTerm(`${r.reqCode}: ${r.title}`);
        }
    }, [jobRequisitions, current.requisitionId, isOpen, reqSearchTerm]);

    useEffect(() => {
        if (current.requisitionId) {
            const requisition = approvedRequisitions.find(r => r.id === current.requisitionId);
            if (requisition) {
                setCurrent(prev => ({
                    ...prev,
                    title: requisition.title,
                    employmentType: requisition.employmentType,
                    locationLabel: requisition.workLocation,
                    businessUnitId: requisition.businessUnitId,
                }));
                // Ensure search term matches selection (useful if updated indirectly)
                if (!isReqDropdownOpen) {
                    setReqSearchTerm(`${requisition.reqCode}: ${requisition.title}`);
                }
            }
        }
    }, [current.requisitionId, approvedRequisitions, isReqDropdownOpen]);

    // Close dropdown on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (reqWrapperRef.current && !reqWrapperRef.current.contains(event.target as Node)) {
                setIsReqDropdownOpen(false);
                 // Reset search term to currently selected if closed without selection
                 if (current.requisitionId) {
                    const r = approvedRequisitions.find(r => r.id === current.requisitionId);
                    if (r) setReqSearchTerm(`${r.reqCode}: ${r.title}`);
               } else {
                   setReqSearchTerm('');
               }
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [reqWrapperRef, current.requisitionId, approvedRequisitions]);

    const filteredRequisitions = useMemo(() => {
        if (!reqSearchTerm) return approvedRequisitions;
        const lower = reqSearchTerm.toLowerCase();
        return approvedRequisitions.filter(r => 
            r.reqCode.toLowerCase().includes(lower) || 
            r.title.toLowerCase().includes(lower)
        );
    }, [reqSearchTerm, approvedRequisitions]);

    const handleSelectRequisition = (req: typeof approvedRequisitions[0]) => {
        setCurrent(prev => ({ ...prev, requisitionId: req.id }));
        setReqSearchTerm(`${req.reqCode}: ${req.title}`);
        setIsReqDropdownOpen(false);
    };

    const applyStarterTemplate = (templateId: string) => {
        setSelectedStarterId(templateId);
        const starter = starterTemplates.find(template => template.id === templateId);
        if (!starter) return;
        const perks = starter.sections.find(section => section.title.trim().toLowerCase() === 'perks')?.content || '';
        const lookingFor = starter.sections.find(section => section.title.toLowerCase().includes('looking'))?.content || starter.col2Content;
        const location = starter.details.find(detail => detail.icon === '📍')?.label || '';
        const employment = starter.details.find(detail => /full-time|part-time|contract/i.test(detail.label))?.label || '';
        const normalizedEmployment: JobPost['employmentType'] = employment.toLowerCase().includes('part') ? 'Part-Time' : employment.toLowerCase().includes('contract') ? 'Contract' : 'Full-Time';
        setCurrent(previous => ({
            ...previous,
            title: starter.jobTitle || previous.title,
            description: starter.description || previous.description,
            requirements: lookingFor || previous.requirements,
            benefits: perks || previous.benefits,
            locationLabel: location || previous.locationLabel,
            employmentType: normalizedEmployment,
        }));
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setCurrent(prev => ({ ...prev, [name]: value }));
    };

    const handleChannelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setCurrent(prev => {
            const prevChannels = prev.channels || { careerSite: false, qr: false, social: false, jobBoards: false };
            const newChannels = { ...prevChannels, [name]: checked };
            return {
                ...prev,
                channels: newChannels
            };
        });
    };

    const updateRoleDetails = (updates: Partial<RoleDetails>) => {
        setCurrent(prev => ({
            ...prev,
            roleDetails: { ...(prev.roleDetails || {}), ...updates },
        }));
    };

    const roleDetails = current.roleDetails || {};
    const faqs = roleDetails.faqs || [];
    const applicationQuestions = roleDetails.applicationQuestions || [];

    const updateFaq = (index: number, updates: Partial<RoleFAQ>) => {
        updateRoleDetails({
            faqs: faqs.map((faq, faqIndex) => faqIndex === index ? { ...faq, ...updates } : faq),
        });
    };

    const addFaq = () => {
        updateRoleDetails({
            faqs: [...faqs, { id: `faq-${Date.now()}`, question: '', answer: '' }],
        });
    };

    const removeFaq = (index: number) => {
        updateRoleDetails({ faqs: faqs.filter((_, faqIndex) => faqIndex !== index) });
    };

    const updateApplicationQuestion = (index: number, updates: Partial<RoleApplicationQuestion>) => {
        updateRoleDetails({
            applicationQuestions: applicationQuestions.map((question, questionIndex) => questionIndex === index ? { ...question, ...updates } : question),
        });
    };

    const addApplicationQuestion = () => {
        if (applicationQuestions.length >= MAX_APPLICATION_QUESTIONS) return;
        updateRoleDetails({
            applicationQuestions: [...applicationQuestions, { id: `question-${Date.now()}`, label: '', type: 'shortText', required: true, step: 2, options: [] }],
        });
    };

    const removeApplicationQuestion = (index: number) => {
        updateRoleDetails({ applicationQuestions: applicationQuestions.filter((_, questionIndex) => questionIndex !== index) });
    };

    const handleRoleImageUpload = async (file: File) => {
        setRoleImageUploadError('');
        const authUserId = user?.authUserId || user?.id;
        if (!authUserId) {
            setRoleImageUploadError('You must be signed in to upload a role image.');
            return;
        }
        setIsRoleImageUploading(true);
        try {
            const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
            const randomPart = globalThis.crypto?.randomUUID?.() || String(Date.now());
            const path = `role/${authUserId}/role-${jobPost?.id || randomPart}.${extension}`;
            const { data, error } = await supabase.storage.from('application-page-assets').upload(path, file, { upsert: true, contentType: file.type });
            if (error) throw error;
            const storagePath = data?.path || path;
            const { data: publicUrlData } = supabase.storage.from('application-page-assets').getPublicUrl(storagePath);
            if (!publicUrlData?.publicUrl) throw new Error('The role image uploaded, but a public URL could not be generated.');
            updateRoleDetails({ roleImage: publicUrlData.publicUrl });
        } catch (err: any) {
            setRoleImageUploadError(err?.message || 'Role image upload failed.');
        } finally {
            setIsRoleImageUploading(false);
        }
    };

    const handleSave = (status: JobPostStatus) => {
        if (!current.requisitionId || !current.title || !current.description) {
            alert('Please select a requisition and fill in the title and description.');
            return;
        }

        const requisition = approvedRequisitions.find(r => r.id === current.requisitionId);
        if (!requisition) {
            alert('Associated requisition not found.');
            return;
        }

        const isNewPost = !jobPost;

        const payload: JobPost = {
            ...current,
            businessUnitId: requisition.businessUnitId,
            status,
            publishedAt: status === JobPostStatus.Published && !current.publishedAt ? new Date() : current.publishedAt,
            channels: current.channels || { careerSite: isNewPost, qr: false, social: false, jobBoards: false },
            applicationOpenAt: current.applicationOpenAt ? new Date(current.applicationOpenAt) : undefined,
            applicationCloseAt: current.applicationCloseAt ? new Date(current.applicationCloseAt) : undefined,
            isActive: current.isActive ?? true,
            isArchived: current.isArchived ?? false,
            isFeatured: current.isFeatured ?? false,
            isUrgent: current.isUrgent ?? requisition.isUrgent ?? false,
            roleDetails: {
                ...current.roleDetails,
                faqs: (current.roleDetails?.faqs || []).filter(faq => faq.question?.trim() && faq.answer?.trim()),
                applicationQuestions: (current.roleDetails?.applicationQuestions || []).filter(question => question.label?.trim()).map(question => ({
                    ...question,
                    options: (question.options || []).filter(option => option.trim()),
                })),
            },
        } as JobPost;

        onSave(payload);
    };

    const isPublished = current.status === JobPostStatus.Published;
    const dateInputValue = (value?: Date) => value ? new Date(value).toISOString().slice(0, 10) : '';

    const footer = (
        <div className="flex justify-end w-full space-x-2">
            <Button variant="secondary" onClick={onClose} disabled={!!saving}>Cancel</Button>
            {!isPublished && <Button onClick={() => handleSave(JobPostStatus.Draft)} disabled={!!saving}>Save as Draft</Button>}
            <Button onClick={() => handleSave(JobPostStatus.Published)} disabled={!!saving}>
                {saving ? 'Saving...' : isPublished ? 'Update Post' : 'Publish Post'}
            </Button>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={jobPost ? `Edit Job Post: ${jobPost.title}` : 'New Job Post'}
            footer={footer}
        >
            <div className="space-y-4">
                <div className="relative" ref={reqWrapperRef}>
                    <Input 
                        label="Based on Approved Requisition"
                        value={reqSearchTerm}
                        onChange={(e) => {
                            setReqSearchTerm(e.target.value);
                            setIsReqDropdownOpen(true);
                            if (e.target.value === '') {
                                setCurrent(prev => ({ ...prev, requisitionId: '' }));
                            }
                        }}
                        onFocus={() => setIsReqDropdownOpen(true)}
                        placeholder="Search requisition code or title..."
                        disabled={!!jobPost}
                        autoComplete="off"
                        required
                    />
                    {isReqDropdownOpen && !jobPost && (
                        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                            {filteredRequisitions.length > 0 ? (
                                filteredRequisitions.map(r => (
                                    <div 
                                        key={r.id} 
                                        className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-0"
                                        onClick={() => handleSelectRequisition(r)}
                                    >
                                        <div className="font-medium text-indigo-600 dark:text-indigo-400">{r.reqCode}</div>
                                        <div className="text-gray-900 dark:text-gray-200 font-semibold">{r.title}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-0.5">
                                            <span>{businessUnits.find(b => b.id === r.businessUnitId)?.name || 'Unknown BU'}</span>
                                            <span>•</span>
                                            <span>{r.employmentType}</span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="px-4 py-3 text-sm text-gray-500 text-center">No approved requisitions found.</div>
                            )}
                        </div>
                    )}
                </div>

                {!jobPost && (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 p-3 dark:border-indigo-900 dark:bg-indigo-950/20">
                        <label className="block text-sm font-medium text-gray-800 dark:text-gray-200">Start from a reusable job post template <span className="font-normal text-gray-500">(optional)</span></label>
                        <select value={selectedStarterId} onChange={event => applyStarterTemplate(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                            <option value="">Choose a business-unit starter…</option>
                            {starterTemplates.map(template => <option key={template.id} value={template.id}>{template.name}{template.businessUnit ? ` · ${template.businessUnit}` : ''}</option>)}
                        </select>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">This copies the starter content into this new job post. The reusable original is not changed.</p>
                        {starterTemplateError && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{starterTemplateError}</p>}
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                    <select
                        value={current.businessUnitId || ''}
                        disabled
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:bg-gray-200 dark:disabled:bg-gray-800"
                    >
                        <option value="">-- Derived from Requisition --</option>
                        {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                    </select>
                </div>
                <Input label="Job Title" name="title" value={current.title || ''} onChange={handleChange} required />
                <Input label="Role URL Slug" name="slug" value={current.slug || ''} onChange={handleChange} placeholder="e.g., guest-experience-host" />
                <Textarea label="Job Description" name="description" value={current.description || ''} onChange={handleChange} rows={5} required />
                <Textarea label="Requirements" name="requirements" value={current.requirements || ''} onChange={handleChange} rows={4} />
                <Textarea label="Benefits" name="benefits" value={current.benefits || ''} onChange={handleChange} rows={3} />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Location Label" name="locationLabel" value={current.locationLabel || ''} onChange={handleChange} placeholder="e.g., Manila, Philippines" />
                    <Input label="Department" name="departmentLabel" value={current.departmentLabel || ''} onChange={handleChange} placeholder="e.g., Operations" />
                    <Input label="Referral Bonus" name="referralBonus" type="number" value={current.referralBonus || ''} onChange={handleChange} />
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-5 space-y-4">
                    <div>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Role Information Page</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Optional fields appear only when they contain content on the public role page.</p>
                    </div>
                    <Textarea label="Short Role Summary" value={roleDetails.shortSummary || ''} onChange={e => updateRoleDetails({ shortSummary: e.target.value })} rows={2} placeholder="A concise summary shown beside the role title." />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Work Arrangement</label>
                            <select value={roleDetails.workArrangement || ''} onChange={e => updateRoleDetails({ workArrangement: e.target.value || undefined })} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                                <option value="">Not specified</option>
                                <option value="On-site">On-site</option>
                                <option value="Hybrid">Hybrid</option>
                                <option value="Remote">Remote</option>
                            </select>
                        </div>
                        <Input label="Salary Range" value={roleDetails.salaryRange || ''} onChange={e => updateRoleDetails({ salaryRange: e.target.value })} placeholder="e.g., ₱25,000–₱35,000/month" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role Image</label>
                        <FileUploader onFileUpload={handleRoleImageUpload} existingFileUrl={roleDetails.roleImage} inputId={`role-image-${jobPost?.id || 'new'}`} disabled={isRoleImageUploading} maxSize={5 * 1024 * 1024} accept="image/jpeg,image/png,image/webp" allowedMimeTypes={['image/jpeg', 'image/png', 'image/webp']} allowedExtensions={['.jpg', '.jpeg', '.png', '.webp']} />
                        <Input label="Or paste a public image URL" value={roleDetails.roleImage || ''} onChange={e => updateRoleDetails({ roleImage: e.target.value })} placeholder="https://..." type="url" />
                        {isRoleImageUploading && <p className="mt-1 text-xs text-indigo-600">Uploading role image…</p>}
                        {roleImageUploadError && <p className="mt-1 text-xs text-red-600">{roleImageUploadError}</p>}
                        {roleDetails.roleImage && <button type="button" onClick={() => updateRoleDetails({ roleImage: undefined })} className="mt-1 text-xs text-red-600 hover:underline">Remove role image</button>}
                    </div>
                    <Textarea label="Why This Role Matters" value={roleDetails.whyThisRoleMatters || ''} onChange={e => updateRoleDetails({ whyThisRoleMatters: e.target.value })} rows={3} />
                    <Textarea label="What You’ll Do / Responsibilities" value={roleDetails.responsibilities || ''} onChange={e => updateRoleDetails({ responsibilities: e.target.value })} rows={4} />
                    <Textarea label="What We’re Looking For / Qualifications" value={roleDetails.qualifications || ''} onChange={e => updateRoleDetails({ qualifications: e.target.value })} rows={4} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Textarea label="Required Experience" value={roleDetails.requiredExperience || ''} onChange={e => updateRoleDetails({ requiredExperience: e.target.value })} rows={3} />
                        <Textarea label="Preferred Experience" value={roleDetails.preferredExperience || ''} onChange={e => updateRoleDetails({ preferredExperience: e.target.value })} rows={3} />
                    </div>
                        <Textarea label="What You Get / Role Benefits" value={roleDetails.benefits || ''} onChange={e => updateRoleDetails({ benefits: e.target.value })} rows={3} placeholder="Leave blank to use the main Benefits field above." />
                        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <input type="checkbox" checked={roleDetails.allowResumeLink !== false} onChange={e => updateRoleDetails({ allowResumeLink: e.target.checked })} className="h-4 w-4 text-indigo-600 rounded" />
                            Allow applicants to provide a resume link instead of uploading a file
                        </label>

                        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                            <div>
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Optional applicant fields</h4>
                                <p className="text-xs text-gray-500">Only ask for these when they are relevant to this role.</p>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={roleDetails.collectCurrentCity === true} onChange={e => updateRoleDetails({ collectCurrentCity: e.target.checked })} className="h-4 w-4 rounded text-indigo-600" /> Current city / location</label>
                                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={roleDetails.collectLinkedIn === true} onChange={e => updateRoleDetails({ collectLinkedIn: e.target.checked })} className="h-4 w-4 rounded text-indigo-600" /> LinkedIn / portfolio link</label>
                                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={roleDetails.collectCurrentEmployer === true} onChange={e => updateRoleDetails({ collectCurrentEmployer: e.target.checked })} className="h-4 w-4 rounded text-indigo-600" /> Current / most recent employer</label>
                                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={roleDetails.collectEarliestStartDate === true} onChange={e => updateRoleDetails({ collectEarliestStartDate: e.target.checked })} className="h-4 w-4 rounded text-indigo-600" /> Earliest available start date</label>
                            </div>
                        </div>

                        <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
                            <div className="flex items-center justify-between gap-3">
                                <div><h4 className="text-sm font-semibold text-gray-900 dark:text-white">Role screening questions</h4><p className="text-xs text-gray-500">Show up to {MAX_APPLICATION_QUESTIONS} concise questions together on the Role Questions step.</p></div>
                                <Button type="button" size="sm" variant="secondary" onClick={addApplicationQuestion} disabled={applicationQuestions.length >= MAX_APPLICATION_QUESTIONS}>Add Question</Button>
                            </div>
                            {applicationQuestions.length >= MAX_APPLICATION_QUESTIONS && <p className="text-xs text-amber-700">The maximum of {MAX_APPLICATION_QUESTIONS} new screening questions has been reached. Existing questions are preserved.</p>}
                            {applicationQuestions.map((question, index) => (
                                <div key={question.id || index} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
                                    <div className="flex justify-between items-center"><span className="text-xs font-semibold text-gray-500">Question {index + 1}</span><button type="button" onClick={() => removeApplicationQuestion(index)} className="text-xs text-red-600 hover:underline">Remove</button></div>
                                    <Input label="Question / Prompt" value={question.label} onChange={e => updateApplicationQuestion(index, { label: e.target.value })} placeholder="e.g., How many years of relevant experience do you have?" />
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Answer type</label><select value={question.type} onChange={e => updateApplicationQuestion(index, { type: e.target.value as RoleApplicationQuestionType })} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"><option value="shortText">Short text</option><option value="longText">Long text</option><option value="select">Dropdown</option><option value="yesNo">Yes / No</option><option value="number">Number</option><option value="date">Date</option></select></div>
                                        <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={question.required !== false} onChange={e => updateApplicationQuestion(index, { required: e.target.checked })} className="h-4 w-4 text-indigo-600 rounded" />Required</label>
                                    </div>
                                    {question.type === 'select' && <Input label="Dropdown options (comma separated)" value={(question.options || []).join(', ')} onChange={e => updateApplicationQuestion(index, { options: e.target.value.split(',').map(option => option.trim()).filter(Boolean) })} placeholder="Option 1, Option 2" />}
                                    <Input label="Help text (optional)" value={question.helpText || ''} onChange={e => updateApplicationQuestion(index, { helpText: e.target.value })} />
                                </div>
                            ))}
                        </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <div><h4 className="text-sm font-semibold text-gray-900 dark:text-white">FAQs</h4><p className="text-xs text-gray-500">Only completed questions and answers will be shown publicly.</p></div>
                            <Button type="button" size="sm" variant="secondary" onClick={addFaq}>Add FAQ</Button>
                        </div>
                        {faqs.map((faq, index) => (
                            <div key={faq.id || index} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
                                <div className="flex justify-between items-center"><span className="text-xs font-semibold text-gray-500">FAQ {index + 1}</span><button type="button" onClick={() => removeFaq(index)} className="text-xs text-red-600 hover:underline">Remove</button></div>
                                <Input label="Question" value={faq.question} onChange={e => updateFaq(index, { question: e.target.value })} />
                                <Textarea label="Answer" value={faq.answer} onChange={e => updateFaq(index, { answer: e.target.value })} rows={2} />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Application Opens</label>
                        <input
                            type="date"
                            value={dateInputValue(current.applicationOpenAt)}
                            onChange={e => setCurrent(prev => ({ ...prev, applicationOpenAt: e.target.value ? new Date(`${e.target.value}T00:00:00`) : undefined }))}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                        <p className="mt-1 text-xs text-gray-500">Leave blank to open immediately.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Application Closes</label>
                        <input
                            type="date"
                            value={dateInputValue(current.applicationCloseAt)}
                            onChange={e => setCurrent(prev => ({ ...prev, applicationCloseAt: e.target.value ? new Date(`${e.target.value}T23:59:59`) : undefined }))}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                        <p className="mt-1 text-xs text-gray-500">Leave blank for no closing date.</p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-5">
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" checked={current.isActive !== false} onChange={e => setCurrent(prev => ({ ...prev, isActive: e.target.checked }))} className="h-4 w-4 text-indigo-600 rounded" />
                        Active
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" checked={current.isArchived === true} onChange={e => setCurrent(prev => ({ ...prev, isArchived: e.target.checked }))} className="h-4 w-4 text-indigo-600 rounded" />
                        Archived
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" checked={current.isFeatured === true} onChange={e => setCurrent(prev => ({ ...prev, isFeatured: e.target.checked }))} className="h-4 w-4 text-indigo-600 rounded" />
                        Featured
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" checked={current.isUrgent === true} onChange={e => setCurrent(prev => ({ ...prev, isUrgent: e.target.checked }))} className="h-4 w-4 text-indigo-600 rounded" />
                        Urgent
                    </label>
                </div>
                
                <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Publish to Channels</h4>
                    <div className="mt-2 flex flex-wrap gap-4">
                        <div className="flex items-center"><input type="checkbox" id="careerSite" name="careerSite" checked={current.channels?.careerSite || false} onChange={handleChannelChange} className="h-4 w-4 text-indigo-600 rounded" /><label htmlFor="careerSite" className="ml-2 text-sm text-gray-700 dark:text-gray-300">Career Site</label></div>
                        <div className="flex items-center"><input type="checkbox" id="qr" name="qr" checked={current.channels?.qr || false} onChange={handleChannelChange} className="h-4 w-4 text-indigo-600 rounded" /><label htmlFor="qr" className="ml-2 text-sm text-gray-700 dark:text-gray-300">QR Code</label></div>
                        <div className="flex items-center"><input type="checkbox" id="social" name="social" checked={current.channels?.social || false} onChange={handleChannelChange} className="h-4 w-4 text-indigo-600 rounded" /><label htmlFor="social" className="ml-2 text-sm text-gray-700 dark:text-gray-300">Social Media</label></div>
                        <div className="flex items-center"><input type="checkbox" id="jobBoards" name="jobBoards" checked={current.channels?.jobBoards || false} onChange={handleChannelChange} className="h-4 w-4 text-indigo-600 rounded" /><label htmlFor="jobBoards" className="ml-2 text-sm text-gray-700 dark:text-gray-300">Job Boards</label></div>
                    </div>
                </div>
                
                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                    <select name="status" value={current.status || ''} onChange={handleChange} className="mt-1 block w-full max-w-xs pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                        {Object.values(JobPostStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
            </div>
        </Modal>
    );
};

export default JobPostModal;
