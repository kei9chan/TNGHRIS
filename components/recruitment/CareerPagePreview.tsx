
import React, { useEffect, useMemo, useState } from 'react';
import { ApplicantPageTheme, JobPost } from '../../types';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { getApplicationPath, getOpenRolesConfig, getOpenRolesPath, getRolePath, isJobCurrentlyOpen, mapPublicJobPost, normalizeWorkplaceGallery } from '../../services/publicCareersService';

interface CareerPagePreviewProps {
    theme?: ApplicantPageTheme;
    isPublic?: boolean;
    isPreview?: boolean;
}

// Icons
const RocketIcon = ({className}: any) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
const SmileIcon = ({className}: any) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const WalletIcon = ({className}: any) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>;
const HeartIcon = ({className}: any) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>;
const StarIcon = ({className}: any) => <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>;

const iconMap = {
    rocket: RocketIcon,
    smile: SmileIcon,
    wallet: WalletIcon,
    heart: HeartIcon,
    star: StarIcon,
};

const withAlpha = (color: string, alpha: number): string => {
    const value = color.trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) {
        const red = parseInt(value.slice(1, 3), 16);
        const green = parseInt(value.slice(3, 5), 16);
        const blue = parseInt(value.slice(5, 7), 16);
        return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    }
    return value;
};

