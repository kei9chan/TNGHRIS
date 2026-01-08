import React, { useState, useMemo, useEffect } from 'react';
import { DisciplineEntry, SeverityLevel, Permission } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import DisciplineEntryModal from '../../components/feedback/DisciplineEntryModal';
import CategoryManagerModal from '../../components/feedback/CategoryManagerModal';
import Input from '../../components/ui/Input';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../services/supabaseClient';

const ChevronDownIcon = ({ className }: {className?: string}) => (<svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transition-transform duration-200 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>);
const EditIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>);
const TrashIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>);


const CodeOfDiscipline: React.FC = () => {
    const { user } = useAuth();
    const { can } = usePermissions();
    const canManage = can('CodeOfDiscipline', Permission.Manage);
    const canView = can('CodeOfDiscipline', Permission.View);

    const [entries, setEntries] = useState<DisciplineEntry[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [userNames, setUserNames] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);

    const [isEntryModalOpen, setEntryModalOpen] = useState(false);
    const [isCategoryModalOpen, setCategoryModalOpen] = useState(false);
    
    const [selectedEntry, setSelectedEntry] = useState<DisciplineEntry | null>(null);
    const [newEntryCategory, setNewEntryCategory] = useState<string | null>(null);

    const [openAccordion, setOpenAccordion] = useState<string | null>(null);
    
    // Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [severityFilter, setSeverityFilter] = useState<SeverityLevel | ''>('');
    const [categoryFilter, setCategoryFilter] = useState('');


    const { filteredCategories, entriesByCategory } = useMemo(() => {
        let tempEntries = entries;

        if (searchTerm) {
            const lowercasedTerm = searchTerm.toLowerCase();
            tempEntries = tempEntries.filter(entry =>
                entry.code.toLowerCase().includes(lowercasedTerm) ||
                entry.description.toLowerCase().includes(lowercasedTerm) ||
                entry.category.toLowerCase().includes(lowercasedTerm)
            );
        }

        if (severityFilter) {
            tempEntries = tempEntries.filter(entry => entry.severityLevel === severityFilter);
        }

        if (categoryFilter) {
            tempEntries = tempEntries.filter(entry => entry.category === categoryFilter);
        }

        const grouped: Record<string, DisciplineEntry[]> = {};
        // seed with all known categories so new ones (no entries yet) still show
        categories.forEach(cat => {
            grouped[cat] = [];
        });

        tempEntries.forEach(entry => {
            if (!grouped[entry.category]) {
                grouped[entry.category] = [];
            }
            grouped[entry.category].push(entry);
        });
        
        const finalCategories = Object.keys(grouped)
            .filter(cat => {
                if (categoryFilter && cat !== categoryFilter) return false;
                // when search/severity filters are applied, show only categories with matches
                if ((searchTerm || severityFilter) && grouped[cat].length === 0) return false;
                return true;
            })
            .sort();

        return { filteredCategories: finalCategories, entriesByCategory: grouped };
    }, [entries, searchTerm, severityFilter, categoryFilter, categories]);

    const mapRowToEntry = (row: any): DisciplineEntry => ({
        id: row.id,
        code: row.code,
        category: row.category,
        description: row.description,
        severityLevel: row.severity as SeverityLevel,
        sanctions: (row.sanctions || []).map((s: any, idx: number) => ({
            offense: s.offense ?? idx + 1,
            action: s.action ?? '',
        })),
        lastModifiedAt: row.last_modified_at ? new Date(row.last_modified_at) : new Date(),
        lastModifiedByUserId: row.last_modified_by_user_id || '',
    });

    const loadCategories = async (): Promise<string[]> => {
        try {
            const { data, error } = await supabase
                .from('discipline_categories')
                .select('name')
                .order('name', { ascending: true });
            if (error) throw error;
            const names = (data || []).map((row: any) => row.name).filter(Boolean);
            setCategories(names);
            return names;
        } catch (err) {
            console.warn('Failed to load discipline categories, falling back to entry-derived', err);
            return [];
        }
    };

    const loadEntries = async (overrideCategories?: string[]) => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('discipline_entries')
                .select('*')
                .order('code', { ascending: true });
            if (error) throw error;
            const mapped = (data || []).map(mapRowToEntry);
            setEntries(mapped);
            const dbCats = await loadCategories();
            const catSet = new Set<string>(overrideCategories || dbCats || categories);
            mapped.forEach(e => catSet.add(e.category));
            const sortedCats = Array.from(catSet).sort();
            setCategories(sortedCats);
            setOpenAccordion(sortedCats[0] || null);
            // Backfill categories table with any new categories derived from entries
            if (sortedCats.length) {
                const upsertPayload = sortedCats.map(name => ({ name }));
                await supabase.from('discipline_categories').upsert(upsertPayload, { onConflict: 'name' });
            }

            setUserNames({});
        } catch (err) {
            console.error('Failed to load discipline entries', err);
            setEntries([]);
            setCategories([]);
            setUserNames({});
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadEntries();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Keep categories fresh when opening the manage modal (even if no entries yet)
    useEffect(() => {
        if (isCategoryModalOpen) {
            loadCategories().then((cats) => {
                if (!entries.length && cats.length) {
                    setOpenAccordion(cats[0]);
                }
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCategoryModalOpen]);

    // Refresh categories before opening the entry modal to populate dropdown
    useEffect(() => {
        if (isEntryModalOpen) {
            loadCategories();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEntryModalOpen]);


    const handleOpenEntryModal = (entry: DisciplineEntry | null, category?: string) => {
        setSelectedEntry(entry);
        if (!entry && category) {
            setNewEntryCategory(category);
        }
        setEntryModalOpen(true);
    };

    const handleCloseEntryModal = () => {
        setEntryModalOpen(false);
        setSelectedEntry(null);
        setNewEntryCategory(null);
    };

    const handleSaveEntry = async (entryToSave: DisciplineEntry) => {
        if (!user) return;
        
        const entryWithAudit: DisciplineEntry = {
            ...entryToSave,
            lastModifiedAt: new Date(),
            lastModifiedByUserId: user.id,
        };

        const payload = {
            code: entryWithAudit.code,
            category: entryWithAudit.category || '',
            description: entryWithAudit.description,
            severity: entryWithAudit.severityLevel || SeverityLevel.Low,
            sanctions: entryWithAudit.sanctions || [],
            last_modified_at: new Date().toISOString(),
        };

        try {
            // Ensure category exists in categories table
            if (entryWithAudit.category) {
                await supabase
                    .from('discipline_categories')
                    .upsert({ name: entryWithAudit.category }, { onConflict: 'name' });
            }

            if (entryToSave.id) {
                const { error } = await supabase
                    .from('discipline_entries')
                    .update(payload)
                    .eq('id', entryToSave.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('discipline_entries')
                    .insert(payload);
                if (error) throw error;
            }
            await loadEntries(categories);
            handleCloseEntryModal();
        } catch (err) {
            console.error('Failed to save discipline entry', err);
            const message = (err as any)?.message || 'Failed to save entry. Please try again.';
            alert(message);
        }
    };

    const handleDeleteEntry = async (entryId: string) => {
        if (!window.confirm('Are you sure you want to delete this entry?')) return;
        try {
            const { error } = await supabase
                .from('discipline_entries')
                .delete()
                .eq('id', entryId);
            if (error) throw error;
            await loadEntries(categories);
        } catch (err) {
            console.error('Failed to delete discipline entry', err);
            alert('Failed to delete entry. Please try again.');
        }
    };

    const handleSaveCategories = async (newCategories: string[], renamed: { oldName: string; newName: string }[], deleted: string[]) => {
        try {
            const finalList = Array.from(new Set(newCategories.map(c => c.trim()).filter(Boolean)));
            // Upsert all categories from modal (no deletions to avoid FK issues)
            if (finalList.length) {
                const upsertPayload = finalList.map(name => ({ name }));
                const { error: upsertError } = await supabase
                    .from('discipline_categories')
                    .upsert(upsertPayload, { onConflict: 'name' });
                if (upsertError) throw upsertError;
            }

            for (const { oldName, newName } of renamed) {
                const { error } = await supabase
                    .from('discipline_entries')
                    .update({ category: newName })
                    .eq('category', oldName);
                if (error) throw error;
            }
            const refreshedCats = await loadCategories();
            await loadEntries(refreshedCats);
            setCategories(refreshedCats.sort());
            if (refreshedCats.length) setOpenAccordion(refreshedCats[0]);
            setCategoryModalOpen(false);

            const currentOpen = openAccordion;
            if(currentOpen){
                const renamedItem = renamed.find(r => r.oldName === currentOpen);
                if(renamedItem) setOpenAccordion(renamedItem.newName);
                else if (deleted.includes(currentOpen)) setOpenAccordion(null);
            }
        } catch (err) {
            console.error('Failed to save categories', err);
            alert('Failed to update categories. Please try again.');
        }
    };
    
    const getSeverityColor = (severity: SeverityLevel) => {
        switch (severity) {
            case SeverityLevel.Low: return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
            case SeverityLevel.Medium: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
            case SeverityLevel.High: return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
            case SeverityLevel.Critical: return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
            default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
        }
    };

    const getUserName = (userId: string) => userNames[userId] || 'System';

    const attendanceCategories = filteredCategories.filter(cat => /attend/i.test(cat));
    const disciplineCategories = filteredCategories.filter(cat => !/attend/i.test(cat));

    if (!canView) {
        return (
            <div className="p-6">
                <Card>
                    <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                        You do not have permission to view the Code of Discipline.
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                 <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Code of Discipline</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Live entries stored in Supabase.</p>
                 </div>
                 {canManage && (
                    <div className="flex space-x-2">
                        <Button variant="secondary" onClick={() => setCategoryModalOpen(true)}>Manage Categories</Button>
                        <Button onClick={() => handleOpenEntryModal(null, categories[0] || undefined)}>New Entry</Button>
                    </div>
                 )}
            </div>

            <p className="text-gray-600 dark:text-gray-400 -mt-4">The Code of Discipline module stores and organizes all company rules, infractions, and penalties. Browse, filter, and update company rules to ensure consistent and fair disciplinary actions.</p>

            <Card>
                <div className="p-4 space-y-4">
                    <Input 
                        label="Search Code of Discipline"
                        id="discipline-search"
                        placeholder="Search by code, description, or category..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="severity-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Filter by Severity</label>
                            <select
                                id="severity-filter"
                                value={severityFilter}
                                onChange={e => setSeverityFilter(e.target.value as SeverityLevel | '')}
                                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                            >
                                <option value="">All Severities</option>
                                {Object.values(SeverityLevel).map(level => (
                                    <option key={level} value={level}>{level}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                             <label htmlFor="category-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Filter by Category</label>
                            <select
                                id="category-filter"
                                value={categoryFilter}
                                onChange={e => setCategoryFilter(e.target.value)}
                                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                            >
                                <option value="">All Categories</option>
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </Card>
            
            <div className="space-y-6">
                {attendanceCategories.length > 0 && (
                    <div className="space-y-2">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Attendance</h3>
                        <div className="space-y-4">
                            {attendanceCategories.map(category => {
                                const categoryEntries = entriesByCategory[category] || [];
                                const isFilterActive = searchTerm || severityFilter || categoryFilter;
                                const isAccordionOpen = isFilterActive ? true : openAccordion === category;
                                
                                return (
                                    <Card key={category} className="transition-all duration-300">
                                         <div className={`flex justify-between items-center p-4 ${!isFilterActive ? 'cursor-pointer' : ''}`} onClick={() => !isFilterActive && setOpenAccordion(isAccordionOpen ? null : category)}>
                                            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">{category} ({categoryEntries.length})</h2>
                                            {!isFilterActive && <ChevronDownIcon className={isAccordionOpen ? 'rotate-180' : ''} />}
                                        </div>
                                         {isAccordionOpen && (
                                            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                                                {canManage && (
                                                    <div className="flex justify-end mb-4">
                                                        <Button size="sm" onClick={() => handleOpenEntryModal(null, category)}>Add Entry to {category}</Button>
                                                    </div>
                                                )}
                                                <div className="overflow-x-auto">
                                                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                                         <thead className="bg-gray-50 dark:bg-gray-900/50">
                                                            <tr>
                                                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Code</th>
                                                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                                                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Severity</th>
                                                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Progressive Sanctions</th>
                                                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Last Modified</th>
                                                                {canManage && <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                                            {loading && (
                                                                <tr>
                                                                    <td colSpan={canManage ? 6 : 5} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                        Loading discipline entries...
                                                                    </td>
                                                                </tr>
                                                            )}
                                                            {!loading && categoryEntries.map(entry => (
                                                                <tr key={entry.id}>
                                                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{entry.code}</td>
                                                                    <td className="px-4 py-4 whitespace-normal text-sm text-gray-500 dark:text-gray-400">{entry.description}</td>
                                                                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                                                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getSeverityColor(entry.severityLevel)}`}>
                                                                            {entry.severityLevel}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-4 whitespace-normal text-sm text-gray-500 dark:text-gray-400">
                                                                        <ol className="list-decimal list-inside space-y-1">
                                                                            {entry.sanctions.map(s => <li key={s.offense}>{s.action}</li>)}
                                                                        </ol>
                                                                    </td>
                                                                    <td className="px-4 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                                                        <div>{getUserName(entry.lastModifiedByUserId)}</div>
                                                                        <div>{new Date(entry.lastModifiedAt).toLocaleString()}</div>
                                                                    </td>
                                                                    {canManage && (
                                                                        <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                                            <div className="flex items-center space-x-2">
                                                                                <Button variant="secondary" size="sm" onClick={() => handleOpenEntryModal(entry)}> <EditIcon/> Edit</Button>
                                                                                <Button variant="danger" size="sm" onClick={() => handleDeleteEntry(entry.id)}><TrashIcon/> Delete</Button>
                                                                            </div>
                                                                        </td>
                                                                    )}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </Card>
                                );
                            })}
                        </div>
                    </div>
                )}

                {disciplineCategories.length > 0 && (
                    <div className="space-y-2">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Discipline</h3>
                        <div className="space-y-4">
                            {disciplineCategories.map(category => {
                                const categoryEntries = entriesByCategory[category] || [];
                                const isFilterActive = searchTerm || severityFilter || categoryFilter;
                                const isAccordionOpen = isFilterActive ? true : openAccordion === category;
                                
                                return (
                                    <Card key={category} className="transition-all duration-300">
                                         <div className={`flex justify-between items-center p-4 ${!isFilterActive ? 'cursor-pointer' : ''}`} onClick={() => !isFilterActive && setOpenAccordion(isAccordionOpen ? null : category)}>
                                            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">{category} ({categoryEntries.length})</h2>
                                            {!isFilterActive && <ChevronDownIcon className={isAccordionOpen ? 'rotate-180' : ''} />}
                                        </div>
                                         {isAccordionOpen && (
                                            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                                                {canManage && (
                                                    <div className="flex justify-end mb-4">
                                                        <Button size="sm" onClick={() => handleOpenEntryModal(null, category)}>Add Entry to {category}</Button>
                                                    </div>
                                                )}
                                                <div className="overflow-x-auto">
                                                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                                         <thead className="bg-gray-50 dark:bg-gray-900/50">
                                                            <tr>
                                                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Code</th>
                                                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                                                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Severity</th>
                                                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Progressive Sanctions</th>
                                                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Last Modified</th>
                                                                {canManage && <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                                            {loading && (
                                                                <tr>
                                                                    <td colSpan={canManage ? 6 : 5} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                                                                        Loading discipline entries...
                                                                    </td>
                                                                </tr>
                                                            )}
                                                            {!loading && categoryEntries.map(entry => (
                                                                <tr key={entry.id}>
                                                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{entry.code}</td>
                                                                    <td className="px-4 py-4 whitespace-normal text-sm text-gray-500 dark:text-gray-400">{entry.description}</td>
                                                                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                                                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getSeverityColor(entry.severityLevel)}`}>
                                                                            {entry.severityLevel}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-4 whitespace-normal text-sm text-gray-500 dark:text-gray-400">
                                                                        <ol className="list-decimal list-inside space-y-1">
                                                                            {entry.sanctions.map(s => <li key={s.offense}>{s.action}</li>)}
                                                                        </ol>
                                                                    </td>
                                                                    <td className="px-4 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                                                        <div>{getUserName(entry.lastModifiedByUserId)}</div>
                                                                        <div>{new Date(entry.lastModifiedAt).toLocaleString()}</div>
                                                                    </td>
                                                                    {canManage && (
                                                                        <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                                            <div className="flex items-center space-x-2">
                                                                                <Button variant="secondary" size="sm" onClick={() => handleOpenEntryModal(entry)}> <EditIcon/> Edit</Button>
                                                                                <Button variant="danger" size="sm" onClick={() => handleDeleteEntry(entry.id)}><TrashIcon/> Delete</Button>
                                                                            </div>
                                                                        </td>
                                                                    )}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </Card>
                                );
                            })}
                        </div>
                    </div>
                )}

                {filteredCategories.length === 0 && (
                    <Card>
                        <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                            <p>No entries found matching your search and filter criteria.</p>
                        </div>
                    </Card>
                )}
            </div>
            
            {canManage && (
                <>
                    <DisciplineEntryModal
                        isOpen={isEntryModalOpen}
                        onClose={handleCloseEntryModal}
                        entry={selectedEntry}
                        onSave={handleSaveEntry}
                        categories={categories}
                        defaultCategory={newEntryCategory}
                    />
                    <CategoryManagerModal
                        isOpen={isCategoryModalOpen}
                        onClose={() => setCategoryModalOpen(false)}
                        categories={categories}
                        onSave={handleSaveCategories}
                        entries={entries}
                    />
                </>
            )}
        </div>
    );
};

export default CodeOfDiscipline;
