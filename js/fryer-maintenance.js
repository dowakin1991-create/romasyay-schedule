import { getFirestore, doc, collection, query, orderBy, limit, onSnapshot, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseApp } from './store.js?v=20261111.bindingfix';
import { currentUser } from './auth.js?v=20261111.rolefix';

const db=getFirestore(firebaseApp), $=id=>document.getElementById(id);
const months=['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];
const monthsTitle=['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const week=['Нд','Пн','Вт','Ср','Чт','Пт','Сб'];
let access=false,month='',unsubscribeMonth=null,unsubscribeHistory=null,ticket=0,entries={},loaded=false,selectedDay=null,saving=false;
const entry=x=>({oilChanged:x?.oilChanged===true,note:typeof x?.note==='string'?x.note:'',performedBy:typeof x?.performedBy==='string'?x.performedBy:typeof x?.oilPerformedBy==='string'?x.oilPerformedBy:'',performedUid:typeof x?.performedUid==='string'?x.performedUid:''});
const monthKey=()=>window.romasyayCurrentMonth?.()||'';
const dateKey=(y,m,d)=>y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
const today=()=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const part=t=>parts.find(p=>p.type===t)?.value;return part('year')+'-'+part('month')+'-'+part('day')};
function userLabel(user){return String(user?.displayName?.trim()||user?.email?.split('@')[0]||'Працівник').slice(0,80)}
function close(){selectedDay=null;$('fryer-editor').hidden=true}
function reset(){ticket++;unsubscribeMonth?.();unsubscribeHistory?.();unsubscribeMonth=unsubscribeHistory=null;entries={};loaded=false;close();$('fryer-history-list').replaceChildren()}
function watch(){
 const next=monthKey();if(!access||!/^20\d\d-(0[1-9]|1[0-2])$/.test(next)){reset();return}
 if(next===month&&unsubscribeMonth)return;
 reset();month=next;const id=++ticket;
 $('fryer-status').textContent='Завантажуємо календар…';
 const history=query(collection(db,'fryerMaintenance',month,'history'),orderBy('createdAt','desc'),limit(100));
 unsubscribeHistory=onSnapshot(history,snap=>{if(id===ticket)renderHistory(snap.docs)},error=>{
 if(id===ticket)$('fryer-history-status').textContent='Не вдалося завантажити журнал: '+(error?.code||'помилка');
 });
 unsubscribeMonth=onSnapshot(doc(db,'fryerMaintenance',month),snap=>{
 if(id!==ticket)return;entries=snap.data()?.days||{};loaded=true;$('fryer-status').textContent='Дані актуальні';render();if(selectedDay)updateDialog();
 },error=>{if(id===ticket){loaded=false;$('fryer-status').textContent='Помилка завантаження: '+(error?.code||'невідома');render()}});
 render();
}
function render(){
 const grid=$('fryer-calendar');grid.replaceChildren();
 const [year,m]=month.split('-').map(Number);if(!year||!m)return;
 $('fryer-month').textContent=monthsTitle[m-1]+' '+year;
 let count=0;
 for(let day=1;day<=new Date(year,m,0).getDate();day++){
  const e=entry(entries[String(day)]);if(e.oilChanged)count++;
  const btn=document.createElement('button');btn.type='button';btn.className='fryer-day'+(e.oilChanged?' is-oil':'');btn.disabled=!loaded;
  btn.setAttribute('aria-label',day+' '+months[m-1]+': '+(e.oilChanged?'олію замінено':'заміни не позначено'));
  const num=document.createElement('span');num.className='fryer-day-num';num.textContent=day;
  const wk=document.createElement('small');wk.textContent=week[new Date(year,m-1,day).getDay()];
  const mark=document.createElement('span');mark.className='fryer-day-marks';mark.textContent=e.oilChanged?'🛢️':e.note?'•':'';
  btn.append(num,wk,mark);btn.addEventListener('click',()=>open(day));grid.append(btn);
 }
 $('fryer-oil-total').textContent=count;
}
function open(day){if(!loaded)return;selectedDay=day;updateDialog();$('fryer-editor').hidden=false}
function updateDialog(){
 const day=selectedDay;if(!day)return;
 const [year,m]=month.split('-').map(Number),e=entry(entries[String(day)]);
 const canCreate=dateKey(year,m,day)===today()&&!e.oilChanged&&!!currentUser();
 $('fryer-editor-title').textContent=day+' '+months[m-1]+' '+year;
 $('fryer-performer-label').textContent=e.oilChanged?'Заміну виконав(ла): '+(e.performedBy||'в старому записі не зазначено'):'Заміна олії не позначена';
 $('fryer-oil').checked=e.oilChanged;
 $('fryer-note').value=e.note;
 $('fryer-editor-fields').disabled=!canCreate;
 $('fryer-save').hidden=!canCreate;
 $('fryer-save').disabled=!canCreate||saving;
 $('fryer-editor-readonly').hidden=canCreate;
 $('fryer-editor-message').textContent='';
}
function renderHistory(records){
 const list=$('fryer-history-list');list.replaceChildren();
 $('fryer-history-status').textContent=records.length?'Записів: '+records.length+'.':'Історія ще порожня; старі дії відновити неможливо.';
 for(const record of records){
  const a=record.data(),before=entry(a.before),after=entry(a.after);
  const li=document.createElement('li');li.className='fryer-history-item';
  const top=document.createElement('div');top.className='fryer-history-top';
  const date=document.createElement('strong');date.textContent=String(a.dayKey||'?')+'.'+month.slice(5)+'.'+month.slice(0,4);
  const at=document.createElement('time'),t=a.createdAt?.toDate?.();at.textContent=t?t.toLocaleString('uk-UA'):'Час уточнюється';top.append(date,at);
  const actor=document.createElement('p');actor.className='fryer-history-author';actor.textContent='Вніс/виправив: '+(a.actorName||'Користувач')+' · UID '+String(a.actorUid||'').slice(0,7)+'…';
  const changes=document.createElement('ul');changes.className='fryer-history-changes';
  const lines=[];
  if(before.oilChanged!==after.oilChanged)lines.push(after.oilChanged?'🛢️ Позначено заміну олії':'🛢️ Позначку знято');
  if(before.performedBy!==after.performedBy&&after.oilChanged)lines.push('Виконавець: '+(after.performedBy||'не вказано'));
  if(before.note!==after.note)lines.push('Примітка: '+(after.note||'прибрана'));
  if(!lines.length)lines.push('Виправлено попередній запис');
  for(const line of lines){const item=document.createElement('li');item.textContent=line;changes.append(item)}
  li.append(top,actor,changes);list.append(li);
 }
}
async function save(ev){
 ev.preventDefault();if(!access||saving||!selectedDay)return;
 const user=currentUser();if(!user)return;
 const day=selectedDay,key=month,[year,m]=key.split('-').map(Number);
 if(dateKey(year,m,day)!==today()){$('fryer-editor-message').textContent='Працівник може внести заміну лише сьогодні.';return}
 if(!$('fryer-oil').checked){$('fryer-editor-message').textContent='Позначте заміну олії.';return}
 const note=$('fryer-note').value.trim();
 const ref=doc(db,'fryerMaintenance',key),auditRef=doc(collection(db,'fryerMaintenance',key,'history'));
 saving=true;$('fryer-save').disabled=true;
 try{
  const result=await runTransaction(db,async tx=>{
    const snap=await tx.get(ref),data=snap.data()||{},days={...(data.days||{})};
    if(entry(days[String(day)]).oilChanged)throw new Error('Запис уже існує. Зверніться до адміністратора для виправлення.');
    const before=days[String(day)]||{};
    const after={oilChanged:true,note,performedBy:userLabel(user),performedUid:user.uid};
    days[String(day)]=after;
    tx.set(ref,{days,lastAuditId:auditRef.id,updatedAt:serverTimestamp()});
    tx.set(auditRef,{dayKey:String(day),actorUid:user.uid,actorName:userLabel(user),createdAt:serverTimestamp(),before,after});
    return true;
  });
  if(result){close();$('fryer-status').textContent='Заміну олії збережено.'}
 }catch(error){$('fryer-editor-message').textContent='Не вдалося зберегти: '+(error?.message||error?.code||'помилка')}
 finally{saving=false;$('fryer-save').disabled=false}
}
$('fryer-form').addEventListener('submit',save);
$('fryer-cancel').addEventListener('click',close);
$('fryer-editor').addEventListener('click',e=>{if(e.target===$('fryer-editor'))close()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
window.addEventListener('romasyay:month-change',()=>{if(access)watch()});
window.addEventListener('romasyay:access-change',e=>{access=e.detail?.allowed===true;if(!access){reset();month=''}else watch()});
if(!$('private-schedule').hidden){access=true;watch()}
