/* Manual themes persist across devices' pages; default follows OS preference. */
const STORAGE_KEY='romasyay.schedule.theme';
const root=document.documentElement;
function storedTheme(){try{return localStorage.getItem(STORAGE_KEY)}catch{return null}}
function systemTheme(){return window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
function currentTheme(){return root.dataset.theme==='dark'?'dark':'light'}
function applyTheme(theme){root.dataset.theme=theme;root.style.colorScheme=theme;document.querySelectorAll('.theme-switch').forEach(btn=>{const dark=theme==='dark';btn.setAttribute('aria-label',dark?'Увімкнути світлу кремову тему':'Увімкнути темну чорно-помаранчеву тему');btn.setAttribute('title',dark?'Світла тема':'Темна тема');btn.setAttribute('aria-pressed',String(dark));btn.querySelector('.theme-switch-icon').textContent=dark?'☀️':'🌙';btn.querySelector('.theme-switch-label').textContent=dark?'Світла':'Темна'})}
applyTheme(root.dataset.theme==='dark'||root.dataset.theme==='light'?root.dataset.theme:systemTheme());
document.addEventListener('DOMContentLoaded',()=>{
 const header=document.querySelector('body[data-page] .container > header');
 if(!header)return;
 const button=document.createElement('button');button.type='button';button.className='theme-switch';
 button.innerHTML='<span class="theme-switch-icon" aria-hidden="true"></span><span class="theme-switch-label"></span>';
 button.addEventListener('click',()=>{const next=currentTheme()==='dark'?'light':'dark';try{localStorage.setItem(STORAGE_KEY,next)}catch{}applyTheme(next)});
 header.append(button);applyTheme(currentTheme());
});
const mq=window.matchMedia('(prefers-color-scheme: dark)');
mq.addEventListener?.('change',()=>{if(!storedTheme())applyTheme(systemTheme())});
