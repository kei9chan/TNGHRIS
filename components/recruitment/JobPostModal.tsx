import React, { useState, useEffect, useMemo, useRef } from 'react';
import { JobPost, JobPostStatus, JobRequisitionStatus, JobRequisition, BusinessUnit } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import { usePermissions } from '../../hooks/usePermissions';

interface JobPostModalProps {
    isOpen: boolean;
    onClose: () => void;
    jobPost: JobPost | null;
    onSave: (jobPost: JobPost) => void;
    jobRequisitions: JobRequisition[];
    businessUnits: BusinessUnit[];
    saving?: boolean;
}

const JobPostModal: React.FC<JobPostModalProps> = ({ isOpen, onClose, jobPost, onSave, jobRequisitions, businessUnits, saving }) => {
    const { getAccessibleBusinessUnits } = usePermissions();
    const [current, setCurrent] = useState<Partial<JobPost>>(jobPost || {});
    
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
        } as JobPost;

        onSave(payload);
    };

    const isPublished = current.status === JobPostStatus.Published;

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
                <Textarea label="Job Description" name="description" value={current.description || ''} onChange={handleChange} rows={5} required />
                <Textarea label="Requirements" name="requirements" value={current.requirements || ''} onChange={handleChange} rows={4} />
                <Textarea label="Benefits" name="benefits" value={current.benefits || ''} onChange={handleChange} rows={3} />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Location Label" name="locationLabel" value={current.locationLabel || ''} onChange={handleChange} placeholder="e.g., Manila, Philippines" />
                    <Input label="Referral Bonus" name="referralBonus" type="number" value={current.referralBonus || ''} onChange={handleChange} />
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
