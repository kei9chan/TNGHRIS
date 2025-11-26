import React, { useState, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { mockOnboardingChecklists } from '../../services/mockData';
import { useAuth } from '../../hooks/useAuth';
import SignaturePad, { SignaturePadRef } from '../../components/ui/SignaturePad';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;

const OnboardingSignPage: React.FC = () => {
    const { checklistId } = useParams<{ checklistId: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();
    const signaturePadRef = useRef<SignaturePadRef>(null);

    const checklist = useMemo(() => {
        return mockOnboardingChecklists.find(c => c.id === checklistId);
    }, [checklistId]);

    const [fullName, setFullName] = useState(user?.name || '');
    const [isLoading, setIsLoading] = useState(false);

    if (!checklist) {
        return <div className="p-4">Onboarding checklist not found.</div>;
    }

    const handleAcceptAndSign = () => {
        if (!fullName.trim() || signaturePadRef.current?.isEmpty()) {
            alert("Please provide your full name and signature.");
            return;
        }

        setIsLoading(true);
        
        const signatureDataUrl = signaturePadRef.current?.getSignatureDataUrl();

        // Find and update the master checklist object
        const checklistIndex = mockOnboardingChecklists.findIndex(c => c.id === checklist.id);
        if (checklistIndex !== -1) {
            mockOnboardingChecklists[checklistIndex] = {
                ...mockOnboardingChecklists[checklistIndex],
                status: 'Completed',
                signatureName: fullName,
                signatureDataUrl: signatureDataUrl || undefined,
                signedAt: new Date(),
            };
        }
        
        // Simulate API delay
        setTimeout(() => {
            setIsLoading(false);
            navigate('/employees/onboarding');
        }, 1000);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <Link to="/employees/onboarding" className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                <ArrowLeftIcon />
                <span className="ml-2 font-medium">Back to Onboarding Journey</span>
            </Link>
            <Card>
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Final Acknowledgement</h1>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">Please review your completed tasks and sign below to finalize your onboarding process.</p>
                </div>
            </Card>

            <Card title="Completed Task Summary">
                <ul className="divide-y divide-gray-200 dark:divide-gray-700 max-h-60 overflow-y-auto">
                    {checklist.tasks.map(task => (
                        <li key={task.id} className="py-3 flex justify-between items-center">
                            <p className="font-medium text-gray-800 dark:text-gray-200">{task.name}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Completed on: {task.completedAt ? new Date(task.completedAt).toLocaleDateString() : 'N/A'}
                            </p>
                        </li>
                    ))}
                </ul>
            </Card>

            <Card title="Acknowledgement & Signature">
                <div className="space-y-6">
                    <Input 
                        label="Full Name"
                        id="full-name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                    />
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Digital Signature</label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Type your name or draw your signature below.</p>
                        <SignaturePad ref={signaturePadRef} />
                    </div>

                    <div className="p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg text-sm text-gray-700 dark:text-gray-300">
                        By signing, you confirm that you have completed all assigned onboarding tasks and acknowledge receipt of all company policies provided.
                    </div>
                </div>
            </Card>
            
            <div className="flex justify-end">
                <Button size="lg" onClick={handleAcceptAndSign} isLoading={isLoading}>
                    Accept & Sign
                </Button>
            </div>
        </div>
    );
};

export default OnboardingSignPage;