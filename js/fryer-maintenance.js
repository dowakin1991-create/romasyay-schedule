import { getFirestore, doc, collection, query, orderBy, limit, onSnapshot, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseApp } from './store.js?v=20261111.bindingfix';
import { currentUser, isAdmin } from './auth.js?v=20261111.rolefix';
import { getFryerPreference, setFryerPreference, notifyFryer } from './push.js?v=20261111.binding2';

const db = getFirestore(firebaseApp);
const $ = id => document.getElementById(id);
const monthNames=['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const weekday=['Нд','Пн','Вт','Ср','Чт','Пт','Сб'];
let access=false, month='', stop=null, stopHistory=null, ticket=0, entries={}, loaded=false, selectedDay=null, saving=false;
const monthKey=()=>window.romasyayCurrentMonth?.()||'';
const cleanEntry=value=>({
 cleaned:value?.cleaned===true,
 oilChanged:value?.oilChanged===true,
 note:typeof value?.note==='string'?value.note.slice(0,250):'',
 oilPerformedBy:typeof value?.oilPerformedBy==='string'?value.oilPerformedBy.slice(0,80):'',
 oilPerformedAt:typeof value?.oilPerformedAt==='string'?value.oilPerformedAt.slice(0,30):''
});
const localDatetime=value=>{
 if(!value)return '';
 const d=new Date(value);
 if(!Number.isFinite(d.getTime()))return '';
 const pad=n=>String(n).padStart(2,'0');
 return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
};
function updateOilFields(){
 const selected=$('fryer-oil').checked;
 $('fryer-oil-details').hidden=!selected;
 $('fryer-oil-by').disabled=!selected;
 $('fryer-oil-at').disabled=!selected;
}
let preferenceTicket=0,preferenceBusy=false;
const prefToggle=$('fryer-push-toggle'),prefStatus=$('fryer-push-pref-status');
async function loadPreference(){
  const uid=currentUser()?.uid,token=++preferenceTicket;
  prefToggle.disabled=true;prefToggle.checked=false;
  prefStatus.textContent='Завантажуємо особисту підписку…';
  if(!access||!uid){prefStatus.textContent='Увійдіть, щоб налаштувати сповіщення.';return}
  try{
    const enabled=await getFryerPreference();
    if(token!==preferenceTicket||uid!==currentUser()?.uid)return;
    prefToggle.checked=enabled;
    prefToggle.disabled=false;
    prefStatus.textContent=enabled?'Підписка активна для вашого акаунта.':'Підписка вимкнена — повідомлення про фритюр не надходитимуть.';
  }catch(error){
    if(token!==preferenceTicket)return;
    prefStatus.textContent='Налаштування недоступне. Переконайтеся, що оновлений Worker розгорнуто.';
  }
}
prefToggle.addEventListener('change',async()=>{
  if(preferenceBusy)return;
  const desired=prefToggle.checked,uid=currentUser()?.uid;
  preferenceBusy=true;prefToggle.disabled=true;prefStatus.textContent='Зберігаємо налаштування…';
  try{
    const saved=await setFryerPreference(desired);
    if(uid!==currentUser()?.uid)return;
    prefToggle.checked=saved;
    prefStatus.textContent=saved?'Підписку на фритюр увімкнено.':'Підписку на фритюр вимкнено.';
  }catch{
    prefToggle.checked=!desired;
    prefStatus.textContent='Не вдалося зберегти підписку. Спробуйте ще раз.';
  }finally{preferenceBusy=false;prefToggle.disabled=!access}
});
function noticeKind(previous,next){
 if(previous.cleaned===next.cleaned&&previous.oilChanged===next.oilChanged&&previous.note===next.note&&previous.oilPerformedBy===next.oilPerformedBy&&previous.oilPerformedAt===next.oilPerformedAt)return null;
 if(!next.cleaned&&!next.oilChanged&&!next.note)return 'removed';
 if(next.cleaned&&!previous.cleaned&&next.oilChanged&&!previous.oilChanged)return 'both';
 if(next.oilChanged&&!previous.oilChanged)return 'oil';
 if(next.cleaned&&!previous.cleaned)return 'cleaned';
 return 'updated';
}
async function sendFryerNotice(month,day,kind){
 const message=$('fryer-push-feedback');
 if(!kind)return;
 message.textContent='Зміни збережено. Надсилаємо сповіщення підписникам…';
 try{
  const sent=await notifyFryer(month,{day,kind});
  message.textContent=sent.total===0?'Зміни збережено. Активних підписників на фритюр немає.':
   'Зміни збережено. Надіслано: '+sent.accepted+'. Помилок: '+sent.failed+'.';
 }catch{
  message.textContent='Зміни збережено, але push не надіслано. Перевірте оновлення Cloudflare Worker.';
 }
}
function showStatus(message,error=false){const el=$('fryer-status');el.textContent=message;el.classList.toggle('error',error)}
function disableDialog(){selectedDay=null;$('fryer-editor').hidden=true}
function historyText(previous,next){
 const changes=[];
 if(previous.oilChanged!==next.oilChanged)changes.push(next.oilChanged?'🛢️ Позначено заміну олії':'🛢️ Скасовано позначку заміни олії');
 if(previous.cleaned!==next.cleaned)changes.push(next.cleaned?'🧽 Позначено прибирання':'🧽 Скасовано позначку прибирання');
 if(previous.note!==next.note)changes.push(next.note?'📝 Примітку змінено':'📝 Примітку вилучено');
 return changes;
}
function renderHistory(records){
 const list=$('fryer-history-list');list.replaceChildren();
 const status=$('fryer-history-status');
 if(!records.length){status.textContent='Історія поки порожня. Записи, створені до ввімкнення журналу, не мають ретроспективної історії.';return}
 status.textContent='Записів у списку: '+records.length+'. Нові зміни відображаються автоматично.';
 for(const record of records){
  const data=record.data();
  const before=cleanEntry(data.before),after=cleanEntry(data.after);
  const changes=historyText(before,after);
  const item=document.createElement('li');item.className='fryer-history-item';
  const top=document.createElement('div');top.className='fryer-history-top';
  const day=document.createElement('strong');
  day.textContent=String(data.dayKey||'?')+'.'+month.slice(5)+'.'+month.slice(0,4);
  const date=document.createElement('time');
  const created=data.createdAt?.toDate?.();
  date.textContent=created?created.toLocaleString('uk-UA',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Час уточнюється';
  if(created)date.dateTime=created.toISOString();
  top.append(day,date);
  const by=document.createElement('p');by.className='fryer-history-author';
  const name=typeof data.actorName==='string'&&data.actorName.trim()?data.actorName.trim():'Користувач';
  const uid=typeof data.actorUid==='string'?data.actorUid.slice(0,7):'невідомий';
  by.textContent='Запис вніс акаунт: '+name+' · UID '+uid+'…';
  const body=document.createElement('ul');body.className='fryer-history-changes';
  for(const line of changes){const change=document.createElement('li');change.textContent=line;body.append(change)}
  if(before.note!==after.note&&after.note){const note=document.createElement('li');note.textContent='Нова примітка: '+after.note;body.append(note)}
  if(before.note!==after.note&&before.note){const note=document.createElement('li');note.textContent='Попередня примітка: '+before.note;body.append(note)}
  if(after.oilChanged){
    const op=document.createElement('li');
    const when=after.oilPerformedAt?new Date(after.oilPerformedAt):null;
    const whenText=when&&Number.isFinite(when.getTime())?when.toLocaleString('uk-UA',{dateStyle:'short',timeStyle:'short'}):'час не вказано';
    op.textContent='Фактична заміна олії: '+(after.oilPerformedBy||'виконавця не вказано')+' · '+whenText;
    body.append(op);
  }
  if(before.oilPerformedBy!==after.oilPerformedBy||before.oilPerformedAt!==after.oilPerformedAt){
    const correction=document.createElement('li');
    correction.textContent='Дані виконавця/часу заміни: '+(before.oilPerformedBy||'не вказано')+' → '+(after.oilPerformedBy||'не вказано');
    body.append(correction);
  }
  item.append(top,by,body);list.append(item);
 }
}
function watchHistory(key,attempt){
 const records=query(collection(db,'fryerMaintenance',key,'history'),orderBy('createdAt','desc'),limit(100));
 $('fryer-history-status').textContent='Завантажуємо журнал…';
 $('fryer-history-list').replaceChildren();
 stopHistory=onSnapshot(records,snap=>{
   if(ticket!==attempt)return;
   renderHistory(snap.docs);
 },error=>{
   if(ticket!==attempt)return;
   $('fryer-history-status').textContent='Не вдалося отримати журнал: '+(error.code||'помилка')+'. Перевірте правила Firestore.';
 });
}

function unsubscribe(){ticket++;stop?.();stop=null;stopHistory?.();stopHistory=null;entries={};loaded=false;disableDialog();$('fryer-history-list').replaceChildren();}
function watch(){
  const next=monthKey();
  if(!access||!next||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(next)){unsubscribe();return}
  if(month===next&&stop)return;
  unsubscribe();month=next;
  showStatus('Завантажуємо окремий графік фритюра…');render();
  const attempt=++ticket;
  watchHistory(month,attempt);
  stop=onSnapshot(doc(db,'fryerMaintenance',month),snap=>{
    if(attempt!==ticket)return;
    const raw=snap.exists()?snap.data()?.days:{};
    entries=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
    loaded=true;showStatus('Дані фритюра актуальні');render();
    if(selectedDay)updateDialog();
  },error=>{if(attempt!==ticket)return;loaded=false;showStatus('Не вдалося завантажити графік фритюра: '+(error?.code||'помилка'),true);render()});
}
function render(){
 const grid=$('fryer-calendar');if(!grid)return;
 grid.replaceChildren();
 const [y,m]=month.split('-').map(Number);
 if(!y||!m)return;
 $('fryer-month').textContent=monthNames[m-1]+' '+y;
 const count=new Date(y,m,0).getDate();
 let cleaned=0,oil=0;
 for(let day=1;day<=count;day++){
   const entry=cleanEntry(entries[String(day)]);
   if(entry.cleaned)cleaned++;
   if(entry.oilChanged)oil++;
   const button=document.createElement('button');
   button.type='button';button.className='fryer-day'+(entry.cleaned?' is-cleaned':'')+(entry.oilChanged?' is-oil':'');
   button.disabled=!loaded;
   button.setAttribute('aria-label',day+' '+monthNames[m-1]+': '+(entry.cleaned?'прибирання виконано':'прибирання не позначене')+', '+(entry.oilChanged?'олію замінено':'заміна олії не позначена')+(entry.note?', є примітка':''));
   const label=document.createElement('span');label.className='fryer-day-num';label.textContent=String(day);
   const wk=document.createElement('small');wk.textContent=weekday[new Date(y,m-1,day).getDay()];
   const marks=document.createElement('span');marks.className='fryer-day-marks';
   if(entry.cleaned){const mark=document.createElement('span');mark.textContent='🧽';mark.title='Прибирання';marks.append(mark)}
   if(entry.oilChanged){const mark=document.createElement('span');mark.textContent='🛢️';mark.title='Заміна олії';marks.append(mark)}
   if(entry.note){const mark=document.createElement('span');mark.textContent='•';mark.title='Примітка';marks.append(mark)}
   button.append(label,wk,marks);
   button.addEventListener('click',()=>openDay(day));
   grid.append(button);
 }
 $('fryer-cleaned-total').textContent=String(cleaned);
 $('fryer-oil-total').textContent=String(oil);
}
function openDay(day){if(!loaded)return;selectedDay=day;updateDialog();$('fryer-editor').hidden=false}
function updateDialog(){
 if(!selectedDay)return;
 const entry=cleanEntry(entries[String(selectedDay)]);
 const [y,m]=month.split('-').map(Number);
 $('fryer-editor-title').textContent=selectedDay+' '+monthNames[m-1].toLowerCase()+' '+y;
 $('fryer-cleaned').checked=entry.cleaned;
 $('fryer-oil').checked=entry.oilChanged;
 $('fryer-note').value=entry.note;
 $('fryer-oil-by').value=entry.oilPerformedBy;
 $('fryer-oil-at').value=localDatetime(entry.oilPerformedAt);
 updateOilFields();
 const editable=isAdmin(currentUser());
 $('fryer-editor-readonly').hidden=editable;
 $('fryer-editor-fields').disabled=!editable;
 $('fryer-save').hidden=!editable;
 $('fryer-save').disabled=!editable||saving;
 $('fryer-editor-message').textContent='';
}
async function save(event){
 event.preventDefault();if(!access||!selectedDay||saving||!isAdmin(currentUser()))return;
 const day=selectedDay,key=month,cleaned=$('fryer-cleaned').checked,oilChanged=$('fryer-oil').checked,note=$('fryer-note').value.trim();
 const oilPerformedBy=oilChanged?$('fryer-oil-by').value.trim():'';
 const localOilTime=oilChanged?$('fryer-oil-at').value:'';
 const parsedOilTime=localOilTime?new Date(localOilTime):null;
 const oilPerformedAt=oilChanged&&parsedOilTime&&Number.isFinite(parsedOilTime.getTime())?parsedOilTime.toISOString():'';
 if(note.length>250||oilPerformedBy.length>80){$('fryer-editor-message').textContent='Перевір довжину примітки або імені виконавця.';return}
 if(oilChanged&&localOilTime&&!oilPerformedAt){$('fryer-editor-message').textContent='Вказано некоректний час заміни олії.';return}
 const ref=doc(db,'fryerMaintenance',key);
 const auditRef=doc(collection(db,'fryerMaintenance',key,'history'));
 const actor=currentUser();
 const actorUid=actor?.uid;
 const actorName=(typeof actor?.displayName==='string'&&actor.displayName.trim()?actor.displayName.trim():'Користувач').slice(0,80);
 const after={cleaned,oilChanged,note,oilPerformedBy,oilPerformedAt};
 saving=true;$('fryer-save').disabled=true;$('fryer-editor-message').textContent='Зберігаємо…';
 try{
  const result=await runTransaction(db,async tx=>{
   const snap=await tx.get(ref),data=snap.exists()?snap.data():{};
   const days={...(data.days&&typeof data.days==='object'?data.days:{})};
   const existing=days[String(day)];
   const before=cleanEntry(existing);
   if(!before.oilChanged&&after.oilChanged&&(!after.oilPerformedBy||!after.oilPerformedAt))
     throw new Error('Вкажи виконавця та фактичний час нової заміни олії.');
   if(before.cleaned===after.cleaned&&before.oilChanged===after.oilChanged&&before.note===after.note&&before.oilPerformedBy===after.oilPerformedBy&&before.oilPerformedAt===after.oilPerformedAt)return {before,changed:false};
   if(after.cleaned||after.oilChanged||after.note)days[String(day)]=after;
   else delete days[String(day)];
   tx.set(ref,{days,updatedAt:serverTimestamp(),lastAuditId:auditRef.id});
   tx.set(auditRef,{
     dayKey:String(day),actorUid,actorName,createdAt:serverTimestamp(),
     before:existing&&typeof existing==='object'?existing:{},
     after:(after.cleaned||after.oilChanged||after.note)?after:{}
   });
   return {before,changed:true};
  });
  if(!result.changed){
    $('fryer-editor-message').textContent='Змін немає — нічого не збережено.';
    return;
  }
  if(key===month&&selectedDay===day)disableDialog();
  void sendFryerNotice(key,day,noticeKind(result.before,after));
 }catch(error){$('fryer-editor-message').textContent='Не вдалося зберегти: '+(error?.message||error?.code||'помилка')}
 finally{saving=false;$('fryer-save').disabled=false}
}
$('fryer-oil').addEventListener('change',()=>{
 if($('fryer-oil').checked&&!$('fryer-oil-by').value&&!$('fryer-oil-at').value){
   const user=currentUser();
   $('fryer-oil-by').value=user?.displayName?.trim()||'';
   $('fryer-oil-at').value=localDatetime(new Date().toISOString());
 }
 updateOilFields();
});
$('fryer-form').addEventListener('submit',save);
$('fryer-cancel').addEventListener('click',disableDialog);
$('fryer-editor').addEventListener('click',e=>{if(e.target===$('fryer-editor'))disableDialog()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')disableDialog()});
window.addEventListener('romasyay:month-change',()=>{if(access)watch()});
window.addEventListener('romasyay:access-change',event=>{
 const next=event.detail?.allowed===true;
 if(!next){access=false;month='';unsubscribe();$('fryer-view').hidden=true;preferenceTicket++;prefToggle.disabled=true;prefToggle.checked=false}
 else {access=true;watch();loadPreference()}
});
if(!$('private-schedule').hidden){access=true;watch();loadPreference()}