const CareerPagePreview: React.FC<CareerPagePreviewProps> = ({ theme: propTheme, isPublic, isPreview }) => {
    const { slug } = useParams<{ slug: string }>();
    const [theme, setTheme] = useState<ApplicantPageTheme | null>(propTheme || null);
    const [jobs, setJobs] = useState<JobPost[]>([]);
    const [buName, setBuName] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(!propTheme);
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);
    const [galleryIndex, setGalleryIndex] = useState(0);

    const mapTheme = useMemo(() => (row: any): ApplicantPageTheme => {
        const sections = row.sections || {};
        return {
            id: row.id,
            businessUnitId: row.business_unit_id,
            name: row.name || row.page_title || row.slug || 'Career Page',
            slug: row.slug,
            pageTitle: row.page_title,
            heroHeadline: row.hero_headline,
            heroDescription: row.hero_description,
            heroOverlayColor: sections.heroOverlayColor || 'rgba(0,0,0,0.5)',
            primaryColor: row.primary_color,
            backgroundColor: row.background_color,
            heroImage: row.hero_image_url || '',
            logoImage: row.logo_url || '',
            benefits: sections.benefits || [],
            testimonials: sections.testimonials || [],
            workplaceGallery: normalizeWorkplaceGallery(sections.workplaceGallery || sections.workplaceAlbum),
            contactEmail: sections.contactEmail || '',
            sections,
            isActive: row.is_active ?? true,
        };
    }, []);

    useEffect(() => {
        const fetchThemeAndJobs = async (incomingTheme?: ApplicantPageTheme | null) => {
            setLoading(true);
            try {
                let resolvedTheme = incomingTheme || null;
                if (!resolvedTheme) {
                    const { data: themeRow, error } = await supabase
                        .from('applicant_page_themes')
                        .select('*')
                        .eq('slug', slug || '')
                        .eq('is_active', true)
                        .maybeSingle();
                    if (error) throw error;
                    if (!themeRow) {
                        setTheme(null);
                        return;
                    }
                    resolvedTheme = mapTheme(themeRow);
                    setTheme(resolvedTheme);
                }

                // BU name
                if (resolvedTheme?.businessUnitId) {
                    const { data: bu, error: buErr } = await supabase
                        .from('business_units')
                        .select('name')
                        .eq('id', resolvedTheme.businessUnitId)
                        .maybeSingle();
                    if (!buErr && bu?.name) setBuName(bu.name);
                }

                if (resolvedTheme?.businessUnitId) {
                    const { data: jobRows, error: jobErr } = await supabase
                        .from('job_posts')
                        .select('*')
                        .eq('business_unit_id', resolvedTheme.businessUnitId);
                    if (jobErr) throw jobErr;
                    setJobs((jobRows || []).map(mapPublicJobPost));
                } else {
                    setJobs([]);
                }
            } catch (err) {
                console.error('Failed to load public career page', err);
            } finally {
                setLoading(false);
            }
        };

        // For public route, always fetch; for preview with provided theme, still fetch jobs
        if (isPublic || (!isPublic && !propTheme)) {
            fetchThemeAndJobs(propTheme || null);
        } else if (propTheme) {
            // still fetch jobs for preview if needed
            setTheme(propTheme);
            fetchThemeAndJobs(propTheme);
        }
    }, [propTheme, slug, mapTheme, isPublic]);

    const openJobs = useMemo(
        () => jobs.filter(j => isJobCurrentlyOpen(j)),
        [jobs]
    );

    const galleryPhotos = useMemo(
        () => [...(theme?.workplaceGallery || [])]
            .filter(photo => photo.isActive !== false && photo.url)
            .sort((left, right) => Number(right.isFeatured === true) - Number(left.isFeatured === true)),
        [theme?.workplaceGallery]
    );

    if (loading) {
        return <div className="p-10 text-center">Loading...</div>;
    }

    if (!theme) {
        return <div className="p-10 text-center">Page not found.</div>;
    }

    const scrollToJobs = () => {
        const element = document.getElementById('jobs');
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const openRolesPath = getOpenRolesPath(theme.slug, theme);
    const openRolesConfig = getOpenRolesConfig(theme);
    const displayedJobs = openJobs.slice(0, 6);
    const benefits = (theme.benefits || []).filter(benefit => benefit.title?.trim() || benefit.description?.trim());
    const ctaLabel = theme.ctaText?.trim() || 'View Open Roles';
    const configuredCtaDestination = theme.ctaLink?.trim();
    const ctaDestination = configuredCtaDestination && configuredCtaDestination !== '/open-roles' ? configuredCtaDestination : openRolesPath;

    const openGallery = (index = 0) => {
        if (!galleryPhotos.length) return;
        setGalleryIndex(Math.min(index, galleryPhotos.length - 1));
        setIsGalleryOpen(true);
    };

    return (
        <div className="min-h-screen font-sans" style={{ backgroundColor: theme.backgroundColor }}>
            {/* Public Nav for Context */}
            {(isPublic || isPreview) && (
                <div className="bg-white shadow p-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 sticky top-0 z-50">
                    <Link to={isPreview ? '#' : `/careers/${theme.slug}`} className="flex items-center min-w-0 text-gray-800">
                        {theme.logoImage ? (
                            <img src={theme.logoImage} alt={`${buName || theme.pageTitle} logo`} className="h-10 max-w-[190px] object-contain" />
                        ) : (
                            <span className="font-bold text-xl truncate">{buName || theme.pageTitle}</span>
                        )}
                    </Link>
                    <nav className="flex flex-wrap items-center gap-3 text-sm font-medium">
                        {openRolesConfig.enabled && openRolesConfig.published && <Link to={isPreview ? '#' : openRolesPath} className="text-gray-600 hover:text-gray-900">{openRolesConfig.navigationLabel}</Link>}
                        {openRolesConfig.enabled && openRolesConfig.published && <Link to={isPreview ? '#' : openRolesPath} className="px-3 py-2 rounded-md text-white" style={{ backgroundColor: theme.primaryColor }}>Apply Now</Link>}
                        <Link to={isPreview ? '#' : '/login'} className="text-sm text-blue-600 hover:underline">Admin Login</Link>
                    </nav>
                </div>
            )}

            {/* HERO */}
            <div className="relative bg-white overflow-hidden">
                <div className="max-w-7xl mx-auto">
                    <div className="relative z-10 pb-8 bg-white sm:pb-16 md:pb-20 lg:max-w-2xl lg:w-full lg:pb-28 xl:pb-32" style={{ backgroundColor: theme.backgroundColor }}>
                        <main className="mt-10 mx-auto max-w-7xl px-4 sm:mt-12 sm:px-6 md:mt-16 lg:mt-20 lg:px-8 xl:mt-28">
                            <div className="sm:text-center lg:text-left">
                                <div className="mb-5 flex justify-center lg:justify-start">
                                    {theme.logoImage ? (
                                        <img src={theme.logoImage} alt={`${buName || theme.pageTitle} logo`} className="h-14 max-w-[240px] object-contain" />
                                    ) : (
                                        <span className="inline-flex rounded-full px-4 py-2 text-sm font-extrabold uppercase tracking-[0.18em]" style={{ color: theme.primaryColor, backgroundColor: withAlpha(theme.primaryColor, 0.1) }}>{buName || theme.pageTitle}</span>
                                    )}
                                </div>
                                <h1 className="text-4xl tracking-tight font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
                                    {theme.heroHeadline && <span className="block xl:inline" style={{ color: theme.primaryColor }}>{theme.heroHeadline}</span>}
                                </h1>
                                {theme.heroDescription && <p className="mt-3 text-base text-gray-500 sm:mt-5 sm:text-lg sm:max-w-xl sm:mx-auto md:mt-5 md:text-xl lg:mx-0">{theme.heroDescription}</p>}
                                <div className="mt-5 sm:mt-8 sm:flex sm:justify-center lg:justify-start">
                                    <div className="rounded-md shadow">
                                        {isPreview || !openRolesConfig.enabled || !openRolesConfig.published ? (
                                            <button
                                                onClick={scrollToJobs}
                                                className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white md:py-4 md:text-lg transition-transform hover:scale-105"
                                                style={{ backgroundColor: theme.primaryColor }}
                                            >
                                                {ctaLabel}
                                            </button>
                                        ) : (
                                            <Link
                                                to={ctaDestination}
                                                className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white md:py-4 md:text-lg transition-transform hover:scale-105"
                                                style={{ backgroundColor: theme.primaryColor }}
                                            >
                                                {ctaLabel}
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </main>
                    </div>
                </div>
                <div className="lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2">
                    {theme.heroImage ? (
                        <img
                            className="h-56 w-full object-cover sm:h-72 md:h-96 lg:w-full lg:h-full"
                            src={theme.heroImage}
                            alt="Hero"
                        />
                    ) : (
                        <div className="h-56 w-full sm:h-72 md:h-96 lg:w-full lg:h-full flex items-center justify-center" style={{ backgroundColor: theme.primaryColor, opacity: 0.1 }}>
                            <span className="text-4xl font-bold opacity-20 uppercase tracking-widest transform -rotate-12">Join Us!</span>
                        </div>
                    )}
                </div>
            </div>

            {/* WHY JOIN US */}
            {benefits.length > 0 && (
                <section className="py-14 bg-white">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center">
                            <p className="text-sm font-extrabold tracking-[0.2em] uppercase" style={{ color: theme.primaryColor }}>Why Join Us?</p>
                            <h2 className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">A better way to work</h2>
                        </div>
                        <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                            {benefits.map((benefit, index) => {
                                const IconComponent = iconMap[benefit.icon as keyof typeof iconMap] || StarIcon;
                                return (
                                    <article key={benefit.id} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg" style={{ boxShadow: `0 12px 32px ${withAlpha(theme.primaryColor, 0.1)}` }}>
                                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: theme.primaryColor, filter: `hue-rotate(${index * 35}deg)` }}>
                                            <IconComponent className="h-6 w-6" />
                                        </div>
                                        {benefit.title && <h3 className="mt-5 text-lg font-bold text-gray-900">{benefit.title}</h3>}
                                        {benefit.description && <p className="mt-2 text-sm leading-6 text-gray-600">{benefit.description}</p>}
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                </section>
            )}

            {/* OPEN ROLES */}
            <section id="jobs" className="py-14" style={{ backgroundColor: theme.backgroundColor }}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center">
                        <p className="text-sm font-extrabold tracking-[0.2em] uppercase" style={{ color: theme.primaryColor }}>Open Roles</p>
                        <h2 className="mt-2 text-3xl font-extrabold text-gray-900 sm:text-4xl">Current opportunities</h2>
                    </div>
                    {openJobs.length === 0 ? (
                        <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-white/70 p-8 text-center text-gray-600">No open positions for {buName || 'this business unit'} at the moment. Please check back later.</div>
                    ) : (
                        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                            {displayedJobs.map(job => (
                                <article key={job.id} className="rounded-2xl bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {job.isFeatured && <span className="px-2 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">Featured</span>}
                                        {job.isUrgent && <span className="px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">Urgent</span>}
                                    </div>
                                    <h3 className="text-lg leading-6 font-bold text-gray-900">{job.title}</h3>
                                    <p className="mt-3 text-sm text-gray-600">{job.departmentLabel} <span aria-hidden="true">•</span> {job.locationLabel}</p>
                                    <p className="mt-1 text-sm text-gray-500">{job.employmentType}</p>
                                    <div className="mt-5 flex flex-wrap gap-2">
                                        <Link to={isPreview ? '#' : getRolePath(theme.slug, job)} className="inline-flex items-center justify-center px-4 py-2 border font-medium rounded-full text-sm" style={{ borderColor: theme.primaryColor, color: theme.primaryColor }}>View Role</Link>
                                        {!isPreview && <Link to={getApplicationPath(theme.slug, job, openRolesConfig.pageSlug)} className="inline-flex items-center justify-center px-4 py-2 border border-transparent font-medium rounded-full text-white text-sm" style={{ backgroundColor: theme.primaryColor }}>Apply Now</Link>}
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                    {openJobs.length > displayedJobs.length && (
                        <div className="mt-8 text-center">
                            {isPreview ? (
                                <button type="button" onClick={scrollToJobs} className="font-semibold" style={{ color: theme.primaryColor }}>View all roles →</button>
                            ) : (
                                <Link to={openRolesPath} className="font-semibold" style={{ color: theme.primaryColor }}>View all roles →</Link>
                            )}
                        </div>
                    )}
                </div>
            </section>

            {/* WORKPLACE ALBUM */}
            {galleryPhotos.length > 0 && (
                <section className="py-14 bg-white">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <p className="text-sm font-extrabold tracking-[0.2em] uppercase" style={{ color: theme.primaryColor }}>Workplace Album</p>
                                <h2 className="mt-2 text-3xl font-extrabold text-gray-900 sm:text-4xl">See what your workplace looks like</h2>
                            </div>
                            <span className="text-sm font-medium text-gray-500">{galleryPhotos.length} {galleryPhotos.length === 1 ? 'photo' : 'photos'}</span>
                        </div>
                        <div className="mt-8 grid gap-3 md:grid-cols-5 md:grid-rows-2">
                            <button type="button" onClick={() => openGallery(0)} className="group relative overflow-hidden rounded-2xl md:col-span-3 md:row-span-2 aspect-[4/3] md:aspect-auto">
                                <img src={galleryPhotos[0].url} alt={galleryPhotos[0].caption || 'Featured workplace'} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-5 text-left text-sm font-medium text-white opacity-0 transition group-hover:opacity-100">{galleryPhotos[0].caption || 'Featured workplace photo'}</span>
                            </button>
                            <div className="grid grid-cols-2 gap-3 md:col-span-2 md:row-span-2">
                                {galleryPhotos.slice(1, 5).map((photo, index) => <button type="button" key={photo.id} onClick={() => openGallery(index + 1)} className="group relative min-h-[120px] overflow-hidden rounded-2xl"><img src={photo.url} alt={photo.caption || `Workplace photo ${index + 2}`} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /></button>)}
                            </div>
                        </div>
                        <div className="mt-5 text-right"><button type="button" onClick={() => openGallery(0)} className="font-semibold" style={{ color: theme.primaryColor }}>View all photos →</button></div>
                    </div>
                </section>
            )}

            {/* FOOTER */}
            <footer className="bg-gray-800 text-white py-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center">
                    <div className="mb-4 md:mb-0">
                        <h3 className="text-lg font-bold">{theme.pageTitle}</h3>
                        <p className="text-gray-400 text-sm">Powered by TNG HRIS</p>
                    </div>
                    <div>
                        {theme.contactEmail && <p className="text-gray-300">Contact: <a href={`mailto:${theme.contactEmail}`} className="hover:text-white underline">{theme.contactEmail}</a></p>}
                    </div>
                </div>
            </footer>

            {isGalleryOpen && galleryPhotos.length > 0 && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Workplace photo album"
                    onClick={() => setIsGalleryOpen(false)}
                >
                    <div className="relative flex max-h-full w-full max-w-5xl flex-col items-center gap-4" onClick={event => event.stopPropagation()}>
                        <button type="button" onClick={() => setIsGalleryOpen(false)} className="absolute right-0 top-0 z-10 rounded-full bg-white/90 px-3 py-2 text-xl font-bold text-gray-900" aria-label="Close photo album">×</button>
                        <img src={galleryPhotos[galleryIndex].url} alt={galleryPhotos[galleryIndex].caption || `Workplace photo ${galleryIndex + 1}`} className="max-h-[78vh] w-auto max-w-full rounded-xl object-contain" />
                        {galleryPhotos[galleryIndex].caption && <p className="text-center text-sm text-white">{galleryPhotos[galleryIndex].caption}</p>}
                        {galleryPhotos.length > 1 && (
                            <div className="flex items-center gap-4">
                                <button type="button" onClick={() => setGalleryIndex(current => (current - 1 + galleryPhotos.length) % galleryPhotos.length)} className="rounded-full bg-white px-4 py-2 font-semibold text-gray-900">Previous</button>
                                <span className="text-sm text-white">{galleryIndex + 1} / {galleryPhotos.length}</span>
                                <button type="button" onClick={() => setGalleryIndex(current => (current + 1) % galleryPhotos.length)} className="rounded-full bg-white px-4 py-2 font-semibold text-gray-900">Next</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
};

export default CareerPagePreview;
