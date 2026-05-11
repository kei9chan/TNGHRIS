import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '../../services/notificationService';
import { Notification } from '../../types';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
const BellIcon = ({ animate }: { animate: boolean }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        className={`h-6 w-6 transition-transform ${animate ? 'animate-bounce' : ''}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
    >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
);

const typeConfig: Record<string, { icon: string; bg: string; dot: string }> = {
    // OT
    OT_APPROVED:  { icon: '✅', bg: 'bg-green-50 dark:bg-green-900/20',  dot: 'bg-green-500' },
    OT_REJECTED:  { icon: '❌', bg: 'bg-red-50 dark:bg-red-900/20',    dot: 'bg-red-500'   },
    // WFH
    WFH_APPROVED:  { icon: '✅', bg: 'bg-green-50 dark:bg-green-900/20',  dot: 'bg-green-500' },
    WFH_REJECTED:  { icon: '❌', bg: 'bg-red-50 dark:bg-red-900/20',    dot: 'bg-red-500'   },
    WFH_SUBMITTED: { icon: '🏠', bg: 'bg-blue-50 dark:bg-blue-900/20',   dot: 'bg-blue-500'  },
    // Leave
    LEAVE_DECISION:     { icon: '📋', bg: 'bg-blue-50 dark:bg-blue-900/20',   dot: 'bg-blue-500'  },
    LEAVE_REQUEST:      { icon: '📋', bg: 'bg-blue-50 dark:bg-blue-900/20',   dot: 'bg-blue-500'  },
    // Awards
    AWARD_RECEIVED:        { icon: '🏆', bg: 'bg-yellow-50 dark:bg-yellow-900/20', dot: 'bg-yellow-500' },
    AWARD_APPROVAL_REQUEST:{ icon: '🏆', bg: 'bg-yellow-50 dark:bg-yellow-900/20', dot: 'bg-yellow-500' },
    // Disciplinary
    NTE_ISSUED:        { icon: '⚠️', bg: 'bg-orange-50 dark:bg-orange-900/20', dot: 'bg-orange-500' },
    RESOLUTION_ISSUED: { icon: '⚠️', bg: 'bg-orange-50 dark:bg-orange-900/20', dot: 'bg-orange-500' },
    CASE_ASSIGNED:     { icon: '⚠️', bg: 'bg-orange-50 dark:bg-orange-900/20', dot: 'bg-orange-500' },
    // HR admin
    BIRTHDAY:                   { icon: '🎂', bg: 'bg-pink-50 dark:bg-pink-900/20',   dot: 'bg-pink-500'   },
    SCHEDULE_PUBLISHED:         { icon: '📅', bg: 'bg-indigo-50 dark:bg-indigo-900/20', dot: 'bg-indigo-500' },
    CONTRACT_SIGNATURE_REQUEST: { icon: '✍️', bg: 'bg-purple-50 dark:bg-purple-900/20', dot: 'bg-purple-500' },
    CONTRACT_APPROVAL_REQUEST:  { icon: '✍️', bg: 'bg-purple-50 dark:bg-purple-900/20', dot: 'bg-purple-500' },
    EVALUATION_ASSIGNED:        { icon: '📊', bg: 'bg-teal-50 dark:bg-teal-900/20',   dot: 'bg-teal-500'   },
    // Default fallback
    default: { icon: '🔔', bg: 'bg-gray-50 dark:bg-gray-800', dot: 'bg-blue-600' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function relativeTime(date: Date): string {
    const now = Date.now();
    const diff = Math.floor((now - new Date(date).getTime()) / 1000);
    if (diff < 60)  return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(date).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const NotificationBell: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [bellAnimate, setBellAnimate] = useState(false);
    const prevUnreadRef = useRef(0);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const loadNotifications = useCallback(async (silent = true) => {
        if (!user?.id) return;
        if (!silent) setIsLoading(true);
        try {
            const data = await fetchNotifications(user.id);
            setNotifications(data);

            // Ring bell if new unread arrived
            const newUnread = data.filter(n => !n.isRead).length;
            if (newUnread > prevUnreadRef.current) {
                setBellAnimate(true);
                setTimeout(() => setBellAnimate(false), 1500);
            }
            prevUnreadRef.current = newUnread;
        } catch (error) {
            console.error('Failed to load notifications', error);
        } finally {
            if (!silent) setIsLoading(false);
        }
    }, [user?.id]);

    // Initial load + 30s polling
    useEffect(() => {
        loadNotifications(false);
        const interval = setInterval(() => loadNotifications(true), 30000);
        return () => clearInterval(interval);
    }, [loadNotifications]);

    // Refresh when dropdown opens
    useEffect(() => {
        if (isOpen) loadNotifications(true);
    }, [isOpen, loadNotifications]);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleNotificationClick = async (notification: Notification) => {
        try {
            if (!notification.isRead) {
                await markNotificationRead(notification.id);
                setNotifications(prev => prev.map(n =>
                    n.id === notification.id ? { ...n, isRead: true } : n
                ));
            }
            setIsOpen(false);
            if (notification.link) navigate(notification.link);
        } catch (error) {
            console.error('Failed to mark notification as read', error);
        }
    };

    const handleMarkAllAsRead = async () => {
        if (!user?.id) return;
        try {
            await markAllNotificationsRead(user.id);
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        } catch (error) {
            console.error('Failed to mark all as read', error);
        }
    };

    const unreadCount = notifications.filter(n => !n.isRead).length;

    return (
        <div className="relative mr-4" ref={dropdownRef}>
            {/* Bell button */}
            <button
                id="notification-bell-btn"
                onClick={() => setIsOpen(prev => !prev)}
                aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
                className="relative p-2 text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-white rounded-full transition-colors"
            >
                <BellIcon animate={bellAnimate} />
                {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-red-600 rounded-full min-w-[1.1rem]">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown panel */}
            {isOpen && (
                <div
                    id="notification-dropdown"
                    className="origin-top-right absolute right-0 mt-2 w-80 sm:w-96 rounded-xl shadow-2xl bg-white dark:bg-slate-800 ring-1 ring-black ring-opacity-5 dark:ring-white/10 z-50 overflow-hidden"
                >
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-slate-700/50">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</h3>
                            {unreadCount > 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                                    {unreadCount} new
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            {isLoading && (
                                <span className="inline-block h-3 w-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                            )}
                            {unreadCount > 0 && (
                                <button
                                    onClick={handleMarkAllAsRead}
                                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-medium transition-colors"
                                >
                                    Mark all read
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Notification list */}
                    <div className="max-h-[26rem] overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700">
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                                <span className="text-4xl mb-3">🔔</span>
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">You're all caught up!</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">No notifications yet.</p>
                            </div>
                        ) : (
                            notifications.map((n) => {
                                const cfg = typeConfig[n.type] ?? typeConfig.default;
                                return (
                                    <button
                                        key={n.id}
                                        onClick={() => handleNotificationClick(n)}
                                        className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700/60 ${!n.isRead ? cfg.bg : ''}`}
                                    >
                                        {/* Type icon */}
                                        <span className="text-xl mt-0.5 flex-shrink-0" aria-hidden>{cfg.icon}</span>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm text-gray-900 dark:text-white leading-snug ${!n.isRead ? 'font-semibold' : 'font-medium'}`}>
                                                {n.title}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                                                {n.message}
                                            </p>
                                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                                {relativeTime(n.createdAt)}
                                            </p>
                                        </div>

                                        {/* Unread dot */}
                                        {!n.isRead && (
                                            <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {/* Footer */}
                    <div className="border-t border-gray-100 dark:border-slate-700 px-4 py-2.5 bg-gray-50 dark:bg-slate-700/50">
                        <button
                            id="view-all-notifications-btn"
                            onClick={() => { setIsOpen(false); navigate('/notifications'); }}
                            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 w-full text-center transition-colors"
                        >
                            View all notifications →
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
