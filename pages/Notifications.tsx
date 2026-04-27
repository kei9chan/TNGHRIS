import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '../services/notificationService';
import { Notification } from '../types';

const Notifications: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    const loadNotifications = async () => {
        if (!user?.id) return;
        try {
            const data = await fetchNotifications(user.id);
            setNotifications(data);
        } catch (error) {
            console.error('Failed to load notifications', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadNotifications();
    }, [user?.id]);

    const handleNotificationClick = async (notification: Notification) => {
        try {
            if (!notification.isRead) {
                await markNotificationRead(notification.id);
                setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, isRead: true } : n));
            }
            if (notification.link) {
                navigate(notification.link);
            }
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

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800"></div>
            </div>
        );
    }

    const unreadCount = notifications.filter(n => !n.isRead).length;

    return (
        <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            <div className="md:flex md:items-center md:justify-between mb-6">
                <div className="flex-1 min-w-0">
                    <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
                        Notification History
                    </h2>
                </div>
                {unreadCount > 0 && (
                    <div className="mt-4 flex md:mt-0 md:ml-4">
                        <button
                            onClick={handleMarkAllAsRead}
                            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500"
                        >
                            Mark all as read
                        </button>
                    </div>
                )}
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-md">
                {notifications.length === 0 ? (
                    <div className="px-4 py-12 text-center text-gray-500">
                        <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        <p className="text-lg font-medium">No notifications yet</p>
                        <p className="mt-1 text-sm">When you get notifications, they'll show up here.</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-200">
                        {notifications.map((notification) => (
                            <li key={notification.id}>
                                <div 
                                    className={`px-4 py-4 sm:px-6 hover:bg-gray-50 transition duration-150 ease-in-out cursor-pointer ${!notification.isRead ? 'bg-blue-50/30' : ''}`}
                                    onClick={() => handleNotificationClick(notification)}
                                >
                                    <div className="flex items-center justify-between">
                                        <p className={`text-sm font-medium text-blue-600 truncate ${!notification.isRead ? 'font-bold' : ''}`}>
                                            {notification.title}
                                        </p>
                                        <div className="ml-2 flex-shrink-0 flex">
                                            <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                                                {new Date(notification.createdAt).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-2 sm:flex sm:justify-between">
                                        <div className="sm:flex">
                                            <p className={`flex items-center text-sm text-gray-500 ${!notification.isRead ? 'text-gray-700' : ''}`}>
                                                {notification.message}
                                            </p>
                                        </div>
                                        {!notification.isRead && (
                                            <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                                                <span className="h-2.5 w-2.5 bg-blue-600 rounded-full mr-2"></span>
                                                <span className="text-blue-600 text-xs font-medium uppercase tracking-wider">Unread</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default Notifications;
