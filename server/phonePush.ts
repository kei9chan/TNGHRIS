import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const env = (key: string) => process.env[key]?.trim() || '';
export const pushConfigured = () => Boolean(env('PHONE_PUSH_SIGNING_SECRET') && env('PHONE_PUSH_PUBLIC_KEY') && env('PHONE_PUSH_PRIVATE_KEY'));
export function signPush(timestamp: number, nonce: string, action: string, payload: string, secret = env('PHONE_PUSH_SIGNING_SECRET')) {
  return createHmac('sha256', secret).update(`${timestamp}\n${nonce}\n${action}\n${payload}`).digest('hex');
}
export function dispatchAuthorized(body: any) {
  if (!pushConfigured() || !Number.isSafeInteger(body?.timestamp) || Math.abs(Date.now()/1000-body.timestamp)>120 || !/^[0-9a-f-]{36}$/.test(body?.nonce || '') || !/^[0-9a-f]{64}$/.test(body?.signature || '')) return false;
  const expected = signPush(body.timestamp, body.nonce, 'dispatch', '{}');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(body.signature));
}
export const validPushEndpoint = (endpoint: string) => {
  try {
    const u = new URL(endpoint);
    return u.protocol==='https:' && !u.username && !u.password && !u.port && !u.hash &&
      (u.hostname==='fcm.googleapis.com' || u.hostname==='updates.push.services.mozilla.com' || u.hostname.endsWith('.push.apple.com'));
  } catch { return false; }
};
export function pushClient(token?: string) {
  return createClient(env('SUPABASE_URL') || env('VITE_SUPABASE_URL'), env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY'), {
    auth:{persistSession:false,autoRefreshToken:false}, ...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{}) });
}
export async function signedPushRpc(action: string, args: any, client = pushClient()) {
  const timestamp=Math.floor(Date.now()/1000), nonce=randomUUID(), payload=JSON.stringify(args);
  const {data,error}=await client.rpc('phone_push_worker', {p_timestamp:timestamp,p_nonce:nonce,p_action:action,p_payload:payload,p_signature:signPush(timestamp,nonce,action,payload)});
  if(error) throw new Error('Phone notification delivery could not be recorded');
  return data;
}
export async function requirePushUser(req: any) {
  const token=typeof req.headers?.authorization==='string'?req.headers.authorization.match(/^Bearer (.+)$/)?.[1]:null;
  if(!token) throw Object.assign(new Error('Sign in to manage phone notifications'),{status:401});
  const client=pushClient(token), {data,error}=await client.auth.getUser(token);
  if(error || !data.user) throw Object.assign(new Error('Please sign in again'),{status:401});
  return client;
}
export async function sendPhonePush(job: any) {
  if(!validPushEndpoint(job.subscription?.endpoint)) return 'invalid';
  try {
    await webpush.sendNotification(job.subscription,JSON.stringify(job.payload),{
      vapidDetails:{subject:'https://tnghris-omega.vercel.app',publicKey:env('PHONE_PUSH_PUBLIC_KEY'),privateKey:env('PHONE_PUSH_PRIVATE_KEY')},
      TTL:Math.max(0,Math.min(3600,Math.floor((Date.parse(job.expires_at)-Date.now())/1000))), urgency:'normal', timeout:7000,
    });
    return 'sent'; // Accepted by the push provider; device display is acknowledged separately.
  } catch(e:any) {return [404,410].includes(e?.statusCode)?'expired':'retry';}
}
export async function drainPhonePush(onlyJob?: string, rpc=signedPushRpc, send=sendPhonePush) {
  const jobs=await rpc('claim',{job_id:onlyJob || null});
  const results:any[]=[];
  // Five concurrent sends bounds provider latency without overloading the queue.
  for(let offset=0;offset<jobs.length;offset+=5) {
    const batch=await Promise.all(jobs.slice(offset,offset+5).map(async(job:any)=>({id:job.id,lease:job.lease,status:await send(job)})));
    await rpc('finish',{results:batch});results.push(...batch);
  }
  return {accepted:results.filter(x=>x.status==='sent').length,retrying:results.filter(x=>x.status==='retry').length,total:results.length};
}
