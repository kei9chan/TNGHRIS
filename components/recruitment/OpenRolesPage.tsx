import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApplicantPageTheme, JobPost } from '../../types';
import { supabase } from '../../services/supabaseClient';
import {
  getOpenRolesConfig,
  isJobCurrentlyOpen,
  mapApplicantPageTheme,
  mapPublicJobPost,
  getRolePath,
  getApplicationPath,
} from '../../services/publicCareersService';

const RocketIcon = ({ className = 'h-6 w-6' }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
const SmileIcon = ({ className = 'h-6 w-6' }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const WalletIcon = ({ className = 'h-6 w-6' }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>;
const HeartIcon = ({ className = 'h-6 w-6' }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>;
const StarIcon = ({ className = 'h-6 w-6' }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-1.302 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>;

const iconMap = { rocket: RocketIcon, smile: SmileIcon, wallet: WalletIcon, heart: HeartIcon, star: StarIcon };

const stripMarkup = (value: string): string => {
  if (!value) return '';
  const el = document.createElement('div');
  el.innerHTML = value;
  return (el.textContent || el.innerText || '').replace(/\s+/g, ' ').trim();
};

const OpenRolesPage: React.FC = () => {
  const { slug, subpage } = useParams<{ slug: string; subpage?: string }>();
  const [theme, setTheme] = useState<ApplicantPageTheme | null>(null);
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!slug) return;
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
        const config = getOpenRolesConfig(resolvedTheme);
        if (subpage && subpage !== config.pageSlug) {
          throw new Error('Open roles page not found.');
        }
        if (!config.enabled || !config.published) {
          throw new Error('Open roles are not currently published.');
        }

        const { data: jobRows, error: jobsError } = await supabase
          .from('job_posts')
          .select('*')
          .eq('business_unit_id', resolvedTheme.businessUnitId)
          .order('title', { ascending: true });
        if (jobsError) throw jobsError;

        if (!cancelled) {
          setTheme(resolvedTheme);
          setJobs((jobRows || []).map(mapPublicJobPost));
        }
      } catch (err: any) {
        console.error('Failed to load open roles page', err);
        if (!cancelled) setError(err?.message || 'Unable to load open roles.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [slug, subpage]);

  const config = theme ? getOpenRolesConfig(theme) : null;
  const openJobs = useMemo(() => jobs.filter(job => isJobCurrentlyOpen(job)), [jobs]);
  const departments = useMemo(() => [...new Set(openJobs.map(job => job.departmentLabel || 'Department not specified'))].sort(), [openJobs]);
  const locations = useMemo(() => [...new Set(openJobs.map(job => job.locationLabel))].sort(), [openJobs]);
  const employmentTypes = useMemo(() => [...new Set(openJobs.map(job => job.employmentType))].sort(), [openJobs]);

  const filteredJobs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return openJobs.filter(job => {
      const searchable = [job.title, job.description, job.requirements, job.departmentLabel, job.locationLabel, job.employmentType].join(' ').toLowerCase();
      return (!term || searchable.includes(term))
        && (!department || job.departmentLabel === department)
        && (!location || job.locationLabel === location)
        && (!employmentType || job.employmentType === employmentType);
    });
  }, [openJobs, search, department, location, employmentType]);

  const clearFilters = () => {
    setSearch('');
    setDepartment('');
    setLocation('');
    setEmploymentType('');
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-600">Loading open roles…</div>;
  if (error || !theme || !config) return <div className="min-h-screen flex items-center justify-center px-6 text-center text-gray-600">{error || 'Open roles are not available.'}</div>;

  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: theme.backgroundColor }}>
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-5">
          <Link to={`/careers/${theme.slug}`} className="flex items-center gap-3 min-w-0">
            {theme.logoImage ? <img src={theme.logoImage} alt="" className="h-9 w-9 rounded object-contain" /> : <span className="h-9 w-9 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: theme.primaryColor }}>+</span>}
            <span className="font-bold text-gray-900 truncate">{theme.pageTitle}</span>
          </Link>
          <nav className="flex items-center gap-3 sm:gap-6 text-sm font-medium">
            <Link to={`/careers/${theme.slug}`} className="text-gray-600 hover:text-gray-900">Home</Link>
            <a href="#open-roles-list" className="font-semibold" style={{ color: theme.primaryColor }}>{config.navigationLabel}</a>
            <a href="#open-roles-list" className="hidden sm:inline-flex px-4 py-2 rounded-md text-white" style={{ backgroundColor: theme.primaryColor }}>Apply Now</a>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] mb-4" style={{ color: theme.primaryColor }}>{theme.pageTitle}</p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-gray-900">{config.heroHeadline}</h1>
            <p className="mt-5 text-lg text-gray-600 max-w-xl">{config.heroDescription}</p>
          </div>
          <div className="rounded-2xl overflow-hidden min-h-64 lg:min-h-80" style={{ backgroundColor: theme.primaryColor }}>
            {config.heroImage ? <img src={config.heroImage} alt="Open roles" className="w-full h-full min-h-64 lg:min-h-80 object-cover" /> : <div className="min-h-64 lg:min-h-80 flex items-center justify-center text-white text-5xl font-black opacity-80">JOIN US</div>}
          </div>
        </div>
      </section>

      <section className="bg-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {config.benefits.map(benefit => {
            const Icon = iconMap[benefit.icon] || StarIcon;
            return <div key={benefit.id} className="flex gap-4 p-5 rounded-xl border border-gray-100 shadow-sm">
              <span className="flex-shrink-0 h-11 w-11 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: theme.primaryColor }}><Icon /></span>
              <div><h2 className="font-bold text-gray-900">{benefit.title}</h2><p className="mt-1 text-sm text-gray-600">{benefit.description}</p></div>
            </div>;
          })}
        </div>
      </section>

      <main id="open-roles-list" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-7">
          <div><p className="text-sm font-semibold" style={{ color: theme.primaryColor }}>OPPORTUNITIES</p><h2 className="mt-1 text-3xl font-extrabold text-gray-900">Find your next role</h2></div>
          <div className="flex items-center gap-4">
            <p className="text-sm text-gray-600">{filteredJobs.length} {filteredJobs.length === 1 ? 'role' : 'roles'} available</p>
            <Link
              to={`/careers/${encodeURIComponent(theme.slug)}/apply?openRoles=${encodeURIComponent(config.pageSlug)}`}
              className="text-sm font-semibold hover:underline"
              style={{ color: theme.primaryColor }}
            >
              Submit General Application
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-sm grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search roles" className="lg:col-span-2 rounded-md border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" />
          <select value={department} onChange={e => setDepartment(e.target.value)} className="rounded-md border-gray-300 px-3 py-2 text-sm"><option value="">All departments</option>{departments.map(value => <option key={value} value={value}>{value}</option>)}</select>
          <select value={location} onChange={e => setLocation(e.target.value)} className="rounded-md border-gray-300 px-3 py-2 text-sm"><option value="">All locations</option>{locations.map(value => <option key={value} value={value}>{value}</option>)}</select>
          <select value={employmentType} onChange={e => setEmploymentType(e.target.value)} className="rounded-md border-gray-300 px-3 py-2 text-sm"><option value="">All employment types</option>{employmentTypes.map(value => <option key={value} value={value}>{value}</option>)}</select>
          {(search || department || location || employmentType) && <button onClick={clearFilters} className="md:col-span-2 lg:col-span-5 justify-self-start text-sm font-semibold text-gray-600 hover:text-gray-900">Clear Filters</button>}
        </div>

        {filteredJobs.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-200 p-10 text-center">
            <h3 className="text-xl font-bold text-gray-900">No open roles at the moment</h3>
            <p className="mt-2 text-gray-600">Please check back soon or submit a general application.</p>
            <Link
              to={`/careers/${encodeURIComponent(theme.slug)}/apply?openRoles=${encodeURIComponent(config.pageSlug)}`}
              className="mt-5 inline-flex items-center justify-center px-4 py-2 rounded-md text-white font-semibold text-sm"
              style={{ backgroundColor: theme.primaryColor }}
            >
              Submit General Application
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredJobs.map(job => (
              <article key={job.id} className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col">
                <div className="flex flex-wrap gap-2 mb-4">
                  {job.isFeatured && <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">Featured</span>}
                  {job.isUrgent && <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">Urgent</span>}
                </div>
                <h3 className="text-xl font-bold text-gray-900">{job.title}</h3>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600"><span>{job.locationLabel}</span><span>{job.employmentType}</span><span>{job.departmentLabel}</span></div>
                <p className="mt-4 text-sm leading-6 text-gray-600 flex-grow">{stripMarkup(job.description).slice(0, 220)}{stripMarkup(job.description).length > 220 ? '…' : ''}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link to={getRolePath(theme.slug, job)} className="inline-flex items-center justify-center px-4 py-2 rounded-md border font-semibold text-sm" style={{ borderColor: theme.primaryColor, color: theme.primaryColor }}>View Role</Link>
                  <Link to={getApplicationPath(theme.slug, job, config.pageSlug)} className="inline-flex items-center justify-center px-4 py-2 rounded-md text-white font-semibold text-sm" style={{ backgroundColor: theme.primaryColor }}>Apply Now</Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <footer className="bg-gray-900 text-white py-8"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between gap-3"><p className="font-bold">{theme.pageTitle}</p>{theme.contactEmail && <a href={`mailto:${theme.contactEmail}`} className="text-gray-300 hover:text-white">{theme.contactEmail}</a>}</div></footer>
    </div>
  );
};

export default OpenRolesPage;
