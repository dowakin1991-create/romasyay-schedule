// Ромасяй Графік — dedicated Cloudflare Web Push backend.
// Binding ROMASYAY_PUSH: KV namespace. Secret VAPID_JSON: browser-generated P-256 keypair.
// Deploy only to romasyay-schedule-push; never publish the actual secret in GitHub.
const PROJECT='romasyay-schedule';
const ORIGIN='https://dowakin1991-create.github.io';
const OWNERS=new Set(['H30yaYdtP3dnRxZCEpyXb9PQlRL2','iAWl0WkQZbXFWVzsst1Kh1oZJUz2']);
const enc=new TextEncoder();
const dec=new TextDecoder();
const b64=u=>{let x='';for(const v of u instanceof ArrayBuffer?new Uint8Array(u):u)x+=String.fromCharCode(v);return btoa(x).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const ub64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),x=>x.charCodeAt(0));
const cat=(...args)=>{const a=args.map(x=>x instanceof ArrayBuffer?new Uint8Array(x):x);const out=new Uint8Array(a.reduce((n,x)=>n+x.length,0));let i=0;for(const x of a){out.set(x,i);i+=x.length}return out;};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':ORIGIN,'vary':'Origin'}});
const err=(code,message,status=400)=>reply({error:{code,message}},status);
let cachedKeys=[],expireKeys=0;
async function firebaseKey(kid){
 if(Date.now()>expireKeys){
  const r=await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if(!r.ok)throw {code:'unavailable',status:503};
  cachedKeys=(await r.json()).keys||[];expireKeys=Date.now()+30*60*1000;
 }
 return cachedKeys.find(k=>k.kid===kid&&k.kty==='RSA');
}
async function identity(req){
 const auth=req.headers.get('Authorization')||'';
 if(!auth.startsWith('Bearer '))throw {code:'unauthenticated',status:401};
 const token=auth.slice(7);
 if(token.length>7000)throw {code:'unauthenticated',status:401};
 const pieces=token.split('.');if(pieces.length!==3)throw {code:'unauthenticated',status:401};
 let head,claims;
 try{head=JSON.parse(dec.decode(ub64(pieces[0])));claims=JSON.parse(dec.decode(ub64(pieces[1])))}catch{throw {code:'unauthenticated',status:401}}
 const now=Math.floor(Date.now()/1000);
 if(head.alg!=='RS256'||typeof head.kid!=='string'||claims.aud!==PROJECT||
 claims.iss!=='https://securetoken.google.com/'+PROJECT||typeof claims.sub!=='string'||
 !claims.sub||claims.sub.length>128||typeof claims.exp!=='number'||claims.exp<=now||
 typeof claims.iat!=='number'||claims.iat>now+60||
 typeof claims.auth_time!=='number'||claims.auth_time>now+60)throw {code:'unauthenticated',status:401};
 const jwk=await firebaseKey(head.kid);
 if(!jwk)throw {code:'unauthenticated',status:401};
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 const ok=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,ub64(pieces[2]),enc.encode(pieces[0]+'.'+pieces[1]));
 if(!ok)throw {code:'unauthenticated',status:401};
 return {uid:claims.sub,verified:claims.email_verified===true,token};
}
async function getDocument(user,path){
 const url='https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents/'+path;
 const r=await fetch(url,{headers:{Authorization:'Bearer '+user.token}});
 if(r.status===404)return null;
 if(!r.ok)throw {code:'permission-denied',status:403};
 return (await r.json()).fields||{};
}
async function isAdmin(user){
 if(OWNERS.has(user.uid))return true;
 if(!user.verified)return false;
 const f=await getDocument(user,'adminRequests/'+encodeURIComponent(user.uid));
 return f?.status?.stringValue==='approved';
}
async function canReceive(user){
 if(OWNERS.has(user.uid)||await isAdmin(user))return true;
 if(!user.verified)return false;
 const uid=encodeURIComponent(user.uid);
 const team=await getDocument(user,'teamAccess/'+uid);
 if(team?.employeeId?.stringValue)return true;
 const viewer=await getDocument(user,'viewerAccess/'+uid);
 return viewer?.role?.stringValue==='viewer';
}
function config(env){
 if(!env.VAPID_JSON)throw {code:'not-configured',status:503,message:'Cloudflare Secret VAPID_JSON не налаштовано.'};
 let v;try{v=JSON.parse(env.VAPID_JSON)}catch{throw {code:'not-configured',status:503}};
 if(typeof v.publicKey!=='string'||typeof v.privateKey!=='string'||ub64(v.publicKey).length!==65||ub64(v.privateKey).length!==32)throw {code:'not-configured',status:503};
 return v;
}
function allowedEndpoint(s){
 if(typeof s!=='string'||s.length>1800)return false;
 try{
  const u=new URL(s),host=u.hostname.toLowerCase();
  return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&!u.hash&&
  (host==='fcm.googleapis.com'||host==='android.googleapis.com'||host==='updates.push.services.mozilla.com'||
  host==='push.services.mozilla.com'||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||
  host.endsWith('.notify.windows.com'));
 }catch{return false}
}
function validSub(s){
 try{return s&&allowedEndpoint(s.endpoint)&&typeof s.keys?.p256dh==='string'&&typeof s.keys?.auth==='string'&&
 ub64(s.keys.p256dh).length===65&&ub64(s.keys.auth).length===16}catch{return false}
}
const sha=async value=>b64(await crypto.subtle.digest('SHA-256',enc.encode(value)));
async function hmac(salt,message){
 const key=await crypto.subtle.importKey('raw',salt,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return new Uint8Array(await crypto.subtle.sign('HMAC',key,message));
}
async function expand(prk,info,len){
 return (await hmac(prk,cat(info,new Uint8Array([1])))).slice(0,len);
}
async function encrypt(sub,message){
 const receiver=ub64(sub.keys.p256dh),auth=ub64(sub.keys.auth);
 const receiverKey=await crypto.subtle.importKey('raw',receiver,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const sender=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:receiverKey},sender.privateKey,256));
 const senderPublic=new Uint8Array(await crypto.subtle.exportKey('raw',sender.publicKey));
 const ikm=await expand(await hmac(auth,shared),cat(enc.encode('WebPush: info\0'),receiver,senderPublic),32);
 const salt=crypto.getRandomValues(new Uint8Array(16)),prk=await hmac(salt,ikm);
 const aeskey=await expand(prk,enc.encode('Content-Encoding: aes128gcm\0'),16);
 const nonce=await expand(prk,enc.encode('Content-Encoding: nonce\0'),12);
 const aes=await crypto.subtle.importKey('raw',aeskey,'AES-GCM',false,['encrypt']);
 const payload=cat(enc.encode(JSON.stringify(message)),new Uint8Array([2]));
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},aes,payload));
 return cat(salt,new Uint8Array([0,0,16,0,senderPublic.length]),senderPublic,encrypted);
}
async function vapidJWT(endpoint,v){
 const raw=ub64(v.publicKey);
 const priv=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:b64(raw.slice(1,33)),y:b64(raw.slice(33)),d:v.privateKey,ext:true},{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const header=b64(enc.encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
 const body=b64(enc.encode(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+3600,sub:v.subject||'mailto:admin@example.com'})));
 const signed=header+'.'+body;
 const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},priv,enc.encode(signed));
 return signed+'.'+b64(sig);
}
async function deliver(sub,message,v){
 if(!validSub(sub))throw Error('invalid subscription');
 const body=await encrypt(sub,message),jwt=await vapidJWT(sub.endpoint,v);
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{return await fetch(sub.endpoint,{method:'POST',headers:{'content-type':'application/octet-stream',
 'content-encoding':'aes128gcm','ttl':'86400','authorization':'vapid t='+jwt+', k='+v.publicKey},body,signal:controller.signal})}
 finally{clearTimeout(timeout)}
}
async function subscriptions(kv){
 let cursor,keys=[];
 do{
  const result=await kv.list({prefix:'sub:',limit:1000,...(cursor?{cursor}:{})});
  keys.push(...result.keys.map(k=>k.name));
  if(keys.length>2000)throw {code:'resource-exhausted',status:429};
  cursor=result.list_complete?null:result.cursor;
 }while(cursor);
 return keys;
}
function validNotices(month,notices){
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month||'')||!Array.isArray(notices)||notices.length<1||notices.length>31)return false;
 const [year,m]=month.split('-').map(Number),max=new Date(year,m,0).getDate();
 const types=new Set(['schedule','schedule-added','banquet','cleaning','cancel-banquet','cancel-cleaning']);
 return notices.every(n=>n&&types.has(n.kind)&&Number.isInteger(n.day)&&n.day>=1&&n.day<=max&&
 (n.endDay===undefined||n.endDay===null||Number.isInteger(n.endDay)&&n.endDay>=n.day&&n.endDay<=max));
}
async function handler(name,user,data,env){
 const kv=env.ROMASYAY_PUSH;
 if(!kv)return err('not-configured','KV binding ROMASYAY_PUSH відсутній',503);
 if(name==='pushConfig'){
  if(!await canReceive(user))return err('permission-denied','Доступ до графіка не підтверджено',403);
  return reply({publicKey:config(env).publicKey});
 }
 if(name==='pushSubscribe'){
  if(!await canReceive(user))return err('permission-denied','Немає доступу до графіка',403);
  const s=data.subscription;if(!validSub(s))return err('invalid-argument','Некоректна push-підписка');
  const key='sub:'+await sha(s.endpoint);
  await kv.put(key,JSON.stringify({uid:user.uid,subscription:{endpoint:s.endpoint,keys:{auth:s.keys.auth,p256dh:s.keys.p256dh}},createdAt:Date.now()}));
  return reply({ok:true});
 }
 if(name==='pushUnsubscribe'){
  if(typeof data.endpoint!=='string'||!allowedEndpoint(data.endpoint))return err('invalid-argument','Некоректний endpoint');
  const key='sub:'+await sha(data.endpoint),entry=await kv.get(key,'json');
  if(entry?.uid===user.uid)await kv.delete(key);
  return reply({ok:true});
 }
 if(name==='pushSchedule'){
  if(!await isAdmin(user))return err('permission-denied','Доступ лише власнику або шефу',403);
  if(!validNotices(data.month,data.notices))return err('invalid-argument','Некоректні дати сповіщень');
  config(env);
  const keys=await subscriptions(kv),jobId=crypto.randomUUID();
  await kv.put('job:'+jobId,JSON.stringify({by:user.uid,keys,month:data.month,notices:data.notices,at:Date.now()}),{expirationTtl:900});
  return reply({jobId,total:keys.length});
 }
 if(name==='pushDeliver'){
  if(!await isAdmin(user))return err('permission-denied','Недостатньо прав',403);
  if(!/^[a-f0-9-]{36}$/.test(data.jobId||'')||!Number.isInteger(data.index)||data.index<0)return err('invalid-argument','Некоректне завдання');
  const job=await kv.get('job:'+data.jobId,'json');
  if(!job||job.by!==user.uid||Date.now()-job.at>900000)return err('not-found','Завдання недоступне',404);
  const key=job.keys[data.index];if(!key)return err('invalid-argument','Невірний номер');
  const sub=await kv.get(key,'json');if(!sub)return reply({accepted:0,failed:0,removed:0,skipped:1});
  try{
   const res=await deliver(sub.subscription,{month:job.month,notices:job.notices},config(env));
   if(res.status===404||res.status===410){await kv.delete(key);return reply({accepted:0,failed:0,removed:1})}
   return reply({accepted:res.ok?1:0,failed:res.ok?0:1,removed:0,diagnostic:res.ok?'':'push-http-'+res.status});
  }catch{return reply({accepted:0,failed:1,removed:0,diagnostic:'push-network-error'})}
 }
 if(name==='accountAlert'){
  if(!['registered','approved'].includes(data.event)||typeof data.uid!=='string'||data.uid.length>128)return err('invalid-argument','Некоректна подія');
  if(data.event==='approved'&&!OWNERS.has(user.uid))return err('permission-denied','Тільки власник підтверджує акаунти',403);
  if(data.event==='registered'&&(data.uid!==user.uid||!user.verified))return err('permission-denied','Недостатньо прав',403);
  const key='rate:'+data.event+':'+data.uid;
  if(await kv.get(key))return reply({ok:true,alreadySent:true});
  const keys=await subscriptions(kv),targets=[];
  for(const name of keys){
   const record=await kv.get(name,'json');
   if(record&&(data.event==='registered'?OWNERS.has(record.uid):record.uid===data.uid))targets.push(record);
  }
  let accepted=0;
  for(const record of targets.slice(0,30)){
   try{const res=await deliver(record.subscription,{accountEvent:data.event},config(env));if(res.ok)accepted++}catch{}
  }
  await kv.put(key,'1',{expirationTtl:3600});
  return reply({ok:true,accepted});
 }
 return err('not-found','Маршрут не існує',404);
}
export default {
 async fetch(req,env){
  const origin=req.headers.get('origin');
  if(req.method==='OPTIONS'){
   if(origin!==ORIGIN)return new Response(null,{status:403});
   return new Response(null,{status:204,headers:{'access-control-allow-origin':ORIGIN,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'Authorization, Content-Type','access-control-max-age':'3600'}});
  }
  if(req.method!=='POST')return err('not-found','Потрібен POST',404);
  if(origin!==ORIGIN)return err('permission-denied','Недозволене джерело',403);
  const name=new URL(req.url).pathname.replace(/^\/+|\/+$/g,'');
  if(!['pushConfig','pushSubscribe','pushUnsubscribe','pushSchedule','pushDeliver','accountAlert'].includes(name))return err('not-found','Маршрут не існує',404);
  if(Number(req.headers.get('content-length')||0)>30000)return err('invalid-argument','Запит завеликий',413);
  try{
   const user=await identity(req);
   const raw=await req.text();
   if(raw.length>30000)return err('invalid-argument','Запит завеликий',413);
   let data;try{data=raw?JSON.parse(raw):{}}catch{return err('invalid-argument','Некоректний JSON')}
   return await handler(name,user,data,env);
  }catch(e){
   if(e?.code)return err(e.code,e.message||'Доступ заборонено',e.status||403);
   console.error('Push worker error',e?.message||'unknown');
   return err('internal','Сервіс недоступний',500);
  }
 }
};
