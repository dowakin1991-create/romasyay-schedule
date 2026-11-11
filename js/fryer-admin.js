import {getFirestore,doc,collection,query,orderBy,limit,onSnapshot,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {firebaseApp} from './store.js?v=20261111.bindingfix';
import {currentUser,isAdmin,watchAuth} from './auth.js?v=20261111.rolefix';
const $=id=>document.getElementById(id),db=getFirestore(firebaseApp);
const form=$('fryer-admin-form'),date=$('fryer-admin-date'),done=$('fryer-admin-done'),person=$('fryer-admin-person'),note=$('fryer-admin-note'),status=$('fryer-admin-status'),current=$('fryer-admin-current');
const normalized=e=>({oilChanged:e?.oilChanged===true,performedBy:String(e?.performedBy||e?.oilPerformedBy||''),performedUid:String(e?.performedUid||''),note:String(e?.note||'')});
const localToday=()=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=t=>parts.find(p=>p.type===t)?.value;return get('year')+'-'+get('month')+'-'+get('day')};
date.value=localToday();
let off=null,generation=0,loading=false;
let historyStop=null,historyMonth='';
function watchHistory(nextMonth){
 if(historyStop&&historyMonth===nextMonth)return;
 historyStop?.();historyMonth=nextMonth;
 const root=$('fryer-admin-history-list'),label=$('fryer-admin-history-status');
 root.replaceChildren();label.textContent='Завантажуємо історію…';
 historyStop=onSnapshot(query(collection(db,'fryerMaintenance',nextMonth,'history'),orderBy('createdAt','desc'),limit(100)),snapshot=>{
  root.replaceChildren();label.textContent=snapshot.size?'Записів: '+snapshot.size:'Записів поки немає.';
  for(const record of snapshot.docs){
   const a=record.data(),before=normalized(a.before),after=normalized(a.after);
   const li=document.createElement('li');li.className='fryer-history-item';
   const line=document.createElement('strong');
   line.textContent=String(a.dayKey||'?')+'.'+nextMonth.slice(5)+'.'+nextMonth.slice(0,4)+' — '+(after.oilChanged?'Заміна олії':'Скасовано');
   const detail=document.createElement('p');detail.textContent='Вніс/змінив: '+(a.actorName||'Користувач')+
     '. Виконавець: '+(after.performedBy||before.performedBy||'не вказано')+
     (after.note?' · '+after.note:'');
   li.append(line,detail);root.append(li);
  }
 },error=>{label.textContent='Журнал недоступний: '+(error.code||error.message)});
}

function listen(){
 off?.();off=null;const token=++generation,uid=currentUser()?.uid;
 if(!uid||!isAdmin(currentUser())){current.textContent='Лише для адміністратора.';return}
 const selected=date.value;
 if(!/^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(selected)){current.textContent='Оберіть дату.';return}
 const [month,day]=[selected.slice(0,7),String(Number(selected.slice(8)))];
 watchHistory(month);
 current.textContent='Завантажуємо запис…';
 off=onSnapshot(doc(db,'fryerMaintenance',month),snap=>{
  if(token!==generation)return;
  const raw=snap.data()?.days?.[day],e=normalized(raw);
  person.value=e.performedBy;note.value=e.note;done.checked=e.oilChanged;
  current.textContent=e.oilChanged?'Запис існує. Виконавець: '+(e.performedBy||'не вказаний'):'Для цієї дати заміна олії не позначена.';
 },error=>{if(token===generation)current.textContent='Помилка завантаження: '+(error.code||error.message)});
}
date.addEventListener('change',listen);
watchAuth(user=>{if(isAdmin(user))listen();else{off?.();off=null;historyStop?.();historyStop=null;historyMonth='';generation++;}});
form.addEventListener('submit',async event=>{
 event.preventDefault();if(loading||!isAdmin(currentUser()))return;
 const selected=date.value;if(!selected)return;
 const day=String(Number(selected.slice(8))),month=selected.slice(0,7),uid=currentUser()?.uid;
 const personName=person.value.trim(),memo=note.value.trim(),replaced=done.checked;
 if(replaced&&!personName){status.textContent='Вкажіть фактичного виконавця заміни.';return}
 if(memo.length>250||personName.length>80){status.textContent='Перевищено довжину поля.';return}
 loading=true;form.querySelector('button[type=submit]').disabled=true;status.textContent='Зберігаємо…';
 try{
  const ref=doc(db,'fryerMaintenance',month),history=doc(collection(db,'fryerMaintenance',month,'history'));
  const result=await runTransaction(db,async tx=>{
   const snap=await tx.get(ref),data=snap.data()||{},days={...(data.days||{})};
   const before=days[day]||{},prev=normalized(before);
   const after=replaced?{oilChanged:true,note:memo,performedBy:personName,performedUid:prev.performedBy===personName?prev.performedUid:''}:{};
   if(JSON.stringify(before)===JSON.stringify(after))return false;
   if(replaced)days[day]=after;else delete days[day];
   tx.set(ref,{days,updatedAt:serverTimestamp(),lastAuditId:history.id});
   const user=currentUser();
   const actorName=String(user?.displayName?.trim()||user?.email?.split('@')[0]||'Адміністратор').slice(0,80);
   tx.set(history,{dayKey:day,actorUid:uid,actorName,createdAt:serverTimestamp(),before,after});
   return true;
  });
  status.textContent=result?'Збережено. Виправлення додано до журналу.':'Змін немає.';
 }catch(error){status.textContent='Помилка збереження: '+(error.message||error.code||'невідома')}
 finally{loading=false;form.querySelector('button[type=submit]').disabled=false}
});

window.addEventListener('romasyay:admin-fryer-day',event=>{
 const month=event.detail?.month,day=Number(event.detail?.day);
 if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month||'')||!Number.isInteger(day)||day<1||day>31)return;
 if(!isAdmin(currentUser()))return;
 const panel=$('fryer-admin-panel');panel.open=true;
 date.value=month+'-'+String(day).padStart(2,'0');
 listen();
 panel.scrollIntoView({behavior:'smooth',block:'start'});
});
