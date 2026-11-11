import { getFirestore, doc, onSnapshot, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseApp } from './store.js?v=20261029.soho1';
import { currentUser, isAdmin } from './auth.js?v=20261019.8';
import { getFryerPreference, setFryerPreference, notifyFryer } from './push.js?v=20261111.fryer2';

const db = getFirestore(firebaseApp);
const $ = id => document.getElementById(id);
const monthNames=['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const weekday=['Нд','Пн','Вт','Ср','Чт','Пт','Сб'];
let access=false, month='', stop=null, ticket=0, entries={}, loaded=false, selectedDay=null, saving=false;
const monthKey=()=>window.romasyayCurrentMonth?.()||'';
const cleanEntry=value=>({cleaned:value?.cleaned===true,oilChanged:value?.oilChanged===true,note:typeof value?.note==='string'?value.note.slice(0,250):''});
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
 if(previous.cleaned===next.cleaned&&previous.oilChanged===next.oilChanged&&previous.note===next.note)return null;
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
function unsubscribe(){ticket++;stop?.();stop=null;entries={};loaded=false;disableDialog()}
function watch(){
  const next=monthKey();
  if(!access||!next||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(next)){unsubscribe();return}
  if(month===next&&stop)return;
  unsubscribe();month=next;
  showStatus('Завантажуємо окремий графік фритюра…');render();
  const attempt=++ticket;
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
 if(note.length>250){$('fryer-editor-message').textContent='Примітка: максимум 250 символів.';return}
 const ref=doc(db,'fryerMaintenance',key);
 saving=true;$('fryer-save').disabled=true;$('fryer-editor-message').textContent='Зберігаємо…';
 try{
  const previous=await runTransaction(db,async tx=>{
   const snap=await tx.get(ref),data=snap.exists()?snap.data():{};
   const days={...(data.days&&typeof data.days==='object'?data.days:{})};
   const before=cleanEntry(days[String(day)]);
   if(cleaned||oilChanged||note)days[String(day)]={cleaned,oilChanged,note};
   else delete days[String(day)];
   tx.set(ref,{days,updatedAt:serverTimestamp()});
   return before;
  });
  if(key===month&&selectedDay===day)disableDialog();
  void sendFryerNotice(key,day,noticeKind(previous,{cleaned,oilChanged,note}));
 }catch(error){$('fryer-editor-message').textContent='Не вдалося зберегти: '+(error?.code||error.message)}
 finally{saving=false;$('fryer-save').disabled=false}
}
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
