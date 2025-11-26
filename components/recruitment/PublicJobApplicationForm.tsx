
import React, { useState } from 'react';
import { JobPost, Candidate, CandidateSource, Application, ApplicationStage } from '../../types';
import { mockCandidates, mockApplications } from '../../services/mockData';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import FileUploader from '../ui/FileUploader';

interface PublicJobApplicationFormProps {
    jobPost: JobPost;
    onClose: () => void;
    onSuccess: () => void;
}

const PublicJobApplicationForm: React.FC<PublicJobApplicationFormProps> = ({ jobPost, onClose, onSuccess }) => {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [mobile, setMobile] = useState('');
    const [referredBy, setReferredBy] = useState('');
    const [coverLetter, setCoverLetter] = useState('');
    const [resumeLink, setResumeLink] = useState('');
    const [resumeFile, setResumeFile] = useState<File | null>(null);
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!firstName || !lastName || !email || (!resumeLink && !resumeFile)) {
            setError('Please fill in your name, email, and provide a resume (upload or link).');
            return;
        }

        setIsSubmitting(true);

        // Simulate API Call delay
        setTimeout(() => {
            const finalResumeUrl = resumeFile ? `file_upload/${resumeFile.name}` : resumeLink;

            const newCandidate: Candidate = {
                id: `CAND-${Date.now()}`,
                firstName: firstName || '',
                lastName: lastName || '',
                email,
                phone: mobile,
                source: CandidateSource.CareerSite,
                portfolioUrl: finalResumeUrl, 
                consentAt: new Date(),
                tags: [],
            };
            
            // Update In-Memory Mock Data
            mockCandidates.push(newCandidate);

            const newApplication: Application = {
                id: `APP-${Date.now()}`,
                candidateId: newCandidate.id,
                jobPostId: jobPost.id,
                requisitionId: jobPost.requisitionId,
                stage: ApplicationStage.New,
                notes: coverLetter,
                referrer: referredBy,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            mockApplications.push(newApplication);

            // PERSIST TO LOCAL STORAGE
            // This ensures that if the admin dashboard is in another tab or refreshed, it can pick up this new data.
            try {
                const storedCandidates = JSON.parse(localStorage.getItem('tng_candidates') || '[]');
                localStorage.setItem('tng_candidates', JSON.stringify([...storedCandidates, newCandidate]));

                const storedApplications = JSON.parse(localStorage.getItem('tng_applications') || '[]');
                localStorage.setItem('tng_applications', JSON.stringify([...storedApplications, newApplication]));
                
                // Signal DB update event for other tabs
                localStorage.setItem('tng_hris_db_update', JSON.stringify({ entity: 'applications', timestamp: Date.now() }));
            } catch (err) {
                console.error("Failed to persist application to local storage", err);
            }

            setIsSubmitting(false);
            onSuccess();
        }, 800);
    };

    return (
        <form className="space-y-6" onSubmit={handleSubmit}>
            {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-md">{error}</div>}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} required />
                <Input label="Last Name" value={lastName} onChange={e => setLastName(e.target.value)} required />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Email Address" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                <Input label="Mobile Number" type="tel" value={mobile} onChange={e => setMobile(e.target.value)} />
            </div>

            <Input label="Referred by (Optional)" value={referredBy} onChange={e => setReferredBy(e.target.value)} placeholder="Name of current employee" />

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

            <Textarea 
                label="Cover Letter / Short Introduction" 
                value={coverLetter} 
                onChange={e => setCoverLetter(e.target.value)} 
                rows={4} 
            />

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                <Button type="submit" isLoading={isSubmitting}>Submit Application</Button>
            </div>
        </form>
    );
};

export default PublicJobApplicationForm;
