import React from 'react';
import Card from '../ui/Card';

interface AnalyticsCardProps {
    title: string;
    children: React.ReactNode;
    className?: string;
}

const AnalyticsCard: React.FC<AnalyticsCardProps> = ({ title, children, className }) => {
    return (
        <Card title={title} className={className}>
            <div className="h-full min-h-[300px] flex flex-col justify-center">
                {children}
            </div>
        </Card>
    );
};

export default AnalyticsCard;
