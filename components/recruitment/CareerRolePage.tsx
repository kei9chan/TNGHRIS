import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApplicantPageTheme, JobPost } from '../../types';
import { supabase } from '../../services/supabaseClient';
import { getOpenRolesPath, isJobCurrentlyOpen, mapApplicantPageTheme, mapPublicJobPost } from '../../services/publicCareersService';

const CareerRolePage: React.FC = () => {
  const { slug, roleSlug } = useParams<{ slug: string; roleSlug: string }>();
  const [theme, setTheme] = useState<ApplicantPageTheme | null>(null);
  const [job, setJob] = useState<JobPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!slug || !roleSlug) return;
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
          .eq('business_unit_id', resolvedTheme.businessUnitId);
        if (jobsError) throw jobsError;
        const selected = (rows || []).map(mapPublicJobPost).find(candidate => candidate.slug === roleSlug || candidate.id === roleSlug);
        if (!selected || !isJobCurrentlyOpen(selected)) throw new Error('This role is no longer available.');
        if (!cancelled) {
          setTheme(resolvedTheme);
          setJob(selected);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Unable to load this role.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [slug, roleSlug]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-600">Loading role…</div>;
  if (error || !theme || !job) return <div className="min-h-screen flex items-center justify-center px-6 text-center text-gray-600">{error || 'Role not found.'}</div>;

  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: theme.backgroundColor }}>
      <header className="bg-white border-b border-gray-200"><div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4"><Link to={`/careers/${theme.slug}`} className="font-bold text-gray-900">{theme.pageTitle}</Link><Link to={getOpenRolesPath(theme.slug, theme)} className="text-sm font-semibold" style={{ color: theme.primaryColor }}>All Open Roles</Link></div></header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link to={getOpenRolesPath(theme.slug, theme)} className="text-sm font-semibold" style={{ color: theme.primaryColor }}>← Back to Open Roles</Link>
        <div className="mt-6 bg-white rounded-2xl border border-gray-200 p-6 sm:p-10 shadow-sm">
          <div className="flex flex-wrap gap-2 mb-4">{job.isFeatured && <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">Featured</span>}{job.isUrgent && <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">Urgent</span>}</div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-gray-900">{job.title}</h1>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600"><span>{job.locationLabel}</span><span>{job.employmentType}</span><span>{job.departmentLabel}</span></div>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_280px]">
            <div className="space-y-8 text-gray-700">
              {job.description && <section><h2 className="text-xl font-bold text-gray-900 mb-3">About the role</h2><div className="whitespace-pre-wrap leading-7">{job.description}</div></section>}
              {job.requirements && <section><h2 className="text-xl font-bold text-gray-900 mb-3">Requirements</h2><div className="whitespace-pre-wrap leading-7">{job.requirements}</div></section>}
              {job.benefits && <section><h2 className="text-xl font-bold text-gray-900 mb-3">Benefits</h2><div className="whitespace-pre-wrap leading-7">{job.benefits}</div></section>}
            </div>
            <aside className="lg:sticky lg:top-24 h-fit rounded-xl p-5" style={{ backgroundColor: theme.backgroundColor }}><h2 className="font-bold text-gray-900">Ready to apply?</h2><p className="mt-2 text-sm text-gray-600">Tell us why you are a great fit for this role.</p><Link to={`/apply/${job.id}`} className="mt-5 inline-flex w-full justify-center px-4 py-3 rounded-md text-white font-semibold" style={{ backgroundColor: theme.primaryColor }}>Apply Now</Link></aside>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CareerRolePage;
