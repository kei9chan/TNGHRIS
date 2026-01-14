import React, { useState, useMemo, useEffect } from 'react';
import { Candidate, CandidateSource, JobPostStatus, JobPost, BusinessUnit, JobRequisition } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import FileUploader from '../ui/FileUploader';

interface AddApplicantModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: { candidateData: Omit<Candidate, 'id'>, jobPostId: string, coverLetter: string, resumeFile?: File | null, resumeLink?: string }) => void;
    businessUnits: BusinessUnit[];
    jobPosts: JobPost[];
    jobRequisitions?: JobRequisition[];
}

const AddApplicantModal: React.FC<AddApplicantModalProps> = ({ isOpen, onClose, onSave, businessUnits, jobPosts, jobRequisitions = [] }) => {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [source, setSource] = useState<CandidateSource>(CandidateSource.Sourced);
    const [resumeLink, setResumeLink] = useState('');
    const [resumeFile, setResumeFile] = useState<File | null>(null);
    const [coverLetter, setCoverLetter] = useState('');
    const [businessUnitId, setBusinessUnitId] = useState('');
    const [jobPostId, setJobPostId] = useState('');
    const [error, setError] = useState('');

    const filteredJobPosts = useMemo(() => {
        // Always show published posts; if BU is selected, prefer matches but allow all published if none match.
        const published = jobPosts.filter(post => post.status === JobPostStatus.Published);
        if (!businessUnitId) return published;
        const matches = published.filter(
            post =>
                !post.businessUnitId ||
                post.businessUnitId === businessUnitId
        );
        return matches.length > 0 ? matches : published;
    }, [businessUnitId, jobPosts]);

    useEffect(() => {
        if (isOpen) {
            setFirstName('');
            setLastName('');
            setEmail('');
            setPhone('');
            setSource(CandidateSource.Sourced);
            setResumeLink('');
            setResumeFile(null);
            setCoverLetter('');
            setBusinessUnitId(businessUnits.length > 0 ? businessUnits[0].id : '');
            setError('');
        }
    }, [isOpen, businessUnits]);

    // Logic to select the first available job when BU changes, similar to Apply page behavior
    useEffect(() => {
        if (businessUnitId && filteredJobPosts.length > 0) {
             // Only auto-select if current selection is invalid for the new BU
            const currentPost = filteredJobPosts.find(p => p.id === jobPostId);
            if (!currentPost) {
                setJobPostId(filteredJobPosts[0].id);
            }
        } else if (filteredJobPosts.length === 0) {
            setJobPostId('');
        }
    }, [businessUnitId, filteredJobPosts]);

    const handleSubmit = () => {
        setError('');
        if (!firstName || !lastName || !email || !jobPostId || !source || !businessUnitId || (!resumeLink && !resumeFile)) {
            setError('Please fill in all required fields: Name, Email, Business Unit, Job, Source, and Resume.');
            return;
        }

        const candidateData = {
            firstName,
            lastName,
            email,
            phone,
            source,
            portfolioUrl: resumeLink || '',
            tags: [],
            consentAt: new Date(),
        };

        onSave({ candidateData, jobPostId, coverLetter, resumeFile, resumeLink });
        onClose();
    };

    const footer = (
        <div className="flex justify-end w-full space-x-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit}>Add Applicant</Button>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Add New Applicant"
            footer={footer}
            size="lg"
        >
            <div className="space-y-4">
                {error && <p className="text-sm text-red-500">{error}</p>}
                
                {/* BU and Job Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600">
                    <div>
                        <label className="block text-sm font-medium">Business Unit</label>
                        <select value={businessUnitId} onChange={e => setBusinessUnitId(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium">Job Application</label>
                        <select value={jobPostId} onChange={e => setJobPostId(e.target.value)} disabled={!businessUnitId || filteredJobPosts.length === 0} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:bg-gray-200 dark:disabled:bg-gray-800">
                            {filteredJobPosts.length > 0 ? (
                               filteredJobPosts.map(post => <option key={post.id} value={post.id}>{post.title}</option>)
                            ) : (
                                <option value="">No open job posts</option>
                            )}
                        </select>
                    </div>
                </div>

                {/* Personal Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} required />
                    <Input label="Last Name" value={lastName} onChange={e => setLastName(e.target.value)} required />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Email Address" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                    <Input label="Mobile Number" type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
                </div>

                {/* Application Details */}
                <div className="grid grid-cols-1 gap-4">
                     <div>
                        <label className="block text-sm font-medium">Source</label>
                        <select value={source} onChange={e => setSource(e.target.value as CandidateSource)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            {Object.values(CandidateSource).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Resume / CV</label>
                        <FileUploader onFileUpload={setResumeFile} maxSize={5 * 1024 * 1024} />
                        <div className="relative my-3">
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                <div className="w-full border-t border-gray-300 dark:border-gray-600" />
                            </div>
                            <div className="relative flex justify-center">
                                <span className="px-2 bg-white dark:bg-slate-800 text-sm text-gray-500">
                                    OR PASTE LINK
                                </span>
                            </div>
                        </div>
                        <Input 
                            label="" 
                            type="url" 
                            value={resumeLink} 
                            onChange={e => setResumeLink(e.target.value)} 
                            placeholder="e.g. Google Drive or LinkedIn link..." 
                        />
                    </div>
                </div>

                <Textarea 
                    label="Cover Letter / Short Introduction" 
                    value={coverLetter} 
                    onChange={e => setCoverLetter(e.target.value)} 
                    rows={5} 
                />
            </div>
        </Modal>
    );
};

export default AddApplicantModal;
