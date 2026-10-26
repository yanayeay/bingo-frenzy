import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {GET,POST} from '../app/api/club/route.ts';
import {recipientAssignments,cardKey} from '../lib/cards.ts';

// Exercise the real route handlers over HTTP to a disposable PostgREST fixture.
// The fixture checks wire headers, snake_case mappings, filters and pagination.
const tables={bingo_players:[],bingo_listings:[]};
let seenKey=false;
const server=http.createServer(async(req,res)=>{
 try{
  assert.equal(req.headers.apikey,'sb_secret_fixture');
  assert.equal(req.headers.authorization,undefined);
  seenKey=true;
  const url=new URL(req.url,'http://localhost');
  const table=url.pathname.split('/').at(-1);
  assert.ok(Object.hasOwn(tables,table));
  let rows=tables[table].filter(row=>[...url.searchParams].every(([key,value])=>
   ['select','order','limit','offset'].includes(key)||value===`eq.${row[key]}`));
  if(req.method==='POST'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const value=JSON.parse(Buffer.concat(chunks));tables[table].push(value);rows=[value];
  }else if(req.method==='PATCH'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const value=JSON.parse(Buffer.concat(chunks));rows.forEach(row=>Object.assign(row,value));
  }else if(req.method==='DELETE'){
   tables[table]=tables[table].filter(row=>!rows.includes(row));
  }else{
   rows.sort((a,b)=>a.id.localeCompare(b.id));
   const offset=Number(url.searchParams.get('offset')||0);
   // Emulate a project-configured row cap lower than our requested page size.
   rows=rows.slice(offset,offset+Math.min(2,Number(url.searchParams.get('limit')||1000)));
  }
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(rows));
 }catch(error){res.writeHead(500);res.end(JSON.stringify({message:String(error)}))}
});
const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
before(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 process.env.SUPABASE_URL=`http://127.0.0.1:${server.address().port}`;
 process.env.SUPABASE_SECRET_KEY='sb_secret_fixture';
});
after(async()=>{
 await new Promise(resolve=>server.close(resolve));
 if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
 if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;
});
async function post(body,origin='http://localhost'){
 return POST(new Request('http://localhost/api/club',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)}));
}
async function createMember(name){const r=await post({action:'member',name});assert.equal(r.status,201);return (await r.json()).id}
const save=(playerId,kind,extra={})=>post({action:'save',playerId,name:'Table Tennis 10',cardType:'King',star:5,kind,quantity:2,...extra});

test('shared club CRUD preserves cards, sender and recipient across reads',async()=>{
 const ayeay=await createMember('Ayeay'),dutches=await createMember('Dutches');
 const haveResponse=await save(ayeay,'have');assert.equal(haveResponse.status,201);
 const haveId=(await haveResponse.json()).id;
 const needResponse=await save(dutches,'need');assert.equal(needResponse.status,201);
 const needId=(await needResponse.json()).id;
 assert.equal((await post({action:'sender',id:needId,sender:' AYEAY '})).status,200);
 let data=await (await GET()).json();
 assert.equal(data.listings.find(c=>c.id===needId).quantity,1);
 assert.equal(data.listings.find(c=>c.id===needId).sender,'AYEAY');
 assert.equal(data.listings.find(c=>c.id===haveId).star,5);
 let recipients=recipientAssignments(data.listings.find(c=>c.id===haveId),data.listings,data.players);
 assert.equal(recipients[0].playerId,dutches);
 assert.equal(data.listings.find(c=>c.id===haveId).quantity,2);
 assert.equal((await post({action:'sender',id:haveId,sender:'Dutches'})).status,404);
 assert.equal((await post({action:'sender',id:needId,sender:''})).status,200);
 data=await (await GET()).json();
 assert.equal(recipientAssignments(data.listings.find(c=>c.id===haveId),data.listings,data.players).length,0);
 assert.equal((await save(dutches,'need',{id:needId,star:null,sender:'Ayeay'})).status,200);
 data=await (await GET()).json();assert.equal(data.listings.find(c=>c.id===needId).star,null);
 assert.equal(recipientAssignments(data.listings.find(c=>c.id===haveId),data.listings,data.players).length,1);
 assert.equal((await post({action:'delete',id:needId})).status,200);
 data=await (await GET()).json();assert.equal(data.listings.length,1);
 assert.equal(recipientAssignments(data.listings[0],data.listings,data.players).length,0);
 assert.equal(seenKey,true);
});

test('duplicates, invalid data, missing members and cross-origin updates are rejected',async()=>{
 const player=tables.bingo_players.find(p=>p.name==='Ayeay').id;
 assert.equal((await post({action:'member',name:' AYEAY '})).status,409);
 assert.equal((await save(player,'have',{name:'  table   tennis 10  '})).status,409);
 assert.equal((await save(player,'need',{star:1.5})).status,400);
 assert.equal((await save(player,'have',{quantity:0})).status,400);
 assert.equal((await save(player,'have',{cardType:'Other'})).status,400);
 assert.equal((await save('missing','have')).status,400);
 assert.equal((await post({action:'member',name:'Mallory'},'https://different.example')).status,403);
 const broken=await POST(new Request('http://localhost/api/club',{method:'POST',body:'invalid'}));
 assert.equal(broken.status,400);
 assert.equal((await post({action:'delete',id:'missing'})).status,404);
});

test('pagination loads every member and card even with a lower database row cap',async()=>{
 await createMember('Jun');await createMember('Mia');await createMember('Sarah');
 const data=await (await GET()).json();
 assert.equal(data.players.length,5);
 assert.equal(data.listings.length,1);
});

test('recipient matching respects card type and supports several recipients',()=>{
 const players=[{id:'a',name:'Ayeay'},{id:'d',name:'Dutches'},{id:'m',name:'Mia'}];
 const have={id:'h',playerId:'a',name:'Table Tennis 10',cardType:'King',star:5,kind:'have'};
 const need={id:'n',playerId:'d',name:' table  tennis 10 ',cardType:'King',star:5,kind:'need',sender:' AYEAY ',updatedAt:1};
 assert.equal(recipientAssignments(have,[need,{...need,id:'n2',playerId:'m'}],players).length,2);
 assert.equal(recipientAssignments(have,[{...need,cardType:'Gold'}],players).length,0);
 assert.equal(recipientAssignments(have,[{...need,star:4}],players).length,0);
 assert.equal(recipientAssignments(have,[{...need,sender:'Mia'}],players).length,0);
 assert.equal(cardKey(' TABLE  tennis 10 '),'table tennis 10');
});

test('missing configuration fails clearly without exposing a key',async()=>{
 const key=process.env.SUPABASE_SECRET_KEY;delete process.env.SUPABASE_SECRET_KEY;
 try{
  const response=await GET();assert.equal(response.status,503);
  assert.match((await response.json()).error,/SUPABASE_SECRET_KEY/);
 }finally{process.env.SUPABASE_SECRET_KEY=key}
});
