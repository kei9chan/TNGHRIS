
import React, { useState } from 'react';
import { ManpowerRequest, ManpowerRequestStatus } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';

interface ManpowerReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    request: ManpowerRequest | null;
    onApprove: (requestId: string) => void;
    onReject: (requestId: string, reason: string) => void;
    canApprove?: boolean;
}

const ManpowerReviewModal: React.FC<ManpowerReviewModalProps> = ({ isOpen, onClose, request, onApprove, onReject, canApprove = false }) => {
    const [rejectReason, setRejectReason] = useState('');
    const [isRejecting, setIsRejecting] = useState(false);

    if (!request) return null;

    const handleApproveClick = () => {
        if (window.confirm(`Approve on-call request for ${request.businessUnitName} with a total cost of ${request.grandTotal?.toLocaleString()}?`)) {
            onApprove(request.id);
        }
    };

    const handleRejectClick = () => {
        setIsRejecting(true);
    };

    const confirmReject = () => {
        if (!rejectReason.trim()) {
            alert("Please provide a reason for rejection.");
            return;
        }
        onReject(request.id, rejectReason);
        setIsRejecting(false);
        setRejectReason('');
    };

    const totalRequested = request.items.reduce((sum, item) => sum + item.requestedCount, 0);

    const footer = (
        <div className="flex justify-end w-full space-x-2">
            <Button variant="secondary" onClick={onClose}>Close</Button>
            {canApprove && request.status === ManpowerRequestStatus.Pending && (
                <>
                    <Button variant="danger" onClick={handleRejectClick}>Reject</Button>
                    <Button variant="success" onClick={handleApproveClick}>Approve</Button>
                </>
            )}
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Manpower Request: ${request.businessUnitName}`}
            size="4xl"
            footer={footer}
        >
            <div className="space-y-6">
                {/* Header Summary */}
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                        <p className="text-gray-500 dark:text-gray-400">Date Needed</p>
                        <p className="font-bold text-gray-900 dark:text-white">{new Date(request.date).toLocaleDateString()}</p>
                    </div>
                    <div>
                        <p className="text-gray-500 dark:text-gray-400">Forecast PAX</p>
                        <p className="font-bold text-gray-900 dark:text-white">{request.forecastedPax}</p>
                    </div>
                     <div>
                        <p className="text-gray-500 dark:text-gray-400">Requested By</p>
                        <p className="font-bold text-gray-900 dark:text-white">{request.requesterName}</p>
                    </div>
                    <div>
                        <p className="text-gray-500 dark:text-gray-400">Status</p>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            request.status === 'Approved' ? 'bg-green-100 text-green-800' : 
                            request.status === 'Rejected' ? 'bg-red-100 text-red-800' : 
                            'bg-yellow-100 text-yellow-800'
                        }`}>
                            {request.status}
                        </span>
                    </div>
                     <div className="col-span-2 md:col-span-4 border-t border-blue-200 dark:border-blue-800 pt-2 mt-2 flex justify-between items-center">
                        <div>
                            {request.generalNote && (
                                <>
                                    <p className="text-gray-500 dark:text-gray-400">Event Context / Note</p>
                                    <p className="font-medium text-blue-800 dark:text-blue-300">{request.generalNote}</p>
                                </>
                            )}
                        </div>
                        <div className="text-right">
                             <p className="text-gray-500 dark:text-gray-400">Estimated Total Cost</p>
                             <p className="font-bold text-xl text-green-600 dark:text-green-400">{request.grandTotal?.toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                {/* Reject Input */}
                {isRejecting && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg animate-fade-in-down">
                        <Textarea 
                            label="Reason for Rejection" 
                            value={rejectReason} 
                            onChange={e => setRejectReason(e.target.value)} 
                            required 
                            autoFocus
                        />
                        <div className="mt-2 flex justify-end space-x-2">
                            <Button size="sm" variant="secondary" onClick={() => setIsRejecting(false)}>Cancel</Button>
                            <Button size="sm" variant="danger" onClick={confirmReject}>Confirm Rejection</Button>
                        </div>
                    </div>
                )}

                {/* Request Table */}
                <div className="overflow-x-auto border rounded-lg dark:border-gray-700">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-100 dark:bg-gray-900">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role/Area</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Current FTE</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Req. Count</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Rate/Day</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shift Time</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Justification</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {request.items.map((item) => (
                                <tr key={item.id}>
                                    <td className="px-4 py-3 text-sm font-medium">{item.role}</td>
                                    <td className="px-4 py-3 text-sm text-center">{item.currentFte}</td>
                                    <td className="px-4 py-3 text-sm text-center font-bold text-blue-600">{item.requestedCount}</td>
                                    <td className="px-4 py-3 text-sm text-right text-gray-600">{item.costPerHead?.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800 dark:text-gray-200">{item.totalItemCost?.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-sm">{item.shiftTime}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{item.justification}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-gray-50 dark:bg-gray-900 font-semibold">
                            <tr>
                                <td colSpan={2} className="px-4 py-3 text-right text-sm">Totals:</td>
                                <td className="px-4 py-3 text-center text-sm text-blue-600">{totalRequested}</td>
                                <td></td>
                                <td className="px-4 py-3 text-right text-sm text-green-600">{request.grandTotal?.toLocaleString()}</td>
                                <td colSpan={2}></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </Modal>
    );
};

export default ManpowerReviewModal;
