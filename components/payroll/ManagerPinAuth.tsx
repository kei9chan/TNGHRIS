import React, { useState } from 'react';
import { Role } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { supabase } from '../../services/supabaseClient';

interface ManagerPinAuthProps {
    onAuthSuccess: () => void;
}

const ManagerPinAuth: React.FC<ManagerPinAuthProps> = ({ onAuthSuccess }) => {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleAuthorize = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const managerRoles = [Role.Manager, Role.BusinessUnitManager, Role.GeneralManager, Role.Admin, Role.HRManager, Role.HRStaff, Role.OperationsDirector];
            const { data, error: queryError } = await supabase
                .from('profiles')
                .select('id')
                .eq('security_pin', pin)
                .in('role', managerRoles)
                .limit(1)
                .maybeSingle();

            if (queryError) throw queryError;

            if (data) {
                onAuthSuccess();
            } else {
                setError('Invalid or incorrect manager PIN.');
            }
        } catch {
            setError('Authorization failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleAuthorize} className="space-y-4 max-w-sm mx-auto text-center">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Manager Authorization Required</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">A manager must enter their security PIN to authorize a manual clock-in/out.</p>
            <Input
                label="Manager Security PIN"
                id="manager-pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                required
                maxLength={6}
                error={error}
            />
            <Button type="submit" className="w-full" isLoading={isLoading}>
                Authorize
            </Button>
        </form>
    );
};

export default ManagerPinAuth;