import React from 'react';
import Card from '../components/ui/Card';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';

const ThankYou: React.FC = () => {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 text-center">
                <Card>
                    <div className="p-6">
                        <svg className="mx-auto h-12 w-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Application Submitted!</h2>
                        <p className="mt-4 text-gray-700 dark:text-gray-300">
                            Thank you for your interest. Our recruitment team will review your application and get in touch if you are shortlisted.
                        </p>
                        <div className="mt-6">
                            <Link to="/apply">
                                <Button variant="secondary">Submit another application</Button>
                            </Link>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default ThankYou;
