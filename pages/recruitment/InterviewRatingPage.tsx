import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Candidate, InterviewRatingRecord } from '../../types';
import { fetchInterviewRating, fetchInterviewRatingCandidate } from '../../services/interviewRatingService';
import InterviewRatingEditor from '../../components/recruitment/InterviewRatingEditor';

const InterviewRatingPage: React.FC = () => {
  const { ratingId } = useParams<{ ratingId: string }>();
  const navigate = useNavigate();
  const [rating, setRating] = useState<InterviewRatingRecord | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(async () => {
    if (!ratingId) {
      setErrorMessage('This rating link is missing its record ID.');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage('');
    try {
      const loadedRating = await fetchInterviewRating(ratingId);
      const loadedCandidate = await fetchInterviewRatingCandidate(ratingId);
      setRating(loadedRating);
      setCandidate(loadedCandidate);
    } catch (error: any) {
      console.error('Failed to load interview rating', error);
      setErrorMessage('This rating is unavailable or not assigned to your account.');
    } finally {
      setIsLoading(false);
    }
  }, [ratingId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><Link to="/recruitment/candidates" className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-300">← Back to Candidates</Link><h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">Interview Rating</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Secure reviewer form and versioned submission record.</p></div><Button variant="secondary" onClick={() => navigate(-1)}>Back</Button></div>
      {isLoading ? <Card><p className="text-slate-500">Loading rating…</p></Card> : errorMessage ? <Card><div className="py-8 text-center"><p className="font-semibold text-red-700 dark:text-red-300">{errorMessage}</p><p className="mt-2 text-sm text-slate-500">Ask HR to confirm the assignment or use the link from your notification.</p></div></Card> : rating && candidate ? <InterviewRatingEditor rating={rating} candidate={candidate} onUpdated={setRating} /> : null}
    </div>
  );
};

export default InterviewRatingPage;
