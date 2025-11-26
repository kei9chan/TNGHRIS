
import React, { useState } from 'react';
import { ApplicantPageTheme, JobPost, JobPostStatus } from '../../types';
import { mockJobPosts, mockApplicantPageThemes, mockBusinessUnits } from '../../services/mockData';
import { useParams, Link } from 'react-router-dom';
import Modal from '../ui/Modal';
import PublicJobApplicationForm from './PublicJobApplicationForm';

interface CareerPagePreviewProps {
    theme?: ApplicantPageTheme;
    isPublic?: boolean;
    isPreview?: boolean;
}

// Icons
const RocketIcon = ({className}: any) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
const SmileIcon = ({className}: any) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const WalletIcon = ({className}: any) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>;
const HeartIcon = ({className}: any) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>;
const StarIcon = ({className}: any) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>;

const iconMap = {
    rocket: RocketIcon,
    smile: SmileIcon,
    wallet: WalletIcon,
    heart: HeartIcon,
    star: StarIcon,
};

const CareerPagePreview: React.FC<CareerPagePreviewProps> = ({ theme: propTheme, isPublic, isPreview }) => {
    const { slug } = useParams<{ slug: string }>();
    const [selectedJob, setSelectedJob] = useState<JobPost | null>(null);
    const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
    
    // Find theme from mock data if accessed via public route
    const theme = propTheme || mockApplicantPageThemes.find(t => t.slug === slug);

    if (!theme) {
        return <div className="p-10 text-center">Page not found.</div>;
    }

    const openJobs = mockJobPosts.filter(post => {
        // Strictly match jobs to this theme's Business Unit
        // This ensures jobs from other BUs do not appear here.
        return post.businessUnitId === theme.businessUnitId && post.status === JobPostStatus.Published;
    });

    const handleApplyClick = (job: JobPost) => {
        if (isPreview) return;
        setSelectedJob(job);
    };

    const handleApplicationSuccess = () => {
        setSelectedJob(null);
        setIsSuccessModalOpen(true);
    };

    const scrollToJobs = () => {
        const element = document.getElementById('jobs');
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    };

    return (
        <div className="min-h-screen font-sans" style={{ backgroundColor: theme.backgroundColor }}>
            {/* Public Nav for Context */}
            {isPublic && (
                <div className="bg-white shadow p-4 flex justify-between items-center sticky top-0 z-50">
                    <span className="font-bold text-xl text-gray-800">{theme.pageTitle}</span>
                    <Link to="/login" className="text-sm text-blue-600 hover:underline">Admin Login</Link>
                </div>
            )}

            {/* HERO */}
            <div className="relative bg-white overflow-hidden">
                <div className="max-w-7xl mx-auto">
                    <div className="relative z-10 pb-8 bg-white sm:pb-16 md:pb-20 lg:max-w-2xl lg:w-full lg:pb-28 xl:pb-32" style={{ backgroundColor: theme.backgroundColor }}>
                        <main className="mt-10 mx-auto max-w-7xl px-4 sm:mt-12 sm:px-6 md:mt-16 lg:mt-20 lg:px-8 xl:mt-28">
                            <div className="sm:text-center lg:text-left">
                                <h1 className="text-4xl tracking-tight font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
                                    <span className="block xl:inline" style={{ color: theme.primaryColor }}>{theme.heroHeadline}</span>
                                </h1>
                                <p className="mt-3 text-base text-gray-500 sm:mt-5 sm:text-lg sm:max-w-xl sm:mx-auto md:mt-5 md:text-xl lg:mx-0">
                                    {theme.heroDescription}
                                </p>
                                <div className="mt-5 sm:mt-8 sm:flex sm:justify-center lg:justify-start">
                                    <div className="rounded-md shadow">
                                        <button 
                                            onClick={scrollToJobs}
                                            className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white md:py-4 md:text-lg transition-transform hover:scale-105"
                                            style={{ backgroundColor: theme.primaryColor }}
                                        >
                                            View Open Roles
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </main>
                    </div>
                </div>
                <div className="lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2">
                    {theme.heroImage ? (
                        <img
                            className="h-56 w-full object-cover sm:h-72 md:h-96 lg:w-full lg:h-full"
                            src={theme.heroImage}
                            alt="Hero"
                        />
                    ) : (
                        <div className="h-56 w-full sm:h-72 md:h-96 lg:w-full lg:h-full flex items-center justify-center" style={{ backgroundColor: theme.primaryColor, opacity: 0.1 }}>
                            <span className="text-4xl font-bold opacity-20 uppercase tracking-widest transform -rotate-12">Join Us!</span>
                        </div>
                    )}
                </div>
            </div>

            {/* BENEFITS */}
            <div className="py-12 bg-white">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="lg:text-center">
                        <h2 className="text-base font-semibold tracking-wide uppercase" style={{ color: theme.primaryColor }}>Why Join Us?</h2>
                        <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                            A better way to work
                        </p>
                    </div>

                    <div className="mt-10">
                        <dl className="space-y-10 md:space-y-0 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-10">
                            {theme.benefits.map((benefit) => {
                                const IconComponent = iconMap[benefit.icon as keyof typeof iconMap] || StarIcon;
                                return (
                                    <div key={benefit.id} className="relative">
                                        <dt>
                                            <div className="absolute flex items-center justify-center h-12 w-12 rounded-md text-white" style={{ backgroundColor: theme.primaryColor }}>
                                                <IconComponent className="h-6 w-6" />
                                            </div>
                                            <p className="ml-16 text-lg leading-6 font-medium text-gray-900">{benefit.title}</p>
                                        </dt>
                                        <dd className="mt-2 ml-16 text-base text-gray-500">
                                            {benefit.description}
                                        </dd>
                                    </div>
                                )
                            })}
                        </dl>
                    </div>
                </div>
            </div>

            {/* JOBS */}
            <div id="jobs" className="py-12" style={{ backgroundColor: theme.backgroundColor }}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                     <h2 className="text-3xl font-extrabold text-gray-900 mb-8">Current Openings</h2>
                     {openJobs.length === 0 ? (
                         <p className="text-gray-600">No open positions for {mockBusinessUnits.find(b => b.id === theme.businessUnitId)?.name} at the moment. Please check back later.</p>
                     ) : (
                         <div className="grid gap-6 lg:grid-cols-2">
                             {openJobs.map(job => (
                                 <div key={job.id} className="bg-white overflow-hidden shadow rounded-lg divide-y divide-gray-200 hover:shadow-lg transition-shadow">
                                     <div className="px-4 py-5 sm:p-6">
                                         <h3 className="text-lg leading-6 font-medium text-gray-900">{job.title}</h3>
                                         <div className="mt-2 max-w-xl text-sm text-gray-500">
                                             <p>{job.locationLabel} • {job.employmentType}</p>
                                         </div>
                                         <div className="mt-5">
                                             <button 
                                                onClick={() => handleApplyClick(job)}
                                                className="inline-flex items-center justify-center px-4 py-2 border border-transparent font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 sm:text-sm transition-colors"
                                            >
                                                 Apply Now
                                             </button>
                                         </div>
                                     </div>
                                 </div>
                             ))}
                         </div>
                     )}
                </div>
            </div>

            {/* FOOTER */}
            <footer className="bg-gray-800 text-white py-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center">
                    <div className="mb-4 md:mb-0">
                        <h3 className="text-lg font-bold">{theme.pageTitle}</h3>
                        <p className="text-gray-400 text-sm">Powered by TNG HRIS</p>
                    </div>
                    <div>
                        {theme.contactEmail && <p className="text-gray-300">Contact: <a href={`mailto:${theme.contactEmail}`} className="hover:text-white underline">{theme.contactEmail}</a></p>}
                    </div>
                </div>
            </footer>

            {/* APPLICATION MODAL */}
            {selectedJob && (
                <Modal
                    isOpen={!!selectedJob}
                    onClose={() => setSelectedJob(null)}
                    title={`Apply for ${selectedJob.title}`}
                    size="lg"
                >
                    <PublicJobApplicationForm 
                        jobPost={selectedJob}
                        onClose={() => setSelectedJob(null)}
                        onSuccess={handleApplicationSuccess}
                    />
                </Modal>
            )}

            {/* SUCCESS MODAL */}
            <Modal
                isOpen={isSuccessModalOpen}
                onClose={() => setIsSuccessModalOpen(false)}
                title="Application Submitted"
            >
                <div className="text-center py-6">
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                        <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">Success!</h3>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        Your application has been successfully submitted. Our team will review your details and get back to you shortly.
                    </p>
                    <div className="mt-6">
                        <button
                            onClick={() => setIsSuccessModalOpen(false)}
                            className="inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default CareerPagePreview;
