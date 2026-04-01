// Lead Radar Extension popup.js v5.0
// Robust: wartet auf LinkedIn-Login, dann auto-connect

const SB  = 'https://jdhajqpgfrsuoluaesjn.supabase.co'
const KEY = 'sb_publishable__KdQsVuSD6WWuswGcViaRw_CxDK8grx'
const DASH = 'https://llr-dashboard.vercel.app'

function load() { return new Promise(r => chrome.storage.local.get(['session','userId','liConn'], r)) }
function save(d) { return new Promise(r => chrome.storage.local.set(d, r)) }
function clear() { return new Promise(r => chrome.storage.local.remove(['session','userId','liConn'], r)) }

async function signIn(email, pass) {
  const res = await fetch(SB + '/auth/v1/token?grant_type=password', {
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':KEY},
    body:JSON.stringify({email,password:pass})
  })
  if (!res.ok) { const e = await res.json(); throw new Error(e.error_description||'Login fehlgeschlagen') }
  return res.json()
}

async function sbPost(path, body) {
  const d = await load()
  const token = d.session && d.session.access_token
  const res = await fetch(SB + '/rest/v1/' + path, {
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':KEY,'Authorization':'Bearer '+token,'Prefer':'resolution=merge-duplicates,return=representation'},
    body:JSON.stringify(body)
  })
  return res.ok ? res.json() : null
}

async function sbGet(path) {
  const d = await load()
  const token = d.session && d.session.access_token
  const res = await fetch(SB + '/rest/v1/' + path, {
    headers:{'apikey':KEY,'Authorization':'Bearer '+token}
  })
  return res.ok ? res.json() : null
}

// UI
function $id(id) { return document.getElementById(id) }
function setText(id,t) { const e=$id(id); if(e) e.textContent=t }
function showEl(id) { const e=$id(id); if(e) e.style.display='block' }
function hideEl(id) { const e=$id(id); if(e) e.style.display='none' }
function showErr(msg) { const e=$id('err'); if(e){e.textContent=msg;e.style.display='block'} }

function setAvatar(name, url) {
  const wrap = $id('avatar-wrap')
  if (!wrap) return
  const initial = (name||'?').charAt(0).toUpperCase()
  if (url && url.startsWith('http') && !url.includes('static.licdn.com/sc/h/1c5u578iilxfi4m4dvc4q810q')) {
    wrap.innerHTML = '<img src="'+url+'" class="avatar" onerror="this.outerHTML=\'<div class=avatar-placeholder>'+initial+'</div>\'">'
  } else {
    wrap.innerHTML = '<div class="avatar-placeholder">'+initial+'</div>'
  }
}

function showLogin() { showEl('login-view'); hideEl('connected-view') }

function showConnected(conn) {
  hideEl('login-view'); showEl('connected-view')
  const name = conn.li_name || conn.name || 'LinkedIn Konto'
  setText('li-name', name)
  setText('li-headline', conn.li_headline || conn.headline || '')
  setText('conn-status', 'Verbunden')
  setAvatar(name, conn.li_avatar_url || conn.avatar || '')
  const dot = $id('status-dot'); if(dot) { dot.style.background='#10B981'; dot.style.boxShadow='0 0 0 2px rgba(16,185,129,0.25)' }
  const lbl = $id('conn-status'); if(lbl) lbl.style.color='#10B981'
}

function showPending(msg) {
  hideEl('login-view'); showEl('connected-view')
  setText('li-name', msg || 'Verbinde...')
  setText('li-headline', '')
  setText('conn-status', 'Verbinde...')
  const wrap = $id('avatar-wrap')
  if(wrap) wrap.innerHTML = '<div class="avatar-placeholder" style="background:#E5E7EB;color:#9CA3AF;font-size:12px">...</div>'
  const dot = $id('status-dot'); if(dot) { dot.style.background='#F59E0B' }
  const lbl = $id('conn-status'); if(lbl) lbl.style.color='#F59E0B'
}

