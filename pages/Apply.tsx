
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { JobPostStatus, CandidateSource, ApplicationStage, JobPost } from '../types';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Textarea from '../components/ui/Textarea';
import Button from '../components/ui/Button';
import FileUploader from '../components/ui/FileUploader';
import { supabase } from '../services/supabaseClient';

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
    const [jobPosts, setJobPosts] = useState<JobPost[]>([]);
    const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const isDirectLink = !!jobPostId;

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [postRes, buRes] = await Promise.all([
                supabase.from('job_posts').select('*'),
                supabase.from('business_units').select('id,name'),
            ]);
            if (postRes.error) throw postRes.error;
            if (buRes.error) throw buRes.error;
            setBusinessUnits(buRes.data || []);
            setJobPosts((postRes.data || []).map((p: any) => {
                const statusRaw = (p.status || '').toString().toLowerCase();
                const status =
                    statusRaw === 'published' ? JobPostStatus.Published :
                    statusRaw === 'paused' ? JobPostStatus.Paused :
                    statusRaw === 'closed' ? JobPostStatus.Closed :
                    JobPostStatus.Draft;
                return {
                    id: p.id,
                    requisitionId: p.requisition_id,
                    businessUnitId: p.business_unit_id,
                    title: p.title,
                    slug: p.slug,
                    description: p.description,
                    requirements: p.requirements ?? '',
                    benefits: p.benefits ?? '',
                    locationLabel: p.location_label ?? '',
                    employmentType: p.employment_type,
                    status,
                    publishedAt: p.published_at ? new Date(p.published_at) : undefined,
                    channels: p.channels || { careerSite: false, qr: false, social: false, jobBoards: false },
                } as JobPost;
            }));
        } catch (err) {
            console.error('Failed to load jobs', err);
            setError('Failed to load job posts. Please try again later.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const selectedJobPost = useMemo(() => {
        if (!selectedJobPostId) return null;
        return jobPosts.find(post => post.id === selectedJobPostId) || null;
    }, [selectedJobPostId, jobPosts]);

    // Get ALL available job posts for the career site.
    const availableJobPosts = useMemo(() => {
        return jobPosts.filter(post => 
            post.status === JobPostStatus.Published &&
            post.channels?.careerSite
        );
    }, [jobPosts]);

    // Pre-fill form if accessed via a direct link
    useEffect(() => {
        if (jobPostId) {
            const post = jobPosts.find(p => p.id === jobPostId);
            if (post) {
                setSelectedBuId(post.businessUnitId);
                setSelectedJobPostId(post.id);
            }
        }
    }, [jobPostId, jobPosts]);

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


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!firstName || !lastName || !email || (!resumeLink && !resumeFile) || !selectedJobPostId) {
            setError('Please fill in your name, email, select a job, and provide a resume (upload or link).');
            return;
        }
        setIsSubmitting(true);

        const jobPost = jobPosts.find(p => p.id === selectedJobPostId);
        if (!jobPost) {
            setError('Selected job post is no longer available.');
            setIsSubmitting(false);
            return;
        }

        try {
            let resumeUrl = resumeLink;
            if (resumeFile) {
                const path = `resumes/${Date.now()}-${resumeFile.name}`;
                const { error: uploadError } = await supabase.storage.from('recruitment-uploads').upload(path, resumeFile, { upsert: false });
                if (uploadError) throw uploadError;
                resumeUrl = path;
            }

            const { data: cand, error: candErr } = await supabase.from('job_candidates').insert({
                first_name: firstName,
                last_name: lastName,
                email,
                phone: mobile,
                source: CandidateSource.CareerSite,
                portfolio_url: resumeUrl,
                tags: [],
                consent_at: new Date(),
            }).select().single();
            if (candErr) throw candErr;

            const { error: appErr } = await supabase.from('job_applications').insert({
                candidate_id: cand.id,
                job_post_id: selectedJobPostId,
                requisition_id: jobPost.requisitionId || null,
                stage: ApplicationStage.New,
                cover_letter: coverLetter,
                notes: referredBy ? `Referrer: ${referredBy}` : null,
                resume_url: resumeUrl,
            });
            if (appErr) throw appErr;

            navigate('/thank-you');
        } catch (err: any) {
            console.error('Failed to submit application', err);
            setError(err?.message || 'Failed to submit application. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
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
                                {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                            </select>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Job Application</label>
                            <select value={selectedJobPostId} onChange={e => setSelectedJobPostId(e.target.value)} disabled={isDirectLink || isLoading} required className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:bg-gray-200 dark:disabled:bg-gray-800">
                                {availableJobPosts.length > 0 ? (
                                    <>
                                        <option value="">-- Select a job post --</option>
                                        {availableJobPosts.map(post => {
                                            const bu = businessUnits.find(b => b.id === post.businessUnitId);
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
