import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApplicantPageTheme, JobPost } from '../../types';
import { supabase } from '../../services/supabaseClient';
import {
  getApplicationPath,
  getOpenRolesConfig,
  getOpenRolesPath,
  isJobCurrentlyOpen,
  mapApplicantPageTheme,
  mapPublicJobPost,
} from '../../services/publicCareersService';

const hasContent = (value?: string | null): value is string => Boolean(value?.trim());

const ContentSection: React.FC<{ title: string; content?: string }> = ({ title, content }) => {
  if (!hasContent(content)) return null;
  return (
    <section>
      <h2 className="text-2xl font-bold text-gray-900 mb-3">{title}</h2>
      <div className="whitespace-pre-wrap leading-7 text-gray-700">{content}</div>
    </section>
  );
};

const CareerRolePage: React.FC = () => {
  const { slug, roleSlug } = useParams<{ slug: string; roleSlug: string }>();
  const [theme, setTheme] = useState<ApplicantPageTheme | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobPost | null>(null);
  const [openJobs, setOpenJobs] = useState<JobPost[]>([]);
  const [isRoleOpen, setIsRoleOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!slug || !roleSlug) return;
      setLoading(true);
      setError('');
      try {
        const { data: themeRow, error: themeError } = await supabase
          .from('applicant_page_themes')
          .select('*')
          .eq('slug', slug)
          .eq('is_active', true)
          .maybeSingle();
        if (themeError) throw themeError;
        if (!themeRow) throw new Error('Career page not found.');

        const resolvedTheme = mapApplicantPageTheme(themeRow);
        const { data: rows, error: jobsError } = await supabase
          .from('job_posts')
          .select('*')
          .eq('business_unit_id', resolvedTheme.businessUnitId)
          .order('title', { ascending: true });
        if (jobsError) throw jobsError;

        const jobs = (rows || []).map(mapPublicJobPost);
        const candidate = jobs.find(job => job.slug === roleSlug || job.id === roleSlug) || null;
        const currentlyOpen = Boolean(candidate && isJobCurrentlyOpen(candidate));

        if (!cancelled) {
          setTheme(resolvedTheme);
          setSelectedJob(candidate);
          setIsRoleOpen(currentlyOpen);
          setOpenJobs(jobs.filter(job => isJobCurrentlyOpen(job)));
        }
      } catch (err: any) {
        console.error('Failed to load role information page', err);
        if (!cancelled) setError(err?.message || 'Unable to load this role.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [slug, roleSlug]);

  const roleDetails = selectedJob?.roleDetails || {};
  const summary = roleDetails.shortSummary || selectedJob?.description;
  const roleBenefits = roleDetails.benefits || selectedJob?.benefits;
  const roleImage = roleDetails.roleImage || theme?.heroImage;
  const openRolesPath = theme ? getOpenRolesPath(theme.slug, theme) : '#';
  const applicationPath = theme && selectedJob ? getApplicationPath(theme.slug, selectedJob, getOpenRolesConfig(theme).pageSlug) : '#';

  const faqItems = useMemo(
    () => (roleDetails.faqs || []).filter(faq => hasContent(faq.question) && hasContent(faq.answer)),
    [roleDetails.faqs]
  );

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-600">Loading role information…</div>;
  if (error || !theme) return <div className="min-h-screen flex items-center justify-center px-6 text-center text-gray-600">{error || 'Career page not found.'}</div>;

  if (!selectedJob || !isRoleOpen) {
    return (
      <div className="min-h-screen font-sans" style={{ backgroundColor: theme.backgroundColor }}>
        <header className="bg-white border-b border-gray-200"><div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4"><Link to={`/careers/${theme.slug}`} className="font-bold text-gray-900 truncate">{theme.pageTitle}</Link><Link to={openRolesPath} className="text-sm font-semibold" style={{ color: theme.primaryColor }}>Open Roles</Link></div></header>
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 sm:p-12">
            <h1 className="text-3xl font-extrabold text-gray-900">This role is no longer accepting applications</h1>
            <p className="mt-3 text-gray-600">The role may have been closed, filled, unpublished, or removed. Please explore our other open opportunities.</p>
            <Link to={openRolesPath} className="mt-7 inline-flex items-center justify-center px-5 py-3 rounded-md text-white font-semibold" style={{ backgroundColor: theme.primaryColor }}>Back to Open Roles</Link>
          </div>
          {openJobs.length > 0 && <div className="mt-10 text-left"><h2 className="text-xl font-bold text-gray-900">Other open roles</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{openJobs.slice(0, 4).map(job => <Link key={job.id} to={`/careers/${theme.slug}/roles/${encodeURIComponent(job.slug || job.id)}`} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm"><span className="font-semibold text-gray-900">{job.title}</span><span className="block mt-1 text-sm text-gray-600">{job.locationLabel} · {job.employmentType}</span></Link>)}</div></div>}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: theme.backgroundColor }}>
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-200"><div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4"><Link to={`/careers/${theme.slug}`} className="font-bold text-gray-900 truncate">{theme.pageTitle}</Link><nav className="flex items-center gap-3 sm:gap-5 text-sm font-semibold"><Link to={openRolesPath} className="text-gray-600 hover:text-gray-900">Open Roles</Link><Link to={applicationPath} className="hidden sm:inline-flex px-4 py-2 rounded-md text-white" style={{ backgroundColor: theme.primaryColor }}>Apply Now</Link></nav></div></header>
      <main>
        <section className="bg-white"><div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14"><div className="flex flex-wrap items-center gap-2 text-sm text-gray-500"><Link to={openRolesPath} className="hover:underline" style={{ color: theme.primaryColor }}>Open Roles</Link><span aria-hidden="true">/</span><span className="truncate">{selectedJob.title}</span></div><div className="mt-8 grid lg:grid-cols-[1fr_340px] gap-10 items-start"><div><div className="flex flex-wrap gap-2 mb-4">{selectedJob.isFeatured && <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">Featured</span>}{selectedJob.isUrgent && <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">Urgent</span>}</div><h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-gray-900">{selectedJob.title}</h1>{hasContent(summary) && <p className="mt-5 max-w-3xl text-lg leading-8 text-gray-600 whitespace-pre-wrap">{summary}</p>}<div className="mt-7 flex flex-wrap gap-2 text-sm">{[['Location', selectedJob.locationLabel], ['Employment type', selectedJob.employmentType], ['Department', selectedJob.departmentLabel], ['Work arrangement', roleDetails.workArrangement], ['Salary', roleDetails.salaryRange]].map(([label, value]) => hasContent(value) ? <span key={label} className="rounded-full bg-gray-100 px-3 py-1.5 text-gray-700"><strong>{label}:</strong> {value}</span> : null)}</div></div>{roleImage && <img src={roleImage} alt="" className="w-full h-56 lg:h-64 object-cover rounded-2xl" />}</div></div></section>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid lg:grid-cols-[1fr_320px] gap-10 items-start"><article className="space-y-10">{hasContent(roleDetails.shortSummary) && <ContentSection title="About this role" content={selectedJob.description} />}<ContentSection title="Why This Role Matters" content={roleDetails.whyThisRoleMatters} /><ContentSection title="What You’ll Do" content={roleDetails.responsibilities} /><ContentSection title="What We’re Looking For" content={roleDetails.qualifications || selectedJob.requirements} /><ContentSection title="Required Experience" content={roleDetails.requiredExperience} /><ContentSection title="Preferred Experience" content={roleDetails.preferredExperience} /><ContentSection title="What You Get" content={roleBenefits} />{faqItems.length > 0 && <section><h2 className="text-2xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2><div className="space-y-3">{faqItems.map(faq => <details key={faq.id} className="rounded-xl border border-gray-200 bg-white p-4"><summary className="cursor-pointer font-semibold text-gray-900">{faq.question}</summary><p className="mt-3 whitespace-pre-wrap leading-7 text-gray-700">{faq.answer}</p></details>)}</div></section>}</article><aside className="lg:sticky lg:top-24 rounded-2xl bg-white border border-gray-200 shadow-sm p-6"><h2 className="text-xl font-bold text-gray-900">Ready to join us?</h2><p className="mt-2 text-sm leading-6 text-gray-600">Apply directly for <strong>{selectedJob.title}</strong>. Your application will stay connected to this role.</p><Link to={applicationPath} className="mt-6 inline-flex w-full justify-center px-4 py-3 rounded-md text-white font-semibold" style={{ backgroundColor: theme.primaryColor }}>Apply for this Role</Link><Link to={openRolesPath} className="mt-3 inline-flex w-full justify-center px-4 py-3 rounded-md border font-semibold" style={{ borderColor: theme.primaryColor, color: theme.primaryColor }}>Back to Open Roles</Link></aside></div>
        <section className="py-12" style={{ backgroundColor: theme.primaryColor }}><div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5"><div className="text-white"><h2 className="text-2xl font-extrabold">Think this could be your next role?</h2><p className="mt-1 text-white/80">Start your application for {selectedJob.title} today.</p></div><Link to={applicationPath} className="inline-flex items-center justify-center px-5 py-3 rounded-md bg-white font-bold" style={{ color: theme.primaryColor }}>Start Application</Link></div></section>
      </main>
    </div>
  );
};

export default CareerRolePage;
