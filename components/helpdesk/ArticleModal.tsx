import React, { useState, useEffect } from 'react';
import { KnowledgeBaseArticle, KnowledgeBaseCategory } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import RichTextEditor from '../ui/RichTextEditor';

interface ArticleModalProps {
    isOpen: boolean;
    onClose: () => void;
    article: KnowledgeBaseArticle | null;
    categories: KnowledgeBaseCategory[];
    defaultCategoryId?: string;
    onSave: (article: KnowledgeBaseArticle) => void;
}

const ArticleModal: React.FC<ArticleModalProps> = ({ isOpen, onClose, article, categories, defaultCategoryId, onSave }) => {
    const [current, setCurrent] = useState<Partial<KnowledgeBaseArticle>>({});

    useEffect(() => {
        if (isOpen) {
            setCurrent(article || {
                title: '',
                categoryId: defaultCategoryId || categories[0]?.id || '',
                content: '',
                tags: []
            });
        }
    }, [article, isOpen, categories, defaultCategoryId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setCurrent(prev => ({ ...prev, [name]: value }));
    };

    const handleTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const tags = e.target.value.split(',').map(tag => tag.trim()).filter(Boolean);
        setCurrent(prev => ({ ...prev, tags }));
    };

    const handleSave = () => {
        if (current.title?.trim() && current.categoryId && current.content?.trim()) {
            onSave(current as KnowledgeBaseArticle);
        } else {
            alert('Title, Category, and Content are required.');
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={article ? 'Edit Article' : 'New Article'}
            size="2xl"
            footer={
                <div className="flex justify-end w-full">
                    <Button onClick={handleSave}>{article ? 'Save Changes' : 'Create Article'}</Button>
                </div>
            }
        >
            <div className="space-y-4">
                <Input label="Article Title" name="title" value={current.title || ''} onChange={handleChange} required />
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>
                    <select
                        name="categoryId"
                        value={current.categoryId || ''}
                        onChange={handleChange}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-md"
                    >
                        {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                    </select>
                </div>
                <RichTextEditor
                    label="Content"
                    value={current.content || ''}
                    onChange={(value) => setCurrent(prev => ({...prev, content: value}))}
                />
                <Input
                    label="Tags (comma-separated)"
                    name="tags"
                    value={current.tags?.join(', ') || ''}
                    onChange={handleTagsChange}
                />
            </div>
        </Modal>
    );
};

export default ArticleModal;
