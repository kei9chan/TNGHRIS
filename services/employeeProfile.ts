export const resolveEmployeePosition = (position?: string | null, department?: string | null): string => {
  const storedPosition = position?.trim();
  if (storedPosition) return storedPosition;

  const departmentLabel = department?.trim() || '';
  const separatorIndex = departmentLabel.indexOf(' - ');
  if (separatorIndex >= 0) {
    const relatedPosition = departmentLabel.slice(separatorIndex + 3).trim();
    if (relatedPosition) return relatedPosition;
  }

  return '';
};

export const formatDateOnly = (value?: Date | string | null): string | null => {
  if (!value) return null;
  if (typeof value === 'string') {
    const clean = value.split('T')[0]?.trim();
    return clean || null;
  }
  if (Number.isNaN(value.getTime())) return null;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatHrisDate = (value?: Date | string | null): string => {
  if (!value) return 'Not Assigned';
  const parsed = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'Not Assigned';
  return parsed.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};
