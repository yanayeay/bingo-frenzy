import { z } from 'zod';
import { CARD_TYPES,cardKey,type Player,type Listing } from '../../../lib/cards.ts';
import { database,DatabaseError } from '../../../lib/supabase.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';

type MemberRow={id:string;name:string;name_key:string;game_id:string;updated_at:number};
type CardRow={id:string;player_id:string;name:string;card_key:string;album:string;sender:string;star:number|null;card_type:Listing['cardType'];kind:Listing['kind'];quantity:number;updated_at:number};
const memberFromRow=(p:MemberRow):Player=>({id:p.id,name:p.name,gameId:p.game_id,updatedAt:Number(p.updated_at)});
const cardFromRow=(c:CardRow):Listing=>({id:c.id,playerId:c.player_id,name:c.name,cardKey:c.card_key,album:c.album,sender:c.sender,star:c.star==null?null:Number(c.star),cardType:c.card_type,kind:c.kind,quantity:c.quantity,updatedAt:Number(c.updated_at)});
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const id=z.string().min(1).max(120);
const payloadSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('member'),id:id.optional(),name:z.string().trim().min(1).max(40),gameId:z.string().trim().max(60).optional()}),
 z.object({action:z.literal('save'),id:id.optional(),playerId:id,name:z.string().trim().min(1).max(100),cardType:z.enum(CARD_TYPES),star:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),kind:z.enum(['have','need']),quantity:z.number().int().min(1).max(99),sender:z.string().trim().max(80).optional()}),
 z.object({action:z.literal('sender'),id,sender:z.string().trim().max(80)}),
 z.object({action:z.literal('delete'),id}),
]);

function failure(error:unknown){
 if(error instanceof DatabaseError){
  if(error.code==='23505')return json({error:'This member or card already exists. Edit the existing entry.'},409);
  if(error.code==='42P01'||error.code==='PGRST205')return json({error:'Database tables are missing. Run the included Supabase migration.'},503);
 }
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)return json({error:'Database setup is incomplete. Set SUPABASE_URL and SUPABASE_SECRET_KEY in Vercel.'},503);
 return json({error:'The club info could not be saved or loaded. Refresh and try again.'},503);
}

export async function GET(){
 try{
  const db=database();
  const [members,cards]=await Promise.all([db.all<MemberRow>('bingo_players'),db.all<CardRow>('bingo_listings')]);
  return json({players:members.map(memberFromRow),listings:cards.map(cardFromRow).sort((a,b)=>b.updatedAt-a.updatedAt)});
 }catch(error){return failure(error)}
}

// One public shared club, as requested: no ChatGPT sign-in or player accounts.
// The Supabase secret remains server-side; clients can only use these actions.
export async function POST(request:Request){
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return json({error:'Request origin is not allowed.'},403);
 let raw:unknown;
 try{raw=await request.json()}catch{return json({error:'Please send a valid update.'},400)}
 const parsed=payloadSchema.safeParse(raw);
 if(!parsed.success)return json({error:'Check the member, card details, and sender name.'},400);
 const input=parsed.data;
 try{
  const db=database();
  if(input.action==='member'){
   const name=input.name.replace(/\s+/g,' ');
   const duplicates=await db.request<MemberRow[]>('bingo_players',{name_key:`eq.${cardKey(name)}`,select:'id'});
   if(duplicates.some(p=>p.id!==input.id))return json({error:'A member with this name already exists. Open their existing entry.'},409);
   const values={name,name_key:cardKey(name),...(input.gameId!==undefined?{game_id:input.gameId}:{}),updated_at:Date.now()};
   if(input.id){
    const changed=await db.request<MemberRow[]>('bingo_players',{id:`eq.${input.id}`},'PATCH',values);
    return changed.length?json({ok:true,id:input.id}):json({error:'This member could not be found.'},404);
   }
   const memberId=crypto.randomUUID();
   await db.request('bingo_players',{},'POST',{...values,id:memberId,game_id:input.gameId||''});
   return json({ok:true,id:memberId},201);
  }
  if(input.action==='sender'){
   const changed=await db.request<CardRow[]>('bingo_listings',{id:`eq.${input.id}`,kind:'eq.need'},'PATCH',{sender:input.sender,updated_at:Date.now()});
   return changed.length?json({ok:true}):json({error:'This needed card is no longer listed.'},404);
  }
  if(input.action==='delete'){
   const removed=await db.request<CardRow[]>('bingo_listings',{id:`eq.${input.id}`},'DELETE');
   return removed.length?json({ok:true}):json({error:'This card is no longer listed.'},404);
  }
  const members=await db.request<MemberRow[]>('bingo_players',{id:`eq.${input.playerId}`,select:'id'});
  if(!members.length)return json({error:'Choose an existing club member first.'},400);
  const existing=input.id?await db.request<CardRow[]>('bingo_listings',{id:`eq.${input.id}`}):[];
  const current=existing[0];
  if(input.id&&!current)return json({error:'This card is no longer listed.'},404);
  const key=cardKey(input.name);
  const duplicates=await db.request<CardRow[]>('bingo_listings',{player_id:`eq.${input.playerId}`,card_key:`eq.${key}`,select:'id'});
  if(duplicates.some(c=>c.id!==input.id))return json({error:'This card is already in this member’s lists. Edit the existing card instead.'},409);
  const values={player_id:input.playerId,name:input.name.replace(/\s+/g,' '),card_key:key,card_type:input.cardType,...(input.star!==undefined?{star:input.star}:{}),kind:input.kind,quantity:input.kind==='need'?1:input.quantity,sender:input.kind==='need'?(input.sender??current?.sender??''):'',updated_at:Date.now()};
  if(input.id){
   const changed=await db.request<CardRow[]>('bingo_listings',{id:`eq.${input.id}`},'PATCH',values);
   return changed.length?json({ok:true,id:input.id}):json({error:'This card is no longer listed.'},404);
  }
  const cards=await db.request<{id:string}[]>('bingo_listings',{player_id:`eq.${input.playerId}`,select:'id',limit:'300'});
  if(cards.length>=300)return json({error:'This member’s list is full. Remove old cards first.'},400);
  const listingId=crypto.randomUUID();
  await db.request('bingo_listings',{},'POST',{...values,id:listingId});
  return json({ok:true,id:listingId},201);
 }catch(error){return failure(error)}
}
