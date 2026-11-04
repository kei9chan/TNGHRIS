import { NTE, NTEStatus } from '../types';

type ReceiptStatus = Pick<NTE, 'status' | 'receiptRecordedAt' | 'responseStage'>;

export function isNteAwaitingReceipt(nte: ReceiptStatus) {
  return nte.status === NTEStatus.Issued && !nte.receiptRecordedAt;
}

export function nteReceiptStatusLabel(nte: ReceiptStatus): string {
  if (isNteAwaitingReceipt(nte)) return 'Published — awaiting receipt';
  if (nte.status === NTEStatus.Closed) return 'Case closed';
  if (nte.responseStage) return nte.responseStage;
  if (nte.status === NTEStatus.Issued) return 'Receipt confirmed — awaiting explanation';
  return nte.status;
}
