import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
}

const Card: React.FC<CardProps> = ({ children, className, title, actions, ...rest }) => {
  return (
    <div {...rest} className={`bg-white dark:bg-slate-800 shadow-md rounded-lg overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
          {title && <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">{title}</h3>}
          {actions && <div className="ml-4">{actions}</div>}
        </div>
      )}
      <div className="p-4 sm:p-6">
        {children}
      </div>
    </div>
  );
};

export default Card;