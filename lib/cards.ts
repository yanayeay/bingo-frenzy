export const CARD_TYPES = ['Regular', 'Gold', 'King'] as const;
export type CardType = typeof CARD_TYPES[number];
export type Player = {id:string;name:string;gameId:string;updatedAt:number};
export type Listing = {id:string;playerId:string;name:string;cardKey:string;album:string;sender:string;star:number|null;cardType:CardType;kind:'have'|'need';quantity:number;updatedAt:number};
export const cardKey=(name:string)=>name.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
export const assignedCards=(cards:Listing[])=>cards.filter(c=>c.kind==='need'&&c.sender.trim()).sort((a,b)=>b.updatedAt-a.updatedAt);
// Derive recipients from Need assignments so edits and removals stay in sync.
export function recipientAssignments(have:Listing, cards:Listing[], players:Player[]){
 const owner=players.find(p=>p.id===have.playerId);
 if(have.kind!=='have'||!owner)return [];
 return assignedCards(cards).filter(need=>
  need.playerId!==have.playerId&&players.some(p=>p.id===need.playerId)&&
  cardKey(need.sender)===cardKey(owner.name)&&
  cardKey(need.name)===cardKey(have.name)&&need.cardType===have.cardType&&
  (need.star==null||have.star==null||need.star===have.star)
 );
}