// Liest Profil aus LinkedIn-Tab per scripting API
async function getProfileFromTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target:{ tabId },
      func: function() {
        // Methode 1: globale Navigation
        const navPhoto = document.querySelector('.global-nav__me-photo')
        if (navPhoto && navPhoto.alt && navPhoto.alt.trim()) {
          return { name: navPhoto.alt.trim(), avatar: navPhoto.src || '', headline: '', source: 'nav' }
        }
        // Methode 2: Feed Identity
        const feedName = document.querySelector('.feed-identity-module__actor-meta .t-bold')
        const feedHead = document.querySelector('.feed-identity-module__actor-meta .t-black--light')
        const feedImg  = document.querySelector('.feed-identity-module__actor-meta img')
        if (feedName && feedName.innerText.trim()) {
          return { name: feedName.innerText.trim(), avatar: feedImg?feedImg.src:'', headline: feedHead?feedHead.innerText.trim():'', source: 'feed' }
        }
        // Methode 3: Profil-Seite
        const h1 = document.querySelector('h1.text-heading-xlarge')
        const profileImg = document.querySelector('.pv-top-card__photo img, img.pv-top-card-profile-picture__image')
        if (h1 && h1.innerText.trim()) {
          return { name: h1.innerText.trim(), avatar: profileImg?profileImg.src:'', headline: '', source: 'profile' }
        }
        // Methode 4: any logged-in indicator
        const meBtn = document.querySelector('[data-control-name="nav.settings_view_profile"]')
        const meImg = document.querySelector('.nav-item__profile-member-photo')
        if (meImg && meImg.alt) {
          return { name: meImg.alt.trim(), avatar: meImg.src||'', headline: '', source: 'meImg' }
        }
        return null
      }
    })
    const r = results && results[0] && results[0].result
    return r
  } catch(e) {
    return null
  }
}

// Warte bis LinkedIn-Tab fertig geladen und eingeloggt
async function waitForLinkedInLogin(tabId, maxWait) {
  const deadline = Date.now() + maxWait
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1500))
    // Prüfe ob Tab noch existiert
    try {
      const tab = await chrome.tabs.get(tabId)
      if (tab.status === 'complete' && tab.url && tab.url.includes('linkedin.com') && !tab.url.includes('/login') && !tab.url.includes('/checkpoint')) {
        const profile = await getProfileFromTab(tabId)
        if (profile && profile.name) return profile
      }
    } catch(e) { break }
  }
  return null
}

// Haupt-Connect Funktion
async function autoConnect() {
  const d = await load()
  if (!d.userId) return
  
  showPending('Suche LinkedIn...')
  
  // 1. Prüfe existierende LinkedIn-Tabs
  const existingTabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' })
  for (const tab of existingTabs) {
    if (tab.url && !tab.url.includes('/login') && !tab.url.includes('/checkpoint')) {
      const profile = await getProfileFromTab(tab.id)
      if (profile && profile.name) {
        await saveConn(profile, d.userId)
        return
      }
    }
  }
  
  // 2. LinkedIn-Feed im Hintergrund öffnen
  showPending('Oeffne LinkedIn...')
  const newTab = await chrome.tabs.create({ url: 'https://www.linkedin.com/feed/', active: false })
  
  // 3. Warte bis geladen und eingeloggt (max 12 Sekunden)
  showPending('Warte auf Einloggen...')
  const profile = await waitForLinkedInLogin(newTab.id, 12000)
  
  // Tab schließen
  try { chrome.tabs.remove(newTab.id) } catch(e) {}
  
  if (profile && profile.name) {
    await saveConn(profile, d.userId)
  } else {
    // Nicht eingeloggt bei LinkedIn
    showPending('Bitte bei LinkedIn einloggen')
    setText('li-name', 'Nicht bei LinkedIn eingeloggt')
    setText('conn-status', 'Action erforderlich')
    const dot = $id('status-dot'); if(dot) dot.style.background='#EF4444'
    const lbl = $id('conn-status'); if(lbl) { lbl.style.color='#EF4444'; lbl.textContent='LinkedIn-Login noetig' }
    // Zeige LinkedIn-Tab aktiv
    $id('li-btn') && ($id('li-btn').textContent='Bei LinkedIn einloggen')
  }
}

