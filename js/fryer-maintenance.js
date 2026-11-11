import {getFirestore,doc,getDoc,collection,query,orderBy,limit,onSnapshot,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {firebaseApp} from './store.js?v=20261111.bindingfix';
import {currentUser} from './auth.js?v=20261111.rolefix';
const db=getFirestore(firebaseApp),$=id=>document.getElementById(id);
const monthNames=['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Грудень'];
const entry=e=>({oilChanged:e?.oilChanged===true,note:e?.note||'',performedBy:e?.performedBy||e?.oilPerformedBy||''});
const kyiv=()=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const a=k=>p.find(x=>x.type===k)?.value;return a('year')+'-'+a('month')+'-'+a('day')};
let month='',access=false,records={},loaded=false,eligible=false,employeeName='',activeUid='',off=null,offHistory=null,version=0,busy=false;
const panel=$('fryer-view'),editor=$('fryer-editor');
function closeEditor(){editor.hidden=true}
function close(){closeEditor();panel.hidden=true;document.body.classList.remove('fryer-journal-open')}
function clear(){version++;off?.();offHistory?.();off=offHistory=null;loaded=false;records={};eligible=false;close()}
function render(){
 if(!month)return;
 const [y,m]=month.split('-').map(Number);
 $('fryer-month').textContent=monthNames[m-1]+' '+y;
 const list=$('fryer-journal-entries');list.replaceChildren();
 const items=Object.entries(records).filter(([d,r])=>Number(d)>0&&entry(r).oilChanged).sort((a,b)=>Number(b[0])-Number(a[0]));
 $('fryer-oil-total').textContent=items.length;
 if(!items.length){const el=document.createElement('p');el.className='fryer-empty';el.textContent='За цей місяць замін олії ще немає.';list.append(el)}
 for(const [day,data] of items){
  const e=entry(data),row=document.createElement('div');row.className='fryer-journal-entry';
  const symbol=document.createElement('span');symbol.className='fryer-entry-symbol';symbol.textContent='🛢';
  const info=document.createElement('div'),title=document.createElement('strong'),note=document.createElement('p');
  title.textContent=String(day).padStart(2,'0')+'.'+month.slice(5)+'.'+y+' — '+(e.performedBy||'виконавець не зазначений');
  note.textContent=e.note||'Заміну олії виконано';
  info.append(title,note);row.append(symbol,info);list.append(row)
 }
 eligibility();
}
function renderHistory(docs){
 const list=$('fryer-history-list');list.replaceChildren();
 $('fryer-history-status').textContent=docs.length?'Записів у журналі: '+docs.length:'Історія змін поки порожня.';
 for(const item of docs){
  const a=item.data(),prev=entry(a.before),next=entry(a.after);
  const li=document.createElement('li');li.className='fryer-history-item';
  const title=document.createElement('div');title.className='fryer-history-top';
  const day=document.createElement('strong');day.textContent=String(a.dayKey||'?')+'.'+month.slice(5)+'.'+month.slice(0,4);
  const kind=document.createElement('span');kind.textContent=prev.oilChanged===next.oilChanged?'Виправлення':next.oilChanged?'Замінено':'Скасовано';
  title.append(day,kind);
  const who=document.createElement('p');who.className='fryer-history-author';who.textContent='Запис змінив: '+(a.actorName||'Користувач');
  const detail=document.createElement('p');detail.textContent=next.oilChanged?'Замінив: '+(next.performedBy||'не зазначено')+(next.note?' · '+next.note:''):'Позначку скасовано';
  li.append(title,who,detail);list.append(li)
 }
}
function eligibility(){
 const day=Number(kyiv().slice(8)),sameMonth=month===kyiv().slice(0,7),done=sameMonth&&entry(records[String(day)]).oilChanged;
 const button=$('fryer-start');button.disabled=!access||!loaded||!eligible||!sameMonth||done||busy;
 $('fryer-journal-eligibility').textContent=!loaded?'Завантаження…':!sameMonth?'Позначати заміну можна тільки за сьогодні.':done?'Заміну за сьогодні вже внесено. Виправлення — через адміністратора.':eligible?'Ви сьогодні на зміні — можна зафіксувати заміну.':'Позначку може поставити тільки працівник, який сьогодні на зміні.';
}
async function checkShift(){
 const token=++version,user=currentUser();eligible=false;employeeName='';activeUid='';eligibility();
 if(!user||!access||!loaded)return;
 try{
  const team=await getDoc(doc(db,'teamAccess',user.uid)),id=team.data()?.employeeId;
  if(!id)return;
  const [person,schedule,absent]=await Promise.all([
    getDoc(doc(db,'employeeAccess',String(id))),
    getDoc(doc(db,'schedules',month)),
    getDoc(doc(db,'availability',month,'employees',String(id)))
  ]);
  if(token!==version||person.data()?.uid!==user.uid)return;
  const e=(schedule.data()?.employees||[]).find(x=>String(x.id)===String(id));
  const day=Number(kyiv().slice(8));
  const shifts=[...(e?.shifts||[]),...(e?.shiftsFirst||[]),...(e?.shiftsSecond||[])].map(Number);
  const unavailable=(absent.exists()?absent.data().days:e?.unavail||[]).map(Number);
  if(month!==kyiv().slice(0,7)||!shifts.includes(day)||unavailable.includes(day))return;
  eligible=true;activeUid=user.uid;employeeName=String(e.name||user.displayName||'Працівник').slice(0,80);
 }catch(e){console.warn('Fryer shift:',e.code||e.message)}
 if(token===version)eligibility();
}
function watch(){
 const target=window.romasyayCurrentMonth?.();
 if(!access||!/^20\d\d-(0[1-9]|1[0-2])$/.test(target||''))return;
 if(off&&month===target)return;
 clear();month=target;const ticket=++version;
 $('fryer-status').textContent='Завантажуємо журнал…';
 off=onSnapshot(doc(db,'fryerMaintenance',month),snap=>{
  if(ticket>version)return;records=snap.data()?.days||{};loaded=true;
  $('fryer-status').textContent='Дані актуальні';render();void checkShift();
 },e=>{$('fryer-status').textContent='Помилка: '+(e.code||e.message)});
 offHistory=onSnapshot(query(collection(db,'fryerMaintenance',month,'history'),orderBy('createdAt','desc'),limit(100)),
  snap=>renderHistory(snap.docs),e=>{$('fryer-history-status').textContent='Журнал недоступний: '+(e.code||e.message)});
}
function open(){if(!access)return;panel.hidden=false;document.body.classList.add('fryer-journal-open');watch();void checkShift()}
function start(){
 if(!eligible||!loaded||month!==kyiv().slice(0,7)||entry(records[String(Number(kyiv().slice(8)))]).oilChanged)return;
 $('fryer-editor-title').textContent='Підтвердити заміну олії — '+kyiv().split('-').reverse().join('.');
 $('fryer-performer-label').textContent='Виконавець: '+employeeName;
 $('fryer-note').value='';$('fryer-editor-message').textContent='';editor.hidden=false;
}
async function save(event){
 event.preventDefault();
 if(!eligible||busy||!currentUser())return;
 const date=kyiv(),m=date.slice(0,7),day=String(Number(date.slice(8)));
 if(m!==month)return;
 busy=true;$('fryer-save').disabled=true;
 try{
  const uid=currentUser().uid,performer=employeeName,note=$('fryer-note').value.trim();
  const ref=doc(db,'fryerMaintenance',m),history=doc(collection(db,'fryerMaintenance',m,'history'));
  await runTransaction(db,async tx=>{
   const snap=await tx.get(ref),days={...(snap.data()?.days||{})};
   if(days[day])throw Error('Уже є запис за цю дату. Зверніться до адміністратора.');
   const after={oilChanged:true,performedBy:performer,performedUid:uid,note};
   days[day]=after;
   tx.set(ref,{days,lastAuditId:history.id,updatedAt:serverTimestamp()});
   tx.set(history,{dayKey:day,actorUid:uid,actorName:performer,createdAt:serverTimestamp(),before:{},after});
  });
  closeEditor();
 }catch(e){$('fryer-editor-message').textContent='Не вдалося зберегти: '+(e.message||e.code||'помилка')}
 finally{busy=false;$('fryer-save').disabled=false;eligibility()}
}
$('fryer-journal-close').addEventListener('click',close);
$('fryer-journal-scrim').addEventListener('click',close);
$('fryer-start').addEventListener('click',start);
$('fryer-cancel').addEventListener('click',closeEditor);
$('fryer-form').addEventListener('submit',save);
editor.addEventListener('click',e=>{if(e.target===editor)closeEditor()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!editor.hidden)closeEditor();else close()}});
window.addEventListener('romasyay:open-fryer',open);
window.addEventListener('romasyay:open-fryer-day',open);
window.addEventListener('romasyay:month-change',()=>{if(access)watch()});
window.addEventListener('romasyay:access-change',e=>{access=e.detail?.allowed===true;if(access)watch();else{clear();month=''}});
if(!$('private-schedule').hidden){access=true;watch()}
