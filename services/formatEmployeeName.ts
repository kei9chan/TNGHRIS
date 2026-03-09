const particles = new Set(['de', 'del', 'dela', 'da', 'van', 'von']);

export const formatEmployeeName = (rawName: string) => {
  const trimmed = (rawName || '').trim();
  if (!trimmed) return rawName;
  if (trimmed.includes('@')) return trimmed;
  if (/[(),]/.test(trimmed)) return trimmed;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return trimmed;
  let lastNameParts = [parts[parts.length - 1]];
  const prior = parts[parts.length - 2]?.toLowerCase();
  if (prior && particles.has(prior)) {
    lastNameParts = [parts[parts.length - 2], parts[parts.length - 1]];
  }
  const lastName = lastNameParts.join(' ');
  const firstName = parts[0];
  const middleParts = parts.slice(1, parts.length - lastNameParts.length);
  const middleInitial = middleParts[0] ? `${middleParts[0][0].toUpperCase()}.` : '';
  return `${lastName}, ${firstName}${middleInitial ? ` ${middleInitial}` : ''}`;
};
