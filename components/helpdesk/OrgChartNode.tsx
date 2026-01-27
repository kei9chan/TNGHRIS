
import React, { useMemo, useState } from 'react';
import { User } from '../../types';

interface OrgChartNodeProps {
    employee: User;
    allEmployees: User[];
    onAddReport?: (managerId: string) => void;
    onEditEmployee?: (employee: User) => void;
}

const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>;
const PencilIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>;


const UserAvatar: React.FC = () => (
    <div className="h-12 w-12 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-400 mx-auto border-2 border-white dark:border-gray-800">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
    </div>
);

const OrgChartNode: React.FC<OrgChartNodeProps> = ({ employee, allEmployees, onAddReport, onEditEmployee }) => {
    const [isHovered, setIsHovered] = useState(false);

    const directReports = useMemo(() => {
        return allEmployees.filter(e => e.managerId === employee.id);
    }, [employee.id, allEmployees]);

    return (
        <li>
            <div 
                className="relative p-2 bg-white dark:bg-slate-800 rounded-lg shadow-md border border-gray-200 dark:border-slate-700 min-w-[180px] max-w-[220px] inline-block transition-transform hover:-translate-y-1"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {isHovered && (onAddReport || onEditEmployee) && (
                    <div className="absolute top-1 right-1 flex space-x-1 z-10">
                        {onAddReport && (
                            <button onClick={() => onAddReport(employee.id)} title="Add Direct Report" className="p-1.5 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors shadow-sm">
                                <PlusIcon />
                            </button>
                        )}
                        {onEditEmployee && (
                            <button onClick={() => onEditEmployee(employee)} title="Edit Employee" className="p-1.5 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors shadow-sm">
                                <PencilIcon />
                            </button>
                        )}
                    </div>
                )}
                <div className="mt-2">
                    <UserAvatar />
                </div>
                <h4 className="font-bold text-gray-800 dark:text-gray-200 mt-2 text-sm truncate px-2" title={employee.name}>{employee.name}</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate px-2" title={employee.position}>{employee.position}</p>
                
                <div className="mt-2 mb-1 pt-2 border-t border-gray-100 dark:border-gray-700">
                     <a href={`mailto:${employee.email}`} className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline truncate block px-2" title={employee.email}>
                        {employee.email}
                    </a>
                </div>
            </div>
            {directReports.length > 0 && (
                <ul>
                    {directReports.map(report => (
                        <OrgChartNode 
                            key={report.id} 
                            employee={report} 
                            allEmployees={allEmployees}
                            onAddReport={onAddReport}
                            onEditEmployee={onEditEmployee}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
};

export default OrgChartNode;
