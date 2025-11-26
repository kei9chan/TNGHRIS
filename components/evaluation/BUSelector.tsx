import React from 'react';
import { BusinessUnit } from '../../types';

interface BUSelectorProps {
    businessUnits: BusinessUnit[];
    value: string;
    onChange: (id: string) => void;
}

const BUSelector: React.FC<BUSelectorProps> = ({ businessUnits, value, onChange }) => {
    return (
        <div className="mb-6">
            <label htmlFor="bu-selector" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Business Unit
            </label>
            <select
                id="bu-selector"
                name="bu-selector"
                className="mt-1 block w-full max-w-xs pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            >
                {businessUnits.map(bu => (
                    <option key={bu.id} value={bu.id}>{bu.name}</option>
                ))}
            </select>
        </div>
    );
};

export default BUSelector;