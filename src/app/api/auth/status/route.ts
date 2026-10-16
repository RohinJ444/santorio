import {configured,findOwner,ownerEmail,sessionClient} from '@/lib/server/supabase';
import {recoveryAuthorized} from '@/lib/server/recovery';
import {json,route} from '@/lib/server/http';
export async function GET(){return route(async()=>{
 if(!configured())return json({configured:false,ownerEmail:ownerEmail(),setupRequired:true,user:null,recoveryAuthorized:false});
 const db=await sessionClient();const {data:{user}}=await db.auth.getUser();
 const owner=await findOwner();
 return json({configured:true,ownerEmail:ownerEmail(),setupRequired:!owner,recoveryAuthorized:user?.email?.toLowerCase()===ownerEmail()&&user.email_confirmed_at?await recoveryAuthorized(db,user.id):false,user:user?.email?.toLowerCase()===ownerEmail()&&user.email_confirmed_at?{id:user.id,email:user.email}:null});
});}
