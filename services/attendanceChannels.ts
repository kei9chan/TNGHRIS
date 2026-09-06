import {supabase} from './supabaseClient';
export type ClockEvidence={method:'web'|'gps'|'qr';siteId?:string;latitude?:number;longitude?:number;accuracy?:number;token?:string};
export type ChannelConfig={business_unit_id:string;revision:number;web_allowed:boolean;gps_enabled:boolean;qr_enabled:boolean};
export type Channels={config:ChannelConfig;sites:{id:string;name:string}[];canManage:boolean};
export type AttendanceDevice={id:string;name:string;site_id:string;business_unit_id:string;kind:'qr'|'biometric';active:boolean};
export type ImportRow={code:string;timestamp:string;action:string;workDate?:string};
export type ImportPreview={id:string;sourceHash:string;rows:(ImportRow&{employeeId:string;employeeName:string;key:string})[]};
export async function channelRpc<T>(name:string,args:Record<string,unknown>={}):Promise<T>{const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message);return data as T;}
export const getChannels=()=>channelRpc<Channels>('get_attendance_channels');
export function captureGps(siteId:string):Promise<ClockEvidence>{return new Promise((resolve,reject)=>{if(!navigator.geolocation){reject(new Error('Location is unavailable on this device.'));return;}navigator.geolocation.getCurrentPosition(p=>resolve({method:'gps',siteId,latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}),()=>reject(new Error('Allow location access, then try again at your work site.')),{enableHighAccuracy:true,maximumAge:0,timeout:20000});});}
