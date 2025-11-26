import React from 'react';
import { JobPost, JobPostStatus, Permission } from '../../types';
import Button from '../ui/Button';
import { usePermissions } from '../../hooks/usePermissions';

interface JobPostTableProps {
    posts: JobPost[];
    onEdit: (post: JobPost) => void;
    onDelete: (id: string) => void;
}

const getStatusColor = (status: JobPostStatus) => {
    switch (status) {
        case JobPostStatus.Published: return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
        case JobPostStatus.Paused: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
        case JobPostStatus.Closed: return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
        case JobPostStatus.Draft:
        default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
};

const JobPostTable: React.FC<JobPostTableProps> = ({ posts, onEdit, onDelete }) => {
    const { can } = usePermissions();
    const canManage = can('JobPosts', Permission.Manage);

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Title</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Requisition ID</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Published Date</th>
                        <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {posts.map(post => (
                        <tr key={post.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{post.title}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">{post.requisitionId}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(post.status)}`}>
                                    {post.status}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <div className="flex items-center space-x-2">
                                    <Button size="sm" variant="secondary" onClick={() => onEdit(post)}>View / Edit</Button>
                                    {canManage && post.status === JobPostStatus.Draft && (
                                        <Button size="sm" variant="danger" onClick={() => onDelete(post.id)}>Delete</Button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                    {posts.length === 0 && (
                        <tr>
                            <td colSpan={5} className="text-center py-10 text-gray-500 dark:text-gray-400">No job posts found.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default JobPostTable;
