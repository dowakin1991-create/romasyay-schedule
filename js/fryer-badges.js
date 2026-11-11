import {getFirestore,doc,onSnapshot} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {firebaseApp} from './store.js?v=20261111.bindingfix';
import {currentUser,isAdmin,watchAuth} from './auth.js?v=20261111.rolefix';
const db=getFirestore(firebaseApp);
let stop=null,month='',days=new Set(),allowed=false,requestId=0;
function paint(){
 for(const th of document.querySelectorAll('#header-row th[data-day],#h-row th[data-day]')){
  const badge=th.querySelector('.fryer-date-badge');if(!badge)continue;
  badge.hidden=!days.has(Number(th.dataset.day));
  th.classList.toggle('has-fryer',days.has(Number(th.dataset.day)));
 }
}
function watch(){
 const next=window.romasyayCurrentMonth?.()||'';
 if(!allowed||!/^20\d\d-(0[1-9]|1[0-2])$/.test(next)){stop?.();stop=null;month='';days.clear();paint();return}
 if(next===month&&stop){paint();return}
 stop?.();stop=null;month=next;days.clear();paint();
 const key=++requestId;
 stop=onSnapshot(doc(db,'fryerMaintenance',next),snap=>{
  if(key!==requestId)return;
  const all=snap.data()?.days||{};
  days=new Set(Object.entries(all).filter(([d,v])=>v?.oilChanged===true).map(([d])=>Number(d)));
  paint();
 },err=>{if(key===requestId)console.warn('Fryer badge unavailable:',err.code||err.message)});
}
window.openFryerDay=day=>{
 if(document.body.dataset.page==='admin'){
  window.dispatchEvent(new CustomEvent('romasyay:admin-fryer-day',{detail:{month:window.romasyayCurrentMonth?.(),day}}));
 }else window.dispatchEvent(new Event('romasyay:open-fryer-day'));
};
window.addEventListener('romasyay:month-change',watch);
window.addEventListener('romasyay:schedule-render',paint);
window.addEventListener('romasyay:access-change',e=>{allowed=e.detail?.allowed===true;watch()});
watchAuth(user=>{if(document.body.dataset.page==='admin'){allowed=isAdmin(user);watch()}else if(document.getElementById('private-schedule')?.hidden===false){allowed=true;watch()}});
if(document.body.dataset.page!=='admin'&&document.getElementById('private-schedule')?.hidden===false){allowed=true;watch()}
