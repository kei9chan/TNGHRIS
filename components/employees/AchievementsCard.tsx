import React, { useMemo, useState, useEffect, useRef } from 'react';
import Card from '../ui/Card';
import { mockAwards, mockEmployeeAwards } from '../../services/mockData';
import { BadgeLevel } from '../../types';

interface AchievementsCardProps {
    employeeId: string;
}

const levelStyles = {
    [BadgeLevel.Bronze]: {
        borderColor: 'border-amber-600',
        textColor: 'text-amber-600',
        bgColor: 'bg-amber-600/10',
    },
    [BadgeLevel.Silver]: {
        borderColor: 'border-slate-400',
        textColor: 'text-slate-400',
        bgColor: 'bg-slate-400/10',
    },
    [BadgeLevel.Gold]: {
        borderColor: 'border-yellow-400',
        textColor: 'text-yellow-400',
        bgColor: 'bg-yellow-400/10',
    },
};

const AchievementsCard: React.FC<AchievementsCardProps> = ({ employeeId }) => {
    const achievements = useMemo(() => {
        return mockEmployeeAwards
            .filter(ea => ea.employeeId === employeeId)
            .map(ea => {
                const awardDetails = mockAwards.find(a => a.id === ea.awardId);
                return {
                    ...ea,
                    title: awardDetails?.title || 'Unknown Award',
                    badgeIconUrl: awardDetails?.badgeIconUrl,
                };
            })
            .sort((a, b) => new Date(b.dateAwarded).getTime() - new Date(a.dateAwarded).getTime());
    }, [employeeId]);
    
    const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);
    const prevCountRef = useRef(achievements.length);

    useEffect(() => {
        if (achievements.length > prevCountRef.current) {
            const newAchievement = achievements[0];
            setNewlyAddedId(newAchievement.id);

            const timer = setTimeout(() => {
                setNewlyAddedId(null);
            }, 1000);

            return () => clearTimeout(timer);
        }
        prevCountRef.current = achievements.length;
    }, [achievements]);


    return (
        <Card title="My Achievements" className="!p-0">
            <div id="achievements" className="p-6">
                {achievements.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {achievements.map(ach => {
                            const styles = levelStyles[ach.level];
                            return (
                                <div 
                                    key={ach.id} 
                                    className={`
                                        flex flex-col items-center text-center p-3 rounded-lg border-2 
                                        ${styles.borderColor} ${styles.bgColor}
                                        transition-all duration-300 transform hover:scale-105
                                        ${ach.id === newlyAddedId ? 'animate-pop-bounce' : ''}
                                    `}
                                    title={`${ach.notes} - Awarded on ${new Date(ach.dateAwarded).toLocaleDateString()}`}
                                >
                                    {ach.badgeIconUrl ? (
                                        <img src={ach.badgeIconUrl} alt={ach.title} className="w-16 h-16 mb-2" />
                                    ) : (
                                        <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center mb-2">?</div>
                                    )}
                                    <p className="font-bold text-sm text-gray-900 dark:text-white leading-tight">{ach.title}</p>
                                    <p className={`text-xs font-bold uppercase ${styles.textColor}`}>{ach.level}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{new Date(ach.dateAwarded).toLocaleDateString()}</p>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-8">
                        <p className="text-2xl">🌻</p>
                        <p className="mt-2 text-gray-600 dark:text-gray-400">No awards yet. Keep shining!</p>
                    </div>
                )}
            </div>
        </Card>
    );
};

export default AchievementsCard;