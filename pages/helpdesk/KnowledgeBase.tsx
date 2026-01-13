import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { KnowledgeBaseArticle, KnowledgeBaseCategory, Permission } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { usePermissions } from '../../hooks/usePermissions';
import CategoryModal from '../../components/helpdesk/CategoryModal';
import ArticleModal from '../../components/helpdesk/ArticleModal';
import { supabase } from '../../services/supabaseClient';


// Icons
const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
const PencilIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;


const KnowledgeBase: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState('');
    const { can } = usePermissions();
    const canManageKb = can('Helpdesk', Permission.Manage);
    const canViewKb = can('Helpdesk', Permission.View);

    const [categories, setCategories] = useState<KnowledgeBaseCategory[]>([]);
    const [articles, setArticles] = useState<KnowledgeBaseArticle[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // State for modals
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [isArticleModalOpen, setIsArticleModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<KnowledgeBaseCategory | null>(null);
    const [editingArticle, setEditingArticle] = useState<KnowledgeBaseArticle | null>(null);

    const query = searchParams.get('q');
    const categoryId = searchParams.get('category');
    const articleSlug = searchParams.get('article');
    const isHomeView = !query && !categoryId && !articleSlug;

    const loadData = async () => {
        setIsLoading(true);
        setError(null);
        const [{ data: catData, error: catErr }, { data: artData, error: artErr }] = await Promise.all([
            supabase.from('kb_categories').select('*').order('name'),
            supabase.from('kb_articles').select('*').order('last_updated_at', { ascending: false }),
        ]);
        if (catErr || artErr) {
            setError(catErr?.message || artErr?.message || 'Failed to load knowledge base data.');
            setCategories([]);
            setArticles([]);
        } else {
            setCategories((catData || []).map((c: any) => ({
                id: c.id,
                name: c.name,
                description: c.description,
                icon: c.icon,
            })));
            setArticles((artData || []).map((a: any) => ({
                id: a.id,
                slug: a.slug,
                title: a.title,
                categoryId: a.category_id,
                content: a.content,
                tags: a.tags || [],
                lastUpdatedAt: a.last_updated_at ? new Date(a.last_updated_at) : new Date(),
                viewCount: a.view_count ?? 0,
            })));
        }
        setIsLoading(false);
    };

    useEffect(() => {
        loadData();
    }, []);
    
    const searchResults = useMemo(() => {
        if (!query) return [];
        const lowerQuery = query.toLowerCase();
        return articles.filter(article => 
            article.title.toLowerCase().includes(lowerQuery) ||
            article.content.toLowerCase().includes(lowerQuery) ||
            article.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
        );
    }, [query, articles]);

    const articlesInCategory = useMemo(() => {
        if (!categoryId) return [];
        return articles.filter(a => a.categoryId === categoryId);
    }, [categoryId, articles]);

    const selectedArticle = useMemo(() => {
        if (!articleSlug) return null;
        return articles.find(a => a.slug === articleSlug);
    }, [articleSlug, articles]);
    
    // --- Handlers for mock data mutation ---
    const handleSaveCategory = async (category: KnowledgeBaseCategory) => {
        setError(null);
        if (category.id) { // Editing
            const { error: err } = await supabase.from('kb_categories').update({
                name: category.name,
                description: category.description,
                icon: category.icon,
                updated_at: new Date().toISOString(),
            }).eq('id', category.id);
            if (err) {
                setError(err.message);
                return;
            }
        } else { // Creating
            const { error: err } = await supabase.from('kb_categories').insert({
                name: category.name,
                description: category.description,
                icon: category.icon,
            });
            if (err) {
                setError(err.message);
                return;
            }
        }
        setIsCategoryModalOpen(false);
        setEditingCategory(null);
        await loadData();
    };

    const handleDeleteCategory = async (id: string) => {
        if (articles.some(a => a.categoryId === id)) {
            alert("Cannot delete a category with articles in it. Please move or delete the articles first.");
            return;
        }
        if (window.confirm("Are you sure you want to delete this category?")) {
            const { error: err } = await supabase.from('kb_categories').delete().eq('id', id);
            if (err) {
                setError(err.message);
                return;
            }
            setSearchParams({});
            await loadData();
        }
    };

    const handleSaveArticle = async (article: KnowledgeBaseArticle) => {
        setError(null);
        const newSlug = article.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const payload = {
            slug: newSlug,
            title: article.title,
            category_id: article.categoryId,
            content: article.content,
            tags: article.tags || [],
            last_updated_at: new Date().toISOString(),
        };

        if (article.id) { // Editing
            const { error: err } = await supabase.from('kb_articles').update(payload).eq('id', article.id);
            if (err) {
                setError(err.message);
                return;
            }
        } else { // Creating
            const { error: err } = await supabase.from('kb_articles').insert({ ...payload, view_count: 0 });
            if (err) {
                setError(err.message);
                return;
            }
        }
        setIsArticleModalOpen(false);
        setEditingArticle(null);
        await loadData();
        setSearchParams({ article: newSlug }); // Navigate to the new/edited article
    };

    const handleDeleteArticle = async (id: string) => {
        if (window.confirm("Are you sure you want to delete this article?")) {
            const { error: err } = await supabase.from('kb_articles').delete().eq('id', id);
            if (err) {
                setError(err.message);
                return;
            }
            setSearchParams({}); // Go back to home
            await loadData();
        }
    };
    
    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setSearchParams(searchTerm ? { q: searchTerm } : {});
    };

    const renderHome = () => (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {categories.map(cat => (
                    <Link to={`?category=${cat.id}`} key={cat.id} className="block hover:no-underline group">
                        <Card className="h-full hover:shadow-lg hover:ring-2 hover:ring-indigo-500 transition-all relative">
                            <div className="flex flex-col items-center text-center">
                                <span className="text-5xl">{cat.icon}</span>
                                <h3 className="mt-4 font-bold text-lg text-gray-900 dark:text-white">{cat.name}</h3>
                                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{cat.description}</p>
                            </div>
                            {canManageKb && (
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button size="sm" variant="secondary" onClick={(e) => { e.preventDefault(); setEditingCategory(cat); setIsCategoryModalOpen(true); }}><PencilIcon /></Button>
                                </div>
                            )}
                        </Card>
                    </Link>
                ))}
            </div>
            <Card title="Popular Articles" className="mt-8">
                <ul className="space-y-2">
                    {articles.sort((a,b) => b.viewCount - a.viewCount).slice(0, 3).map(article => (
                        <li key={article.id}>
                            <Link to={`?article=${article.slug}`} className="p-2 block rounded-md text-indigo-600 dark:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-700/50">
                                {article.title}
                            </Link>
                        </li>
                    ))}
                </ul>
            </Card>
        </>
    );
    
    const renderArticleList = (title: string, articlesToList: typeof mockKbArticles) => {
        const currentCategory = categories.find(c => c.id === categoryId);
        return (
            <Card>
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <button onClick={() => setSearchParams({})} className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                            <ArrowLeftIcon />
                            Back to Categories
                        </button>
                        <h2 className="text-2xl font-bold mt-2">{title}</h2>
                    </div>
                    {canManageKb && categoryId && (
                        <div className="flex items-center space-x-2">
                            <Button variant="danger" size="sm" onClick={() => handleDeleteCategory(categoryId)}><TrashIcon /> Delete Category</Button>
                            <Button variant="secondary" size="sm" onClick={() => { if(currentCategory) {setEditingCategory(currentCategory); setIsCategoryModalOpen(true); }}}> <PencilIcon/> Edit Category</Button>
                            <Button onClick={() => { setEditingArticle(null); setIsArticleModalOpen(true); }}><PlusIcon /> Add Article</Button>
                        </div>
                    )}
                </div>
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {articlesToList.map(article => (
                        <li key={article.id}>
                            <Link to={`?article=${article.slug}`} className="block p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <h3 className="font-semibold text-lg text-gray-900 dark:text-white">{article.title}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Last updated: {new Date(article.lastUpdatedAt).toLocaleDateString()}</p>
                            </Link>
                        </li>
                    ))}
                    {articlesToList.length === 0 && <p className="p-4 text-gray-500">No articles in this category yet.</p>}
                </ul>
            </Card>
        );
    };

    const renderArticle = () => {
        if (!selectedArticle) return <Card><p>Article not found.</p></Card>;
        const category = categories.find(c => c.id === selectedArticle.categoryId);
        return (
            <Card>
                <div className="flex justify-between items-start mb-4">
                    <button onClick={() => setSearchParams(category ? { category: category.id } : {})} className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                        <ArrowLeftIcon />
                        Back to {category?.name || 'List'}
                    </button>
                    {canManageKb && (
                        <div className="flex space-x-2">
                            <Button variant="danger" size="sm" onClick={() => handleDeleteArticle(selectedArticle.id)}><TrashIcon /> Delete</Button>
                            <Button onClick={() => { setEditingArticle(selectedArticle); setIsArticleModalOpen(true); }}><PencilIcon /> Edit Article</Button>
                        </div>
                    )}
                </div>
                <div className="prose dark:prose-invert max-w-none">
                    <h1>{selectedArticle.title}</h1>
                    <div dangerouslySetInnerHTML={{ __html: selectedArticle.content }} />
                </div>
                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
                    Tags: {selectedArticle.tags.join(', ')}
                </div>
            </Card>
        );
    }
    
    return (
        <div className="space-y-8">
            {!canViewKb && (
                <Card>
                    <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                        You do not have permission to view the Knowledge Base.
                    </div>
                </Card>
            )}
            {canViewKb && (
        <>
            {/* Header Section */}
            <div className="relative flex flex-col items-center justify-center py-6">
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Knowledge Base</h1>
                    <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">Find answers to your questions about company policies and procedures.</p>
                </div>
                
                {canManageKb && isHomeView && (
                    <div className="mt-4 md:mt-0 md:absolute md:right-0 md:top-1/2 md:-translate-y-1/2">
                        <Button onClick={() => { setEditingCategory(null); setIsCategoryModalOpen(true); }}>
                            <PlusIcon /> Add Category
                        </Button>
                    </div>
                )}
            </div>
            
            {/* Search Section */}
            <div className="max-w-2xl mx-auto w-full mb-8">
                <form onSubmit={handleSearch}>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <SearchIcon />
                        </div>
                        <input 
                            type="text"
                            id="kb-search"
                            placeholder="Search for articles (e.g., 'how to file leave')"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="block w-full pl-12 pr-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-900 transition duration-150 ease-in-out shadow-sm"
                        />
                    </div>
                </form>
            </div>
            
            {query ? renderArticleList(`Search Results for "${query}"`, searchResults) 
             : categoryId ? renderArticleList(categories.find(c=>c.id === categoryId)?.name || 'Category', articlesInCategory)
             : articleSlug ? renderArticle()
             : renderHome()
            }

            {isCategoryModalOpen && canManageKb && (
                <CategoryModal
                    isOpen={isCategoryModalOpen}
                    onClose={() => setIsCategoryModalOpen(false)}
                    category={editingCategory}
                    onSave={handleSaveCategory}
                />
            )}

            {isArticleModalOpen && canManageKb && (
                <ArticleModal
                    isOpen={isArticleModalOpen}
                    onClose={() => setIsArticleModalOpen(false)}
                    article={editingArticle}
                    categories={categories}
                    defaultCategoryId={categoryId || undefined}
                    onSave={handleSaveArticle}
                />
            )}
        </>
            )}
        </div>
    );
};

export default KnowledgeBase;
