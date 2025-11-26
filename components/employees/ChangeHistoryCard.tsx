import React from 'react';
import { ChangeHistory } from '../../types';
import Card from '../ui/Card';
import ChangeHistoryTable from './ChangeHistoryTable';

interface ChangeHistoryCardProps {
    history: ChangeHistory[];
}

const ChangeHistoryCard: React.FC<ChangeHistoryCardProps> = ({ history }) => {
    return (
        <Card title="Change History & Documents">
            <ChangeHistoryTable history={history} />
        </Card>
    );
};

export default ChangeHistoryCard;
