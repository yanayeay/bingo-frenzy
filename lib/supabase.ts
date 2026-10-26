// This module is imported only by server Route Handlers. Never expose its key
// through NEXT_PUBLIC_* variables or return it in an API response.
export class DatabaseError extends Error {
  status:number;
  code:string;
  constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code}
}

export function database(){
 const origin=process.env.SUPABASE_URL;
 const key=process.env.SUPABASE_SECRET_KEY;
 if(!origin||!key||key.startsWith('replace_'))throw new Error('Database configuration is missing.');
 const base=new URL('/rest/v1/',origin);
 const headers:Record<string,string>={apikey:key,'Content-Type':'application/json'};
 // Legacy service_role JWTs are supported too; new sb_secret keys are not JWTs.
 if(!key.startsWith('sb_secret_'))headers.Authorization=`Bearer ${key}`;
 async function request<T>(table:string,query:Record<string,string>={},method='GET',body?:unknown):Promise<T>{
  const url=new URL(table,base);url.search=new URLSearchParams(query).toString();
  const response=await fetch(url,{method,headers:{...headers,Prefer:'return=representation'},cache:'no-store',signal:AbortSignal.timeout(15000),...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!response.ok){
   const detail=await response.json().catch(()=>({})) as {code?:string;message?:string};
   throw new DatabaseError(response.status,detail.code||'',detail.message||'Database request failed.');
  }
  if(response.status===204)return [] as T;
  return response.json() as Promise<T>;
 }
 async function all<T>(table:string,query:Record<string,string>={}):Promise<T[]>{
  const rows:T[]=[];const pageSize=1000;
  for(let offset=0;;){
   const page=await request<T[]>(table,{order:'id.asc',...query,limit:String(pageSize),offset:String(offset)});
   rows.push(...page);
   // Advance by the returned size: projects can set a lower PostgREST row cap.
   if(page.length===0)return rows;
   offset+=page.length;
  }
 }
 return {request,all};
}
