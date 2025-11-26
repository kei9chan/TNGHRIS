import React, { useState, useMemo, useRef, useEffect } from 'react';

// Icons
const XCircleIcon: React.FC<{className?: string}> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

export interface SearchableItem {
    id: string;
    label: string;
    subLabel?: string;
    tag?: string;
}

interface SearchableMultiSelectProps {
  label: string;
  placeholder: string;
  items: SearchableItem[];
  selectedItemIds: string[];
  onSelectionChange: (ids: string[]) => void;
  variant?: 'danger' | 'primary';
}

const SearchableMultiSelect: React.FC<SearchableMultiSelectProps> = ({ label, placeholder, items, selectedItemIds, onSelectionChange, variant = 'danger' }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const pillClasses = {
        danger: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
        primary: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200'
    };
    const pillIconClasses = {
        danger: 'text-red-400 hover:text-red-600',
        primary: 'text-blue-400 hover:text-blue-600'
    }

    const selectedItems = useMemo(() => {
        return selectedItemIds.map(id => items.find(item => item.id === id)).filter(Boolean) as SearchableItem[];
    }, [items, selectedItemIds]);

    const filteredItems = useMemo(() => {
        if (!searchTerm) return [];
        const lowerSearch = searchTerm.toLowerCase();
        const selectedIdsSet = new Set(selectedItemIds);
        return items.filter(item => 
            !selectedIdsSet.has(item.id) &&
            (item.label.toLowerCase().includes(lowerSearch) || item.tag?.toLowerCase().includes(lowerSearch))
        );
    }, [searchTerm, items, selectedItemIds]);

    const handleAddItem = (itemId: string) => {
        onSelectionChange([...selectedItemIds, itemId]);
        setSearchTerm('');
        setIsOpen(false);
    };

    const handleRemoveItem = (itemId: string) => {
        onSelectionChange(selectedItemIds.filter(id => id !== itemId));
    };

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef]);

    return (
        <div ref={wrapperRef}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
            <div className="relative mt-1">
                <div className="w-full p-2 border rounded-md shadow-sm bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600 min-h-[42px] flex flex-wrap items-center gap-2" onClick={() => wrapperRef.current?.querySelector('input')?.focus()}>
                    {selectedItems.map(item => (
                        <span key={item.id} className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium ${pillClasses[variant]}`}>
                            {variant === 'danger' && item.tag && <span className="mr-1.5 font-bold uppercase">{item.tag}</span>}
                            <span className="truncate max-w-xs">{item.label}</span>
                            <button
                                type="button"
                                onClick={() => handleRemoveItem(item.id)}
                                className={`ml-1.5 flex-shrink-0 ${pillIconClasses[variant]}`}
                            >
                                <span className="sr-only">Remove {item.label}</span>
                                <XCircleIcon className="h-4 w-4" />
                            </button>
                        </span>
                    ))}
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        onFocus={() => setIsOpen(true)}
                        placeholder={selectedItems.length > 0 ? '' : placeholder}
                        className="flex-grow bg-transparent focus:outline-none sm:text-sm text-gray-900 dark:text-white placeholder-gray-400"
                    />
                </div>

                {isOpen && searchTerm && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                        {filteredItems.length > 0 ? (
                            filteredItems.map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => handleAddItem(item.id)}
                                    className="px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                                >
                                    <p className="text-sm font-medium text-gray-900 dark:text-white flex items-center">
                                        {variant === 'danger' && item.tag && <span className={`mr-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${pillClasses[variant]}`}>{item.tag}</span>}
                                        {item.label}
                                    </p>
                                    {item.subLabel && <p className="text-sm text-gray-500 dark:text-gray-400">{item.subLabel}</p>}
                                </div>
                            ))
                        ) : (
                            <div className="px-4 py-3 text-sm text-gray-500">No results found</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SearchableMultiSelect;
