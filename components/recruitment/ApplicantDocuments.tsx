import React from 'react';
import type { Application } from '../../types';
import { applicantDocumentLinks } from '../../services/applicantDocuments';
import { supabase } from '../../services/supabaseClient';

export default function ApplicantDocuments({ applications, portfolio, linkedin }: { applications: Application[]; portfolio?: string; linkedin?: string }) {
  const documents = applicantDocumentLinks(applications, portfolio, linkedin, path => supabase.storage.from('recruitment-uploads').getPublicUrl(path).data.publicUrl);
  return <section>
    <h3 className="mb-2 border-b pb-2 text-lg font-medium text-slate-900 dark:border-slate-700 dark:text-white">Resumes and portfolio</h3>
    {documents.length ? <ul className="flex flex-wrap gap-3">{documents.map(document => <li key={document.url}>
      <a className="inline-flex min-h-11 items-center rounded-lg border border-indigo-200 px-3 text-sm font-semibold text-indigo-700 underline dark:border-indigo-700 dark:text-indigo-300" href={document.url} target="_blank" rel="noopener noreferrer">Open {document.label.toLowerCase()}</a>
    </li>)}</ul> : <p className="text-sm text-slate-500 dark:text-slate-400">No resume or portfolio link was recorded.</p>}
  </section>;
}
