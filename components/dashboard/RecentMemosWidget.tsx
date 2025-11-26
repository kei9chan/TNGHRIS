import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Memo } from '../../types';
import { mockMemos } from '../../services/mockData';
import { useAuth } from '../../hooks/useAuth';
import Card from '../ui/Card';

interface RecentMemosWidgetProps {
    onViewMemo: (memo: Memo) => void;
}

const ArrowRightIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>;

const RecentMemosWidget: React.FC<RecentMemosWidgetProps> = ({ onViewMemo }) => {
    const { user } = useAuth();

    const { recentMemos, actionRequiredCount } = useMemo(() => {
        if (!user) return { recentMemos: [], actionRequiredCount: 0 };

        const publishedMemos = mockMemos
            .filter(memo => memo.status === 'Published')
            .sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());
        
        const memosForDisplay = publishedMemos.slice(0, 3).map(memo => ({
            ...memo,
            needsAcknowledgement: memo.acknowledgementRequired && !memo.acknowledgementTracker.includes(user.id)
        }));

        const count = publishedMemos.filter(memo => memo.acknowledgementRequired && !memo.acknowledgementTracker.includes(user.id)).length;

        return { recentMemos: memosForDisplay, actionRequiredCount: count };
    }, [user]);

    return (
        <Card title="Recent Memos & Announcements">
            <div className="space-y-4">
                {recentMemos.map(memo => (
                    <div key={memo.id} onClick={() => onViewMemo(memo)} className="p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700/50 cursor-pointer">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="font-semibold text-gray-800 dark:text-gray-200">{memo.title}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Effective: {new Date(memo.effectiveDate).toLocaleDateString()}</p>
                            </div>
                            {memo.needsAcknowledgement && (
                                <span className="flex-shrink-0 px-2 py-1 text-xs font-bold text-red-800 bg-red-100 dark:text-red-200 dark:bg-red-900/50 rounded-full">
                                    ACTION REQUIRED
                                </span>
                            )}
                        </div>
                    </div>
                ))}
                {recentMemos.length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No recent memos to display.</p>
                )}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Link to="/feedback/memos" className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center justify-end">
                    View All Memos ({actionRequiredCount} for review)
                    <ArrowRightIcon />
                </Link>
            </div>
        </Card>
    );
};

export default RecentMemosWidget;
