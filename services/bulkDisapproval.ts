export type DisapprovalItem = {id:string;reference:string;employee:string;employeeId?:string};
export type DisapprovalResult = DisapprovalItem & {outcome:'Disapproved'|'Already recorded'|'Not saved';message:string};

// The existing server decision function checks the actor, assignment and current stage
// for every item, locks the request, and keeps its decision history/idempotency.
export async function disapproveSelected(
 items:DisapprovalItem[], reason:string,
 decide:(id:string,note:string)=>Promise<{alreadyDecided?:boolean;status?:string}>,
 progress:(results:DisapprovalResult[])=>void,
){
 const note=reason.trim();
 if(!note)throw new Error('Enter a reason for disapproval.');
 const unique=Array.from(new Map(items.map(item=>[item.id,item])).values());
 if(!unique.length||unique.length>100)throw new Error('Select between 1 and 100 requests.');
 const results:DisapprovalResult[]=[];
 for(const item of unique){
  try{
   const result=await decide(item.id,note);
   if(!result||(!result.status&&!result.alreadyDecided))throw new Error('The server did not confirm this decision. Refresh the request before retrying.');
   results.push({...item,outcome:result.alreadyDecided?'Already recorded':'Disapproved',message:result.alreadyDecided?'Your decision was already recorded.':`Decision recorded. Request status: ${result.status||'updated'}.`});
  }catch(e){results.push({...item,outcome:'Not saved',message:e instanceof Error?e.message:'Could not confirm the decision. Refresh the request before retrying.'});}
  progress([...results]);
 }
 return results;
}
