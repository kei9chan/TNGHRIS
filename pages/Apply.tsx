import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { getApplicationPath, getOpenRolesConfig, isJobCurrentlyOpen, mapApplicantPageTheme, mapPublicJobPost } from '../services/publicCareersService';

type Choice = { id: string; title: string; business: string; path: string };

// Keep previously shared /apply links working. Every visitor now reaches the
// same business-unit form and atomic submission endpoint as the careers site.
export default function Apply() {
  const { jobPostId } = useParams<{ jobPostId?: string }>();
  const [search] = useSearchParams();
  const preferredCareer = search.get('career');
  const [choices, setChoices] = useState<Choice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const load = async () => {
      try {
        const [posts, pages] = await Promise.all([
          supabase.from('job_posts').select('*').order('title'),
          supabase.from('applicant_page_themes').select('*').eq('is_active', true).order('slug'),
        ]);
        if (posts.error || pages.error) throw posts.error || pages.error;
        const themes = (pages.data || []).map(mapApplicantPageTheme);
        const available = (posts.data || []).map(mapPublicJobPost).filter(job => isJobCurrentlyOpen(job)).flatMap(job => {
          const unitThemes = themes.filter(theme => theme.businessUnitId === job.businessUnitId);
          const theme = unitThemes.find(page => page.slug === preferredCareer) || unitThemes[0];
          return theme ? [{ id: job.id, title: job.title, business: theme.pageTitle || theme.name, path: getApplicationPath(theme.slug, job, getOpenRolesConfig(theme).pageSlug) }] : [];
        });
        if (active) setChoices(available);
      } catch {
        if (active) setError('Open roles could not be loaded. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [preferredCareer, attempt]);

  if (loading) return <p role="status" className="p-8 text-center">Loading application…</p>;
  const selected = !error && choices.find(job => job.id === jobPostId);
  if (selected) return <Navigate replace to={selected.path} />;
  return <main className="mx-auto max-w-2xl space-y-4 p-6">
    <h1 className="text-2xl font-bold">{jobPostId && !error ? 'This role is no longer accepting applications' : 'Apply for an open role'}</h1>
    {error ? <p role="alert">{error} <button type="button" onClick={() => setAttempt(value => value + 1)} className="underline">Retry</button></p>
      : choices.length ? <ul className="space-y-2">{choices.map(job => <li key={job.id}>
        <Link to={job.path} className="block rounded-lg border p-3 text-indigo-700 underline dark:text-indigo-300">{job.title} · {job.business}</Link>
      </li>)}</ul> : <p>There are no open positions at the moment.</p>}
  </main>;
}
