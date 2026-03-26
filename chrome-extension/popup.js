// Lead Radar — Popup Script
const DASH = 'https://llr-dashboard.vercel.app/vernetzungen';
const $ = id => document.getElementById(id);

let currentTab = null;
let cachedProfile = null;

// Profil extrahieren — direkt per scripting falls Content Script nicht läuft
async function extractProfileDirectly(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      function get(sel, ctx) {
        const el = (ctx||document).querySelector(sel);
        return el ? el.textContent.trim().replace(/\s+/g,' ') : '';
      }
      function getAny(sels, ctx) {
        for (const s of sels) { const t = get(s,ctx); if(t) return t; }
        return '';
      }
      const p = {};
      p.li_name = getAny(['h1.text-heading-xlarge','.top-card-layout__title','h1']);
      p.li_headline = getAny(['.text-body-medium.break-words','.top-card-layout__headline']);
      p.li_location = getAny(['.text-body-small.inline.t-black--light.break-words','.top-card-layout__first-subline span']);
      p.li_company = '';
      const exp = document.querySelector('#experience');
      if (exp) {
        const sec = exp.closest('section') || exp.parentElement;
        if (sec) p.li_company = get('.hoverable-link-text .t-bold span[aria-hidden]',sec) || get('.t-bold span[aria-hidden]',sec) || '';
      }
      if (!p.li_company) {
        const btn = document.querySelector('[aria-label*=" bei "]');
        if (btn) { const m = (btn.getAttribute('aria-label')||'').match(/ bei (.+)/); if(m) p.li_company = m[1].trim(); }
      }
      p.li_about = '';
      const about = document.querySelector('#about');
      if (about) {
        const sec = about.closest('section') || about.parentElement;
        if (sec) {
          const spans = sec.querySelectorAll('span[aria-hidden="true"]');
          p.li_about = Array.from(spans).map(s=>s.textContent.trim()).filter(t=>t.length>30).join(' ').substring(0,500);
        }
      }
      p.li_skills = [];
      const skills = document.querySelector('#skills');
      if (skills) {
        const sec = skills.closest('section') || skills.parentElement;
        if (sec) {
          const els = sec.querySelectorAll('.hoverable-link-text span[aria-hidden="true"],.t-bold span[aria-hidden="true"]');
          p.li_skills = Array.from(els).map(e=>e.textContent.trim()).filter(s=>s.length>1&&s.length<60).slice(0,10);
        }
      }
      p.li_url = window.location.href.split('?')[0];
      const img = document.querySelector('.pv-top-card-profile-picture__image,img.profile-photo-edit__preview');
      p.li_avatar_url = img ? img.src : '';
      return p;
    }
  });
  return results?.[0]?.result;
}

// Profil holen — erst Content Script versuchen, dann direktes Inject als Fallback
async function getProfile(tabId) {
  try {
    const r = await chrome.tabs.sendMessage(tabId, { type: 'GET_PROFILE' });
    if (r && r.success && r.profile) return r.profile;
  } catch(e) {
    // Content Script nicht erreichbar — direkt injizieren
  }
  // Fallback: direkt per scripting.executeScript
  return await extractProfileDirectly(tabId);
}

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
      const profile = await getProfile(tab.id);
      if (profile && profile.li_name) {
        cachedProfile = profile;
        $('pName').textContent = profile.li_name;
        $('pSub').textContent  = profile.li_headline || '';
        $('pCo').textContent   = profile.li_company  || '';
        $('profile').classList.add('show');
      }
    } catch(e) {
      console.log('Vorschau nicht verfügbar:', e.message);
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
      profile = await getProfile(currentTab.id);
    }
    if (!profile || !profile.li_name) throw new Error('Kein Name gefunden — bitte Seite neu laden');

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

init();
