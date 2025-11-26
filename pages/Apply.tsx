
import React, { useState, useMemo, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { mockBusinessUnits, mockJobPosts, mockCandidates, mockApplications } from '../services/mockData';
import { JobPostStatus, Candidate, CandidateSource, Application, ApplicationStage } from '../types';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Textarea from '../components/ui/Textarea';
import Button from '../components/ui/Button';
import FileUploader from '../components/ui/FileUploader';

const Apply: React.FC = () => {
    const { jobPostId } = useParams<{ jobPostId: string }>();
    const navigate = useNavigate();

    const [selectedBuId, setSelectedBuId] = useState('');
    const [selectedJobPostId, setSelectedJobPostId] = useState('');
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
    
    const isDirectLink = !!jobPostId;

    // Get ALL available job posts for the career site.
    const availableJobPosts = useMemo(() => {
        return mockJobPosts.filter(post => 
            post.status === JobPostStatus.Published &&
            post.channels?.careerSite
        );
    }, []);

    const selectedJobPost = useMemo(() => {
        if (!selectedJobPostId) return null;
        return mockJobPosts.find(post => post.id === selectedJobPostId);
    }, [selectedJobPostId]);

    // Pre-fill form if accessed via a direct link
    useEffect(() => {
        if (jobPostId) {
            const post = mockJobPosts.find(p => p.id === jobPostId);
            if (post) {
                setSelectedBuId(post.businessUnitId);
                setSelectedJobPostId(post.id);
            }
        }
    }, [jobPostId]);

    // Automatically update the Business Unit when a job is selected.
    useEffect(() => {
        if (selectedJobPostId) {
            const post = availableJobPosts.find(p => p.id === selectedJobPostId);
            if (post && post.businessUnitId !== selectedBuId) {
                setSelectedBuId(post.businessUnitId);
            }
        } else {
            // If no job is selected (and not a direct link), clear the BU
            if (!isDirectLink) {
                setSelectedBuId('');
            }
        }
    }, [selectedJobPostId, availableJobPosts, selectedBuId, isDirectLink]);


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!firstName || !lastName || !email || (!resumeLink && !resumeFile) || !selectedJobPostId) {
            setError('Please fill in your name, email, select a job, and provide a resume (upload or link).');
            return;
        }
        setIsSubmitting(true);

        const jobPost = mockJobPosts.find(p => p.id === selectedJobPostId);
        if (!jobPost) {
            setError('Selected job post is no longer available.');
            setIsSubmitting(false);
            return;
        }

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
        mockCandidates.push(newCandidate);

        const newApplication: Application = {
            id: `APP-${Date.now()}`,
            candidateId: newCandidate.id,
            jobPostId: selectedJobPostId,
            requisitionId: jobPost.requisitionId,
            stage: ApplicationStage.New,
            notes: coverLetter,
            referrer: referredBy,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        mockApplications.push(newApplication);

        // Signal to other tabs/windows that data has changed
        localStorage.setItem('tng_hris_db_update', JSON.stringify({ entity: 'applications', timestamp: Date.now() }));
        
        setTimeout(() => {
            setIsSubmitting(false);
            navigate('/thank-you');
        }, 500);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl w-full space-y-8">
                <div>
                    <h1 className="text-center text-3xl font-extrabold text-gray-900 dark:text-white">TNG HRIS</h1>
                    <h2 className="mt-2 text-center text-xl font-bold text-indigo-600 dark:text-indigo-400">
                        Apply for a Position
                    </h2>
                </div>
                 <Card>
                    {error && <p className="text-sm text-red-500 text-center mb-4">{error}</p>}
                    <form className="space-y-6" onSubmit={handleSubmit}>
                         <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                            <select value={selectedBuId} disabled className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white bg-gray-100 dark:bg-gray-800 cursor-not-allowed">
                                <option value="">-- Select a job to see the business unit --</option>
                                {mockBusinessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                            </select>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Job Application</label>
                            <select value={selectedJobPostId} onChange={e => setSelectedJobPostId(e.target.value)} disabled={isDirectLink} required className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:bg-gray-200 dark:disabled:bg-gray-800">
                                {availableJobPosts.length > 0 ? (
                                    <>
                                        <option value="">-- Select a job post --</option>
                                        {availableJobPosts.map(post => {
                                            const bu = mockBusinessUnits.find(b => b.id === post.businessUnitId);
                                            return <option key={post.id} value={post.id}>{post.title} ({bu?.name || 'N/A'})</option>
                                        })}
                                    </>
                                ) : (
                                    <option value="">No open positions currently available</option>
                                )}
                            </select>
                        </div>

                        {selectedJobPost && (
                            <div className="mt-6 p-4 border rounded-md dark:border-gray-700 bg-gray-50 dark:bg-slate-900/50 space-y-4">
                                {selectedJobPost.description && (
                                    <div>
                                        <h3 className="font-semibold text-lg text-gray-900 dark:text-white">Job Description</h3>
                                        <p className="text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">{selectedJobPost.description}</p>
                                    </div>
                                )}
                                {selectedJobPost.requirements && (
                                    <div>
                                        <h3 className="font-semibold text-lg text-gray-900 dark:text-white">Requirements</h3>
                                        <p className="text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">{selectedJobPost.requirements}</p>
                                    </div>
                                )}
                                {selectedJobPost.benefits && (
                                    <div>
                                        <h3 className="font-semibold text-lg text-gray-900 dark:text-white">Benefits</h3>
                                        <p className="text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">{selectedJobPost.benefits}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="pt-4 border-t dark:border-gray-700 space-y-4">
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
                                <p className="text-xs text-gray-500 mt-1">Accepted formats: PDF, DOCX (Max 5MB)</p>
                            </div>

                            <Textarea label="Cover Letter / Short Introduction" value={coverLetter} onChange={e => setCoverLetter(e.target.value)} rows={5} />
                        </div>

                         <Button type="submit" className="w-full" isLoading={isSubmitting}>
                            Submit Application
                        </Button>
                    </form>
                 </Card>
                 <div className="text-sm text-center">
                    <p className="text-gray-600 dark:text-gray-400">
                        Already an employee?{' '}
                        <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
                        Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Apply;
