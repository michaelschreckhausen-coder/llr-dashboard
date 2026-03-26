// Lead Radar — Popup Script
const DASH = 'https://llr-dashboard.vercel.app/vernetzungen';
const $ = id => document.getElementById(id);

let currentTab = null;
let cachedProfile = null;

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  const isLI = !!(tab && tab.url && tab.url.match(/linkedin\.com\/in\//));

  $('status').className = 'status ' + (isLI ? 'linkedin' : 'other');
  $('statusIcon').textContent = isLI ? '\u2705' : '\u26A0\uFE0F';
  $('statusText').textContent = isLI ? 'LinkedIn Profil erkannt \u2713' : 'Bitte ein LinkedIn Profil \xF6ffnen';
  $('btnImport').disabled = !isLI;

  if (isLI) {
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PROFILE' });
      if (r && r.success && r.profile && r.profile.li_name) {
        cachedProfile = r.profile;
        $('pName').textContent = r.profile.li_name;
        $('pSub').textContent = r.profile.li_headline || '';
        $('pCo').textContent = r.profile.li_company || '';
        $('profile').classList.add('show');
      }
    } catch(e) {
      // Content script noch nicht bereit - kein Problem
    }
  }
}

$('btnImport').addEventListener('click', async () => {
  $('btnImport').disabled = true;
  $('btnIcon').style.display = 'none';
  $('spinner').style.display = 'block';
  $('btnLabel').textContent = 'Importiere...';

  try {
    let profile = cachedProfile;

    if (!profile && currentTab) {
      const r = await chrome.tabs.sendMessage(currentTab.id, { type: 'GET_PROFILE' });
      if (!r || !r.success) throw new Error('Profil konnte nicht gelesen werden');
      profile = r.profile;
    }

    if (!profile || !profile.li_name) throw new Error('Kein Name gefunden');

    // An Background Worker senden
    await chrome.runtime.sendMessage({ type: 'IMPORT_PROFILE', profile });

    $('success').classList.add('show');
    $('spinner').style.display = 'none';
    $('btnLabel').textContent = 'Importiert!';

    setTimeout(() => window.close(), 1800);

  } catch(e) {
    $('statusIcon').textContent = '\u274C';
    $('statusText').textContent = e.message;
    $('status').className = 'status other';
    $('btnIcon').style.display = 'block';
    $('spinner').style.display = 'none';
    $('btnLabel').textContent = 'Profil importieren';
    $('btnImport').disabled = false;
  }
});

$('btnDash').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ url: 'https://llr-dashboard.vercel.app/*' });
  if (tabs.length > 0) {
    chrome.tabs.update(tabs[0].id, { active: true });
    chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    chrome.tabs.create({ url: DASH });
  }
  window.close();
});

// Auf Dashboard-Import-Bestätigung hören
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'IMPORT_OK') {
    $('success').classList.add('show');
  }
});

init();
