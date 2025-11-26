import React from 'react';
import { Link } from 'react-router-dom';

interface ActionItemCardProps {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    date: string;
    link: string;
    colorClass: string;
}

const ArrowRightIcon = ({ className }: { className?: string }) => (<svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17 2.25L22.5 9m0 0L17 15.75M22.5 9H1.5" /></svg>);

const ActionItemCard: React.FC<ActionItemCardProps> = ({ icon, title, subtitle, date, link, colorClass }) => {
    return (
        <Link to={link} className="block hover:no-underline">
            <div className="bg-white dark:bg-slate-800 shadow-md rounded-lg overflow-hidden transition-all hover:shadow-lg hover:ring-2 hover:ring-indigo-500">
                <div className="flex items-center p-4">
                    <div className={`flex-shrink-0 p-3 rounded-full ${colorClass}`}>
                        {icon}
                    </div>
                    <div className="flex-grow ml-4 min-w-0">
                        <h3 className="font-semibold text-gray-800 dark:text-gray-200 truncate">{title}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>
                    </div>
                    <div className="flex-shrink-0 ml-4 flex flex-col items-end">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{date}</span>
                        <ArrowRightIcon className="w-5 h-5 text-gray-400 mt-1" />
                    </div>
                </div>
            </div>
        </Link>
    );
};

export default ActionItemCard;
