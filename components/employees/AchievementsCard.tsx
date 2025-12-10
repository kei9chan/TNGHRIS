import React, { useMemo, useState, useEffect, useRef } from 'react';
import Card from '../ui/Card';
import { BadgeLevel, ResolutionStatus } from '../../types';
import { fetchEmployeeAwards } from '../../services/awardService';
import { mockAwards, mockEmployeeAwards } from '../../services/mockData';

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
    const [achievements, setAchievements] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);
    const prevCountRef = useRef(achievements.length);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await fetchEmployeeAwards();
                const approved = data
                    .filter(a => a.employeeId === employeeId && a.status === ResolutionStatus.Approved)
                    .map(a => ({
                        id: a.id,
                        title: a.awardTitle,
                        badgeIconUrl: a.badgeIconUrl,
                        dateAwarded: a.dateAwarded || new Date(),
                        notes: a.notes || '',
                        level: a.level || BadgeLevel.Bronze,
                    }))
                    .sort((a, b) => new Date(b.dateAwarded).getTime() - new Date(a.dateAwarded).getTime());
                setAchievements(approved);
                prevCountRef.current = approved.length;
            } catch (err) {
                // Fallback to mock if Supabase fails
                const local = mockEmployeeAwards
                    .filter(ea => ea.employeeId === employeeId && ea.status === ResolutionStatus.Approved)
                    .map(ea => {
                        const awardDetails = mockAwards.find(a => a.id === ea.awardId);
                        return {
                            ...ea,
                            title: awardDetails?.title || 'Unknown Award',
                            badgeIconUrl: awardDetails?.badgeIconUrl,
                        };
                    })
                    .sort((a, b) => new Date(b.dateAwarded).getTime() - new Date(a.dateAwarded).getTime());
                setAchievements(local);
                setError((err as any)?.message || null);
                prevCountRef.current = local.length;
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [employeeId]);

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
                {loading && <p className="text-sm text-gray-500">Loading awards…</p>}
                {!loading && achievements.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {achievements.map(ach => {
                          const styles = levelStyles[ach.level];
                          return (
                              <div 
                                  key={ach.id} 
                                  className={`
                                      flex flex-col items-center text-center p-3 rounded-lg border 
                                      ${styles.borderColor} ${styles.bgColor}
                                      transition-all duration-300 transform hover:scale-105
                                      ${ach.id === newlyAddedId ? 'animate-pop-bounce' : ''}
                                  `}
                                  title={`${ach.notes || ach.title} - Awarded on ${new Date(ach.dateAwarded).toLocaleDateString()}`}
                              >
                                  <div className={`w-20 h-20 rounded-full border-2 ${styles.borderColor} bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center mb-3 overflow-hidden`}>
                                      {ach.badgeIconUrl ? (
                                          <img src={ach.badgeIconUrl} alt={ach.title} className="w-16 h-16 object-contain" />
                                      ) : (
                                          <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-lg text-gray-500">★</div>
                                      )}
                                  </div>
                                  <p className="font-semibold text-sm text-gray-900 dark:text-white leading-tight line-clamp-2">{ach.title}</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{new Date(ach.dateAwarded).toLocaleDateString()}</p>
                              </div>
                          );
                      })}
                  </div>
              ) : (
                  !loading && (
                    <div className="text-center py-8">
                        <p className="text-2xl">🌻</p>
                        <p className="mt-2 text-gray-600 dark:text-gray-400">No awards yet. Keep shining!</p>
                    </div>
                  )
              )}
              {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
            </div>
        </Card>
    );
};

export default AchievementsCard;
