import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Site, BusinessUnit } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';

declare global {
    interface Window {
        L: any;
    }
}

interface SiteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (site: Site) => void;
    site: Site | null;
    businessUnits: BusinessUnit[];
}

const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
const MapPinIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;

const SiteModal: React.FC<SiteModalProps> = ({ isOpen, onClose, onSave, site, businessUnits }) => {
    const [current, setCurrent] = useState<Partial<Site>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    
    const mapRef = useRef<HTMLDivElement>(null);
    const leafletMap = useRef<any>(null);
    const markerRef = useRef<any>(null);
    const circleRef = useRef<any>(null);

    useEffect(() => {
        // destroy old map before re-init
        if (leafletMap.current) {
            leafletMap.current.remove();
            leafletMap.current = null;
        }
        if (isOpen) {
            // Default to Manila if new
            const initialSite = site || {
                name: '',
                latitude: 14.5995, 
                longitude: 120.9842,
                radiusMeters: 100,
                businessUnitId: businessUnits.length > 0 ? businessUnits[0].id : ''
            };
            setCurrent(initialSite);
            
            // Small delay to ensure DOM is ready for Leaflet
            setTimeout(() => {
                initMap(initialSite.latitude || 14.5995, initialSite.longitude || 120.9842, initialSite.radiusMeters || 100);
            }, 100);
        }
        
        return () => {
            if (leafletMap.current) {
                leafletMap.current.remove();
                leafletMap.current = null;
            }
        };
    }, [site, isOpen, businessUnits]);

    // Update map circle when radius changes via input
    useEffect(() => {
        if (circleRef.current && current.radiusMeters) {
            circleRef.current.setRadius(current.radiusMeters);
        }
    }, [current.radiusMeters]);

    const initMap = (lat: number, lng: number, radius: number) => {
        if (leafletMap.current) return; // Already initialized
        if (!mapRef.current || !window.L) return;

        const L = window.L;
        
        // Create Map
        const map = L.map(mapRef.current).setView([lat, lng], 15);
        leafletMap.current = map;

        // Add Tile Layer (OpenStreetMap)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        // Add Draggable Marker
        const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        markerRef.current = marker;

        // Add Radius Circle
        const circle = L.circle([lat, lng], {
            color: '#4f46e5',
            fillColor: '#4f46e5',
            fillOpacity: 0.2,
            radius: radius
        }).addTo(map);
        circleRef.current = circle;

        // Event: Drag End
        marker.on('dragend', function (e: any) {
            const pos = e.target.getLatLng();
            updateCoordinates(pos.lat, pos.lng);
        });

        // Event: Map Click
        map.on('click', function (e: any) {
            const { lat, lng } = e.latlng;
            updateCoordinates(lat, lng);
        });
    };

    const updateCoordinates = (lat: number, lng: number) => {
        setCurrent(prev => ({ ...prev, latitude: lat, longitude: lng }));
        if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
        if (circleRef.current) circleRef.current.setLatLng([lat, lng]);
    };
    
    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);

        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
            const data = await response.json();

            if (data && data.length > 0) {
                const { lat, lon } = data[0];
                const newLat = parseFloat(lat);
                const newLng = parseFloat(lon);
                
                updateCoordinates(newLat, newLng);
                leafletMap.current.setView([newLat, newLng], 15);
            } else {
                alert("Location not found. Please try a more specific address.");
            }
        } catch (error) {
            console.error("Search error", error);
            alert("Failed to search location.");
        } finally {
            setIsSearching(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setCurrent(prev => ({
            ...prev,
            [name]: type === 'number' ? parseFloat(value) || 0 : value
        }));
    };

    const handleSave = () => {
        if (current.name?.trim() && current.businessUnitId) {
            onSave(current as Site);
        } else {
            alert('Site Name and Business Unit are required.');
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={site ? 'Edit Geofence Site' : 'Add New Geofence Site'}
            size="4xl"
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>{site ? 'Save Changes' : 'Add Site'}</Button>
                </div>
            }
        >
            <div className="flex flex-col lg:flex-row gap-6 h-[600px]">
                {/* LEFT COLUMN: Form Fields */}
                <div className="w-full lg:w-1/3 space-y-4 overflow-y-auto pr-2">
                    <Input label="Site Name" name="name" value={current.name || ''} onChange={handleChange} required placeholder="e.g. Head Office" />
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                        <select
                            name="businessUnitId"
                            value={current.businessUnitId}
                            onChange={handleChange}
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            {businessUnits.map(bu => (
                                <option key={bu.id} value={bu.id}>{bu.name}</option>
                            ))}
                        </select>
                    </div>

                    <Input label="Timezone" name="timezone" value={(current as any).timezone || ''} onChange={handleChange} placeholder="e.g., Asia/Manila" />

                    <div>
                         <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Geofence Radius (meters)</label>
                         <div className="flex items-center space-x-4">
                            <input 
                                type="range" 
                                min="10" 
                                max="500" 
                                step="10"
                                value={current.radiusMeters || 100} 
                                onChange={(e) => setCurrent(prev => ({...prev, radiusMeters: parseInt(e.target.value)}))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                            />
                            <input 
                                type="number" 
                                className="w-20 px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                                value={current.radiusMeters || 100}
                                onChange={handleChange}
                                name="radiusMeters"
                            />
                         </div>
                         <p className="text-xs text-gray-500 mt-1">Employees must be within this circle to clock in/out.</p>
                    </div>

                    <div className="p-3 bg-gray-50 dark:bg-slate-900/50 rounded border dark:border-gray-700">
                        <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                            <MapPinIcon /> Coordinates
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                            <Input label="Latitude" name="latitude" type="number" step="any" value={current.latitude || ''} onChange={handleChange} required />
                            <Input label="Longitude" name="longitude" type="number" step="any" value={current.longitude || ''} onChange={handleChange} required />
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            Drag the pin on the map or click a location to update coordinates automatically.
                        </p>
                    </div>
                </div>

                {/* RIGHT COLUMN: Map */}
                <div className="w-full lg:w-2/3 flex flex-col h-full">
                    <div className="relative mb-2">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <SearchIcon />
                        </div>
                        <input 
                            type="text"
                            placeholder="Search location (e.g. 'SM Megamall', 'Makati City')"
                            className="block w-full pl-10 pr-20 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                         <button 
                            onClick={handleSearch}
                            className="absolute inset-y-0 right-0 px-4 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-r-md focus:outline-none"
                            disabled={isSearching}
                        >
                            {isSearching ? '...' : 'Search'}
                        </button>
                    </div>
                    
                    <div className="flex-grow border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden relative bg-gray-100">
                         <div ref={mapRef} className="w-full h-full z-0" />
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default SiteModal;
