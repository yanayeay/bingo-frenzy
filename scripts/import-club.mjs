import {readFile} from 'node:fs/promises';

const file=process.argv[2];
if(!file){console.error('Usage: npm run data:import -- /path/to/club-data.json');process.exit(1)}
const key=process.env.SUPABASE_SECRET_KEY;
const origin=process.env.SUPABASE_URL;
if(!origin||!key){console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.');process.exit(1)}
const raw=JSON.parse(await readFile(file,'utf8'));
if(!Array.isArray(raw.players)||!Array.isArray(raw.listings))throw new Error('Expected a club export containing players and listings arrays.');
const normalize=name=>name.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
const data={
 players:raw.players.map(p=>({id:p.id,name:p.name,name_key:normalize(p.name),game_id:p.gameId||'',updated_at:p.updatedAt})),
 listings:raw.listings.map(c=>({id:c.id,player_id:c.playerId,name:c.name,card_key:normalize(c.name),album:c.album||'',sender:c.sender||'',star:c.star??null,card_type:c.cardType||'Regular',kind:c.kind,quantity:c.kind==='need'?1:c.quantity,updated_at:c.updatedAt})),
};
const headers={apikey:key,'Content-Type':'application/json'};
if(!key.startsWith('sb_secret_'))headers.Authorization=`Bearer ${key}`;
const response=await fetch(new URL('/rest/v1/rpc/bingo_import_club',origin),{method:'POST',headers,body:JSON.stringify({data}),signal:AbortSignal.timeout(30000)});
if(!response.ok){console.error(`Import failed (${response.status}). Check that the migration ran and the club tables are empty. No partial import is committed.`);process.exit(1)}
console.log('Imported:',await response.json());
