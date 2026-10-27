/** Legacy decisions use strings; leave-exception decisions use structured notes. */
export const leaveHistoryEntries = (value: unknown): Record<string, any>[] =>
  Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) : [];

export const formatLeaveHistoryDetails = (item: any): string => {
  const value = item?.details ?? item?.note ?? item?.reason;
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const note = value.note ?? value.reason;
    if (typeof note === 'string' && note.trim()) return note;
    const outcome = { lwop: 'Leave Without Pay', paid_exception: 'Paid leave exception', rejected: 'Rejected' }[value.outcome as string];
    if (outcome) return outcome;
  }
  return JSON.stringify(value) ?? '';
};
