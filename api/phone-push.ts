import { drainPhonePush, pushConfigured, requirePushUser } from '../server/phonePush.js';
export const config={maxDuration:60};
export default async function handler(req:any,res:any) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try {
    if(!pushConfigured()) return res.status(503).json({error:'Phone notifications are not configured yet'});
    const client=await requirePushUser(req);
    const {data,error}=await client.rpc('phone_push_test',{p_device:req.body?.device_id});
    if(error) return res.status(error.code==='42501'?403:400).json({error:error.message});
    const result=await drainPhonePush(data.job_id);
    return res.status(200).json({...result,job_id:data.job_id,message:result.accepted?'Sent to your phone notification provider. Look for the test alert.':'Delivery is queued for retry. Check your connection and notification settings.'});
  } catch(e:any) {return res.status(e.status || 503).json({error:e.status?e.message:'The test notification could not be sent. Please try again.'});}
}
