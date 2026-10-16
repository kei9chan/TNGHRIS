import React from 'react';
import { getNTEAllegationPreview } from '../../utils/nteApprovalPreview';

export default function NTEApprovalPreview({ category, details }: { category?: string; details?: string }) {
  const { fullText, preview, truncated } = getNTEAllegationPreview(details);
  return <div className="space-y-2 break-words text-sm text-slate-700 dark:text-slate-200">
    <p className="font-semibold text-slate-900 dark:text-white">{category || 'Notice to Explain'}</p>
    <p>{preview || 'No allegation preview available. Review the notice for details.'}</p>
    {truncated && <details className="rounded-lg border border-slate-200 p-2 dark:border-slate-600"><summary className="min-h-11 cursor-pointer py-2 font-semibold text-indigo-600 dark:text-indigo-300">Show full allegations</summary><p className="mt-2">{fullText}</p></details>}
  </div>;
}