async function saveConn(profile, userId) {
  const conn = {
    user_id: userId,
    status: 'connected',
    li_name: profile.name,
    li_avatar_url: profile.avatar || '',
    li_headline: profile.headline || '',
    connected_at: new Date().toISOString(),
    last_active: new Date().toISOString(),
  }
  await sbPost('linkedin_connections?on_conflict=user_id', conn)
  await save({ liConn: conn })
  showConnected(conn)
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
  const d = await load()
  
  if (d.session && d.userId) {
    if (d.liConn && d.liConn.li_name && d.liConn.status === 'connected') {
      showConnected(d.liConn)
      // Im Hintergrund refresh aus Supabase
      sbGet('linkedin_connections?user_id=eq.'+d.userId+'&select=*&limit=1').then(data => {
        if (data && data[0] && data[0].status === 'connected') {
          save({ liConn: data[0] })
          showConnected(data[0])
        }
      })
    } else {
      showPending('Verbinde...')
      autoConnect()
    }
  } else {
    showLogin()
  }
  
  // Login
  const loginBtn = $id('login-btn')
  if (loginBtn) {
    const doLogin = async () => {
      const email = ($id('email')||{}).value||''
      const pass  = ($id('password')||{}).value||''
      if (!email||!pass) { showErr('E-Mail und Passwort eingeben'); return }
      loginBtn.disabled=true; loginBtn.textContent='Anmelden...'
      $id('err').style.display='none'
      try {
        const data = await signIn(email, pass)
        await save({ session:data, userId:data.user.id })
        chrome.runtime.sendMessage({ type:'SET_SESSION', session:data, userId:data.user.id })
        autoConnect()
      } catch(e) {
        showErr(e.message)
        loginBtn.disabled=false; loginBtn.textContent='Anmelden'
      }
    }
    loginBtn.addEventListener('click', doLogin)
    document.addEventListener('keydown', e => { if(e.key==='Enter') doLogin() })
  }
  
  $id('logout-btn')?.addEventListener('click', async () => { await clear(); showLogin() })
  $id('dash-btn')?.addEventListener('click', () => { chrome.tabs.create({url:DASH+'/linkedin-connect'}); window.close() })
  $id('li-btn')?.addEventListener('click', () => { chrome.tabs.create({url:'https://www.linkedin.com/feed/'}); window.close() })
  $id('sync-btn')?.addEventListener('click', () => { chrome.runtime.sendMessage({type:'TRIGGER_SYNC'}); const b=$id('sync-btn'); b.textContent='Gestartet!'; setTimeout(()=>{b.textContent='Sync starten'},2000) })
  $id('scrape-btn')?.addEventListener('click', async () => {
    const btn=$id('scrape-btn'); btn.textContent='Importiere...'; btn.disabled=true
    const tabs=await chrome.tabs.query({active:true,currentWindow:true})
    try {
      if(tabs[0]?.url?.includes('linkedin.com/in/')) { await chrome.tabs.sendMessage(tabs[0].id,{type:'EXECUTE_JOB'}); btn.textContent='Importiert!' }
      else btn.textContent='LinkedIn-Profil oeffnen'
    } catch(e) { btn.textContent='Fehler' }
    setTimeout(()=>{btn.textContent='Aktuelles Profil importieren';btn.disabled=false},2500)
  })
  
  // Reconnect Button wenn nicht verbunden
  $id('reconnect-btn')?.addEventListener('click', () => { autoConnect() })
})
