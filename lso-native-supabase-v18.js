(function(){
'use strict';

function createClient(url,key,options={}){
  const root=String(url||'').replace(/\/+$/,'');
  const storageKey=options.storageKey||'lso_supabase_session_v16';
  let session=loadSession();

  function loadSession(){
    try{
      const raw=localStorage.getItem(storageKey);
      if(!raw)return null;
      const parsed=JSON.parse(raw);
      return parsed&&parsed.access_token?parsed:null;
    }catch(_){return null}
  }
  function saveSession(value){
    session=value||null;
    try{if(session)localStorage.setItem(storageKey,JSON.stringify(session));else localStorage.removeItem(storageKey)}catch(_){}
  }
  function authHeaders(hasJson=true){
    const h={apikey:key};
    if(hasJson)h['Content-Type']='application/json';
    if(session?.access_token)h.Authorization=`Bearer ${session.access_token}`;
    return h;
  }
  async function parseResponse(res){
    const text=await res.text();
    let body=null;
    if(text){try{body=JSON.parse(text)}catch(_){body=text}}
    if(!res.ok){
      const err=new Error(body?.message||body?.msg||body?.error_description||body?.error||`Request failed (${res.status})`);
      err.code=body?.code||String(res.status);
      err.status=res.status;
      err.details=body?.details||null;
      err.hint=body?.hint||null;
      throw err;
    }
    return body;
  }
  async function refreshSession(){
    if(!session?.refresh_token)return null;
    const res=await fetch(`${root}/auth/v1/token?grant_type=refresh_token`,{
      method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
      body:JSON.stringify({refresh_token:session.refresh_token})
    });
    const body=await parseResponse(res);
    const next={...body,expires_at:body.expires_at||Math.floor(Date.now()/1000)+(body.expires_in||3600)};
    saveSession(next);
    return next;
  }
  async function ensureFresh(){
    if(!session)return null;
    const expires=Number(session.expires_at||0);
    if(expires&&expires-Math.floor(Date.now()/1000)<45){
      try{return await refreshSession()}catch(_){saveSession(null);return null}
    }
    return session;
  }
  async function apiFetch(path,opts={},retry=true){
    await ensureFresh();
    const headers={...authHeaders(opts.body!==undefined),...(opts.headers||{})};
    const res=await fetch(`${root}${path}`,{...opts,headers});
    if(res.status===401&&retry&&session?.refresh_token){
      try{await refreshSession();return apiFetch(path,opts,false)}catch(_){saveSession(null)}
    }
    return parseResponse(res);
  }

  class QueryBuilder{
    constructor(table){this.table=table;this.method='GET';this.params=new URLSearchParams();this.filters=[];this.orders=[];this.payload=undefined;this.single=false}
    clone(){return this}
    select(cols='*'){this.params.set('select',cols);return this}
    order(col,opt={}){this.orders.push(`${col}.${opt.ascending===false?'desc':'asc'}`);return this}
    eq(col,val){this.filters.push([col,`eq.${val}`]);return this}
    gte(col,val){this.filters.push([col,`gte.${val}`]);return this}
    lte(col,val){this.filters.push([col,`lte.${val}`]);return this}
    maybeSingle(){this.single=true;this.params.set('limit','1');return this}
    insert(payload){this.method='POST';this.payload=payload;return this}
    update(payload){this.method='PATCH';this.payload=payload;return this}
    delete(){this.method='DELETE';return this}
    async execute(){
      for(const [k,v] of this.filters)this.params.append(k,v);
      if(this.orders.length)this.params.set('order',this.orders.join(','));
      const q=this.params.toString();
      const path=`/rest/v1/${encodeURIComponent(this.table)}${q?'?'+q:''}`;
      const headers={};
      if(this.method!=='GET')headers.Prefer='return=minimal';
      try{
        let data=await apiFetch(path,{method:this.method,headers,body:this.payload===undefined?undefined:JSON.stringify(this.payload)});
        if(this.single&&Array.isArray(data))data=data[0]||null;
        return {data:data??(this.method==='GET'?[]:null),error:null};
      }catch(error){return {data:null,error}}
    }
    then(resolve,reject){return this.execute().then(resolve,reject)}
  }

  const client={
    from(table){return new QueryBuilder(table)},
    async rpc(name,args={}){
      try{const data=await apiFetch(`/rest/v1/rpc/${encodeURIComponent(name)}`,{method:'POST',body:JSON.stringify(args)});return {data,error:null}}catch(error){return {data:null,error}}
    },
    auth:{
      async getSession(){
        try{await ensureFresh();return {data:{session:session?{...session,user:session.user||null}:null},error:null}}catch(error){return {data:{session:null},error}}
      },
      async signInWithPassword({email,password}){
        try{
          const res=await fetch(`${root}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
          const body=await parseResponse(res);
          const next={...body,expires_at:body.expires_at||Math.floor(Date.now()/1000)+(body.expires_in||3600)};
          saveSession(next);
          return {data:{session:next,user:next.user||body.user||null},error:null};
        }catch(error){return {data:null,error}}
      },
      async signInAnonymously(){
        try{
          const res=await fetch(`${root}/auth/v1/signup`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:'{}'});
          const body=await parseResponse(res);
          const next={...body,expires_at:body.expires_at||Math.floor(Date.now()/1000)+(body.expires_in||3600)};
          if(next.access_token)saveSession(next);
          return {data:{session:next.access_token?next:null,user:next.user||null},error:null};
        }catch(error){return {data:null,error}}
      },
      async signOut(){
        try{if(session?.access_token)await apiFetch('/auth/v1/logout',{method:'POST'},false)}catch(_){}
        saveSession(null);return {error:null}
      }
    },
    channel(){
      const chain={on(){return chain},subscribe(cb){if(typeof cb==='function')setTimeout(()=>cb('SUBSCRIBED'),0);return chain}};
      return chain;
    },
    async removeChannel(){return 'ok'}
  };
  return client;
}
window.LSO_NATIVE_SUPABASE={createClient};
})();
