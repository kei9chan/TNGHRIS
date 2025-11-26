
import React, { useState } from 'react';
import { InterviewFeedback, HireRecommendation } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';

interface InterviewFeedbackFormProps {
    interviewId: string;
    onSubmit: (feedback: InterviewFeedback) => void;
}

const StarRating: React.FC<{rating: number, setRating: (r: number) => void, readOnly?: boolean}> = ({ rating, setRating, readOnly = false }) => {
    return (
        <div className="flex space-x-1">
            {[1, 2, 3, 4, 5].map(star => (
                <button 
                    key={star} 
                    type="button" 
                    onClick={() => !readOnly && setRating(star)} 
                    disabled={readOnly}
                    className={`text-2xl focus:outline-none ${star <= rating ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'} ${readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110 transition-transform'}`}
                >
                    ★
                </button>
            ))}
        </div>
    );
};

const competencies = [
    "Technical Skills / Role Knowledge",
    "Communication Skills",
    "Problem Solving",
    "Cultural Fit & Values",
    "Enthusiasm & Motivation"
];

const InterviewFeedbackForm: React.FC<InterviewFeedbackFormProps> = ({ interviewId, onSubmit }) => {
    const { user } = useAuth();
    const [score, setScore] = useState(0);
    const [strengths, setStrengths] = useState('');
    const [concerns, setConcerns] = useState('');
    const [hireRecommendation, setHireRecommendation] = useState<HireRecommendation>(HireRecommendation.Maybe);
    
    // Competency Scores State
    const [competencyScores, setCompetencyScores] = useState<Record<string, number>>(
        competencies.reduce((acc, curr) => ({...acc, [curr]: 0}), {})
    );

    const handleCompetencyChange = (comp: string, rating: number) => {
        setCompetencyScores(prev => ({...prev, [comp]: rating}));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validation
        const missingCompetencies = competencies.filter(c => competencyScores[c] === 0);

        if (!user || score === 0 || !strengths || !concerns) {
            alert('Please provide an overall score and fill in text fields.');
            return;
        }
        
        if (missingCompetencies.length > 0) {
            alert(`Please rate all competencies: ${missingCompetencies.join(', ')}`);
            return;
        }
        
        const feedback: any = { // Using any to build object before casting
            interviewId,
            reviewerUserId: user.id,
            score,
            competencyScores,
            strengths,
            concerns,
            hireRecommendation,
            submittedAt: new Date(),
        };
        
        onSubmit(feedback);
    };

    return (
        <form onSubmit={handleSubmit} className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 space-y-6">
            <div>
                <h4 className="font-bold text-lg text-gray-900 dark:text-white mb-4">Interview Scorecard</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {competencies.map(comp => (
                        <div key={comp} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-md border dark:border-gray-700">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-0">{comp}</span>
                            <StarRating rating={competencyScores[comp]} setRating={(r) => handleCompetencyChange(comp, r)} />
                        </div>
                    ))}
                </div>
            </div>

            <hr className="dark:border-gray-700" />
            
            <div className="space-y-4">
                 <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <label className="block text-sm font-bold text-gray-900 dark:text-white w-32">Overall Score</label>
                    <StarRating rating={score} setRating={setScore} />
                 </div>
                 
                 <Textarea label="Strengths / Pros" id="strengths" value={strengths} onChange={e => setStrengths(e.target.value)} rows={3} required placeholder="What stood out positively?" />
                 <Textarea label="Concerns / Cons" id="concerns" value={concerns} onChange={e => setConcerns(e.target.value)} rows={3} required placeholder="Any areas of hesitation?" />
                 
                 <div>
                    <label htmlFor="hireRecommendation" className="block text-sm font-bold text-gray-900 dark:text-white mb-1">Final Recommendation</label>
                    <select 
                        id="hireRecommendation" 
                        value={hireRecommendation} 
                        onChange={e => setHireRecommendation(e.target.value as HireRecommendation)} 
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                        {Object.values(HireRecommendation).map(rec => <option key={rec} value={rec}>{rec}</option>)}
                    </select>
                </div>
            </div>

            <div className="flex justify-end pt-4 border-t dark:border-gray-700">
                <Button type="submit" size="lg">Submit Evaluation</Button>
            </div>
        </form>
    );
};

export default InterviewFeedbackForm;
