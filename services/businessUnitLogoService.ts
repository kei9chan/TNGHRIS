import { supabase } from './supabaseClient';

export interface BusinessUnitLogo {
  businessUnitId: string;
  path: string;
  url: string;
  updatedAt?: string;
}

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_EDGE = 4096;
const MAX_PIXELS = 8_000_000;
const ALLOWED: Record<string, { mime: string; extension: string }> = {
  png: { mime: 'image/png', extension: 'png' },
  jpg: { mime: 'image/jpeg', extension: 'jpg' },
  jpeg: { mime: 'image/jpeg', extension: 'jpeg' },
  webp: { mime: 'image/webp', extension: 'webp' },
  svg: { mime: 'image/svg+xml', extension: 'svg' },
};

const fileExtension = (file: File) => file.name.split('.').pop()?.toLowerCase() || '';

const validateSvg = async (file: File) => {
  const source = await file.text();
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('SVG logos cannot contain document types or entity declarations.');
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const svg = doc.documentElement;
  if (doc.querySelector('parsererror') || svg.localName !== 'svg') throw new Error('Choose a valid SVG image.');
  if (svg.querySelector('script, foreignObject, iframe, object, embed, audio, video')) throw new Error('SVG logos cannot contain scripts or embedded content.');
  const hasExternalCssResource = (value: string) => {
    if (/@import/i.test(value)) return true;
    return Array.from(value.matchAll(/url\(([^)]*)\)/gi)).some(match => {
      const target = match[1].trim().replace(/^['"]|['"]$/g, '');
      return !target.startsWith('#');
    });
  };
  if (Array.from(svg.querySelectorAll('style')).some(style => hasExternalCssResource(style.textContent || ''))) {
    throw new Error('SVG logos cannot load external styles or resources.');
  }
  for (const node of Array.from(svg.querySelectorAll('*'))) {
    for (const attr of Array.from(node.attributes)) {
      if (/^on/i.test(attr.name)) throw new Error('SVG logos cannot contain event handlers.');
      if (attr.name.toLowerCase() === 'style' && hasExternalCssResource(attr.value)) throw new Error('SVG logos cannot load external styles or resources.');
      if (['href', 'xlink:href'].includes(attr.name.toLowerCase()) && !attr.value.startsWith('#')) {
        throw new Error('SVG logos cannot load external resources.');
      }
    }
  }
  const viewBox = (svg.getAttribute('viewBox') || '').trim().split(/[ ,]+/).map(Number);
  const explicitDimension = (value: string | null) => value && /^\s*\d+(?:\.\d+)?\s*(?:px)?\s*$/i.test(value) ? Number.parseFloat(value) : 0;
  const width = explicitDimension(svg.getAttribute('width')) || viewBox[2] || 0;
  const height = explicitDimension(svg.getAttribute('height')) || viewBox[3] || 0;
  if (!width || !height || width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) {
    throw new Error('Logo dimensions must be at most 4096 × 4096 pixels.');
  }
};

export const validateBusinessUnitLogo = async (file: File) => {
  const ext = fileExtension(file);
  const spec = ALLOWED[ext];
  if (!spec || file.type !== spec.mime) throw new Error('Use a PNG, JPG, JPEG, WEBP, or SVG logo with a matching file type.');
  if (!file.size || file.size > MAX_BYTES) throw new Error('Logo must be smaller than 2 MB.');
  if (ext === 'svg') {
    await validateSvg(file);
  } else {
    const image = await createImageBitmap(file);
    const valid = image.width > 0 && image.height > 0 && image.width <= MAX_EDGE && image.height <= MAX_EDGE && image.width * image.height <= MAX_PIXELS;
    image.close();
    if (!valid) throw new Error('Logo dimensions must be at most 4096 × 4096 pixels.');
  }
  return spec;
};

const publicUrl = (path: string) => supabase.storage.from('business-unit-logos').getPublicUrl(path).data.publicUrl;

export const loadBusinessUnitLogos = async (): Promise<Record<string, string>> => {
  const { data, error } = await supabase.from('business_unit_logos').select('business_unit_id,logo_path,logo_url,is_removed');
  if (error) throw new Error(error.message || 'Unable to load business-unit logos.');
  return (data || []).reduce((logos: Record<string, string>, row: any) => {
    logos[row.business_unit_id] = row.is_removed ? '' : row.logo_path ? publicUrl(row.logo_path) : row.logo_url;
    return logos;
  }, {});
};

export const saveBusinessUnitLogo = async (businessUnitId: string, file: File): Promise<BusinessUnitLogo> => {
  if (!businessUnitId) throw new Error('Choose a business unit before uploading its logo.');
  const spec = await validateBusinessUnitLogo(file);
  const path = `business-units/${businessUnitId}/${crypto.randomUUID()}.${spec.extension}`;
  const { data: previous, error: readError } = await supabase.from('business_unit_logos')
    .select('logo_path').eq('business_unit_id', businessUnitId).maybeSingle();
  if (readError) throw new Error(readError.message || 'Unable to load the current business-unit logo.');

  const { error: uploadError } = await supabase.storage.from('business-unit-logos').upload(path, file, {
    contentType: spec.mime,
    upsert: false,
    cacheControl: '3600',
  });
  if (uploadError) throw new Error(uploadError.message || 'Unable to upload the logo.');

  const { data: actorId, error: actorError } = await supabase.rpc('current_hris_user_id');
  if (actorError) {
    await supabase.storage.from('business-unit-logos').remove([path]);
    throw new Error(actorError.message || 'Unable to resolve the current HR user.');
  }
  const { error: saveError } = await supabase.from('business_unit_logos').upsert({
    business_unit_id: businessUnitId,
    logo_path: path,
    logo_url: null,
    is_removed: false,
    updated_by: actorId || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'business_unit_id' });
  if (saveError) {
    await supabase.storage.from('business-unit-logos').remove([path]);
    throw new Error(saveError.message || 'Unable to save the business-unit logo.');
  }
  if (previous?.logo_path && previous.logo_path !== path) {
    await supabase.storage.from('business-unit-logos').remove([previous.logo_path]);
  }
  return { businessUnitId, path, url: publicUrl(path), updatedAt: new Date().toISOString() };
};

export const removeBusinessUnitLogo = async (businessUnitId: string): Promise<void> => {
  const { data: previous, error: readError } = await supabase.from('business_unit_logos')
    .select('logo_path').eq('business_unit_id', businessUnitId).maybeSingle();
  if (readError) throw new Error(readError.message || 'Unable to load the saved logo.');
  const { data: actorId, error: actorError } = await supabase.rpc('current_hris_user_id');
  if (actorError) throw new Error(actorError.message || 'Unable to resolve the current HR user.');
  const { error } = await supabase.from('business_unit_logos').upsert({
    business_unit_id: businessUnitId,
    logo_path: null,
    logo_url: null,
    is_removed: true,
    updated_by: actorId || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'business_unit_id' });
  if (error) throw new Error(error.message || 'Unable to remove the business-unit logo.');
  if (previous?.logo_path) {
    // The BU record is the source of truth. A failed best-effort object cleanup
    // must not leave a removed logo visible in the builder.
    await supabase.storage.from('business-unit-logos').remove([previous.logo_path]);
  }
};
