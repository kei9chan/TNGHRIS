import {dispatchAuthorized,drainPhonePush,pushClient} from '../../server/phonePush.js';
export const config={maxDuration:60};
export default async function handler(req:any,res:any) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  if(!dispatchAuthorized(req.body)) return res.status(401).json({error:'Unauthorized'});
  try {
    const {error}=await pushClient().rpc('phone_push_worker',{p_timestamp:req.body.timestamp,p_nonce:req.body.nonce,p_action:'dispatch',p_payload:'{}',p_signature:req.body.signature});
    if(error) return res.status(401).json({error:'Dispatch authorization expired or already used'});
    return res.status(200).json(await drainPhonePush());
  }
  catch {return res.status(503).json({error:'Phone notification delivery unavailable'});}
}
