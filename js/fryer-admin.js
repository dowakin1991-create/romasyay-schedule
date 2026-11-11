import {getFirestore,doc,collection,onSnapshot,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {firebaseApp} from './store.js?v=20261111.bindingfix';
import {currentUser,isAdmin,watchAuth} from './auth.js?v=20261111.rolefix';
const $=id=>document.getElementById(id),db=getFirestore(firebaseApp);
const form=$('fryer-admin-form'),date=$('fryer-admin-date'),done=$('fryer-admin-done'),person=$('fryer-admin-person'),note=$('fryer-admin-note'),status=$('fryer-admin-status'),current=$('fryer-admin-current');
const normalized=e=>({oilChanged:e?.oilChanged===true,performedBy:String(e?.performedBy||e?.oilPerformedBy||''),performedUid:String(e?.performedUid||''),note:String(e?.note||'')});
const localToday=()=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=t=>parts.find(p=>p.type===t)?.value;return get('year')+'-'+get('month')+'-'+get('day')};
date.value=localToday();
let off=null,generation=0,loading=false;
function listen(){
 off?.();off=null;const token=++generation,uid=currentUser()?.uid;
 if(!uid||!isAdmin(currentUser())){current.textContent='Лише для адміністратора.';return}
 const selected=date.value;
 if(!/^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(selected)){current.textContent='Оберіть дату.';return}
 const [month,day]=[selected.slice(0,7),String(Number(selected.slice(8)))];
 current.textContent='Завантажуємо запис…';
 off=onSnapshot(doc(db,'fryerMaintenance',month),snap=>{
  if(token!==generation)return;
  const raw=snap.data()?.days?.[day],e=normalized(raw);
  person.value=e.performedBy;note.value=e.note;done.checked=e.oilChanged;
  current.textContent=e.oilChanged?'Запис існує. Виконавець: '+(e.performedBy||'не вказаний'):'Для цієї дати заміна олії не позначена.';
 },error=>{if(token===generation)current.textContent='Помилка завантаження: '+(error.code||error.message)});
}
date.addEventListener('change',listen);
watchAuth(user=>{if(isAdmin(user))listen();else{off?.();off=null;generation++;}});
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
