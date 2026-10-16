import { collectionSchema, mutationSchema } from '@/lib/domain/schema';
import { requireOwner } from '@/lib/server/supabase';
import { saveRecord } from '@/lib/server/records';
import { assertSameOrigin,bodyJson,json,route } from '@/lib/server/http';
export const runtime='nodejs';
type Context={params:Promise<{collection:string;id:string}>};
async function mutate(request:Request,context:Context,deleted:boolean) {return route(async()=>{assertSameOrigin(request);const {db,user}=await requireOwner();const params=await context.params;const collection=collectionSchema.parse(params.collection);const body=mutationSchema.parse(await bodyJson(request));return json(await saveRecord(db,user.id,collection,params.id,body.data,body.expectedVersion,body.mutationId,deleted));});}
export function PUT(request:Request,context:Context){return mutate(request,context,false);}
export function DELETE(request:Request,context:Context){return mutate(request,context,true);}
