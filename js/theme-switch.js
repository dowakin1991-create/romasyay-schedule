// The application theme always follows the device system appearance.
// No stored override and no manual switch.
const root=document.documentElement;
const media=window.matchMedia('(prefers-color-scheme: dark)');
function syncSystemTheme(){
 const theme=media.matches?'dark':'light';
 root.dataset.theme=theme;
 root.style.colorScheme=theme;
 document.querySelectorAll('.theme-switch').forEach(node=>node.remove());
}
syncSystemTheme();
media.addEventListener?.('change',syncSystemTheme);
document.addEventListener('DOMContentLoaded',syncSystemTheme);
