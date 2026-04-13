// ═══════════════════════════════════════════════════════════════
// Leadesk Chrome Extension — Content Script v6.0
// Fix: Auth direkt über Supabase anon key (kein Storage nötig)
// ═══════════════════════════════════════════════════════════════

var SUPABASE_URL = 'https://jdhajqpgfrsuoluaesjn.supabase.co'
var SUPABASE_KEY = 'sb_publishable__KdQsVuSD6WWuswGcViaRw_CxDK8grx'
var LEADESK_URL  = 'https://app.leadesk.de'

// ── Token holen: zuerst Storage, dann Leadesk-Tab ────────────────
async function getToken() {
  try {
    // 1. Aus chrome.storage — mit JWT-Expiry-Check
    var stored = await new Promise(function(r) {
      chrome.storage.local.get(['supabaseSession', 'userId', 'token', 'tokenExpiry'], r)
    })
    
    // Neues Format (background.js v7.2)
    var cachedToken = stored.token || (stored.supabaseSession && stored.supabaseSession.access_token)
    var cachedUserId = stored.userId
    
    if (cachedToken && cachedUserId) {
      // JWT Expiry prüfen
      var tokenOk = false
      try {
        var parts = cachedToken.split('.')
        var payload = JSON.parse(atob(parts[1]))
        tokenOk = payload.exp && (payload.exp * 1000 > Date.now() + 60000)
      } catch(e) { tokenOk = false }
      
      if (tokenOk) {
        return { token: cachedToken, userId: cachedUserId }
      } else {
        // Abgelaufen — Cache löschen damit Background neu holt
        try { chrome.storage.local.remove(['token', 'userId', 'tokenExpiry', 'supabaseSession']) } catch(e) {}
      }
    }

    // 2. Via background script aus Leadesk-Tab
    return await new Promise(function(r) {
      try {
        chrome.runtime.sendMessage({ type: 'GET_AUTH' }, function(resp) {
          if (chrome.runtime.lastError) { r(null); return }
          if (resp && resp.token) r(resp)
          else r(null)
        })
      } catch(e) { r(null) }
    })
  } catch(e) {
    console.warn('[Leadesk] Extension context invalidated — bitte F5 drücken')
    return { contextInvalid: true }
  }
}

// ── Supabase REST ─────────────────────────────────────────────────
async function sbPost(path, body) {
  var auth = await getToken()
  if (!auth || !auth.token) return { error: 'NOT_LOGGED_IN' }

  try {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + auth.token,
        'Prefer': 'return=representation,resolution=merge-duplicates'
      },
      body: JSON.stringify(body)
    })
    var data = await res.json()
    if (!res.ok) return { error: data.message || res.status }
    return { data: data, userId: auth.userId }
  } catch(e) {
    return { error: e.message }
  }
}

// ── Profil scrapen ────────────────────────────────────────────────
function scrapeProfile() {
  if (!window.location.href.includes('/in/')) return null

  function get(sels) {
    var list = Array.isArray(sels) ? sels : [sels]
    for (var i = 0; i < list.length; i++) {
      var el = document.querySelector(list[i])
      if (el && el.innerText && el.innerText.trim()) return el.innerText.trim()
    }
    return ''
  }
  function attr(sels, a) {
    var list = Array.isArray(sels) ? sels : [sels]
    for (var i = 0; i < list.length; i++) {
      var v = document.querySelector(list[i])
      v = v && v.getAttribute(a)
      if (v && v.startsWith('http')) return v
    }
    return ''
  }

  var fullName = get(['h1.text-heading-xlarge', 'h1[class*="heading"]', 'h1'])
  if (!fullName) return null

  var parts     = fullName.trim().split(/\s+/)
  var firstName = parts[0] || ''
  var lastName  = parts.slice(1).join(' ') || ''
  var headline  = get(['.text-body-medium.break-words', 'div.text-body-medium'])
  var jobTitle  = headline.split(' bei ')[0].split(' at ')[0].trim() || headline
  var company   = headline.includes(' bei ') ? headline.split(' bei ').pop().trim()
                : headline.includes(' at ')  ? headline.split(' at ').pop().trim() : ''
  var avatarUrl = attr(['img.pv-top-card-profile-picture__image', '.pv-top-card__photo img', 'img[class*="profile-photo"]'], 'src')
  var location  = get(['.text-body-small.inline.t-black--light.break-words'])
  var city      = location.split(',')[0].trim()
  var country   = location.split(',').pop().trim()
  var degree    = get(['.dist-value', '[class*="distance"]'])
  var about     = get(['.display-flex.ph5.pv3 span[aria-hidden="true"]'])
  var liUrl     = window.location.href.split('?')[0].split('#')[0].replace(/\/$/, '').toLowerCase()

  // name Feld ist NOT NULL in DB — Fallback sicherstellen
  var safeName = fullName || firstName + ' ' + lastName || 'Unbekannt'

  return {
    first_name: firstName, last_name: lastName, name: safeName,
    job_title: jobTitle, company: company, headline: headline,
    avatar_url: avatarUrl || null, profile_url: liUrl, linkedin_url: liUrl,
    li_about_summary: about || null,
    city: city || null, country: country || null,
    li_connection_status: degree === '1st' ? 'verbunden' : degree === '2nd' ? 'pending' : 'nicht_verbunden',
    source: 'extension_import', status: 'Lead',
    hs_score: degree === '1st' ? 60 : degree === '2nd' ? 40 : 20,
  }
}

// ── Import Kern-Logik ─────────────────────────────────────────────
async function doImport(onLoading, onSuccess, onError) {
  onLoading()

  var auth = await getToken()
  if (!auth) {
    onError('⚠ Bitte in Leadesk einloggen')
    return
  }
  if (auth.contextInvalid) {
    onError('↻ Seite neu laden (F5)')
    return
  }
  if (!auth.token) {
    onError('⚠ Leadesk-Tab öffnen')
    return
  }

  var profile = scrapeProfile()
  if (!profile) {
    onError('⚠ Profil nicht lesbar')
    return
  }

  profile.user_id = auth.userId
  var result = await sbPost('leads?on_conflict=user_id,linkedin_url', [profile])

  if (result.error) {
    console.error('[Leadesk] Import Fehler:', result.error)
    onError('⚠ ' + String(result.error || 'Fehler').substring(0, 25))
  } else {
    onSuccess(profile.name)
    chrome.runtime.sendMessage({ type: 'PROFILE_IMPORTED', name: profile.name })
  }
}

// ── CSS ───────────────────────────────────────────────────────────
function injectCSS() {
  if (document.getElementById('leadesk-css')) return
  var s = document.createElement('style')
  s.id  = 'leadesk-css'
  s.textContent = [
    '@keyframes lsk-spin { to { transform: rotate(360deg); } }',
    '@keyframes lsk-pop  { from { opacity:0; transform:translateY(-50%) scale(0.8); } to { opacity:1; transform:translateY(-50%) scale(1); } }',
    '#leadesk-float { animation: lsk-pop 0.2s ease; }',
    '#leadesk-float:hover #lsk-tip { display:block !important; }',
  ].join('\n')
  document.head.appendChild(s)
}

// ── Profil-Button in Action-Bar ───────────────────────────────────
function injectProfileButton() {
  if (!window.location.href.includes('/in/')) return
  if (document.getElementById('leadesk-portal')) return

  var actionBtn = Array.from(document.querySelectorAll('button.artdeco-button')).find(function(b) {
    var t = b.innerText && b.innerText.trim()
    return t && (t==='Nachricht'||t==='Message'||t==='Vernetzen'||t==='Connect'||t==='Folgen'||t==='Follow'||t==='Mehr'||t==='More')
  })
  if (!actionBtn) return

  var container = actionBtn.parentElement && actionBtn.parentElement.parentElement
  if (!container) return

  var portal = document.createElement('div')
  portal.id = 'leadesk-portal'
  portal.className = 'injected-portal'
  portal.style.cssText = 'display:inline-flex;align-items:center;'

  var btn = document.createElement('button')
  btn.setAttribute('type', 'button')
  btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:0 16px;height:32px;background:rgb(49,90,231);color:#fff;border:none;border-radius:16px;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background 0.15s;box-shadow:0 2px 8px rgba(49,90,231,0.3);margin-left:8px'
  setDefault(btn)

  btn.addEventListener('click', function(e) {
    e.stopPropagation(); e.preventDefault()
    doImport(
      function()      { btn.style.background='#6B7280'; btn.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" style="animation:lsk-spin 0.8s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Lädt...' },
      function(name)  { btn.style.background='#059669'; btn.innerHTML='✓ Importiert!'; setTimeout(function(){ setDefault(btn) }, 3500) },
      function(msg)   { btn.style.background='#DC2626'; btn.innerHTML=msg; setTimeout(function(){ setDefault(btn) }, 3500) }
    )
  })

  portal.appendChild(btn)
  container.appendChild(portal)
}

function setDefault(btn) {
  btn.style.background = 'rgb(49,90,231)'
  btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/></svg>In Leadesk'
}

// ── Floating Button ───────────────────────────────────────────────
function injectFloatingButton() {
  if (document.getElementById('leadesk-float')) return

  var fb = document.createElement('div')
  fb.id = 'leadesk-float'
  fb.style.cssText = 'position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:2147483640;cursor:pointer;width:48px;height:48px;background:rgb(49,90,231);border-radius:12px 0 0 12px;display:flex;align-items:center;justify-content:center;box-shadow:-3px 0 16px rgba(49,90,231,0.4);transition:filter 0.15s'

  var tip = document.createElement('div')
  tip.id = 'lsk-tip'
  tip.style.cssText = 'display:none;position:absolute;right:52px;top:50%;transform:translateY(-50%);background:#0F172A;color:#fff;padding:5px 10px;border-radius:6px;font-size:12px;white-space:nowrap;font-family:-apple-system,system-ui,sans-serif;pointer-events:none'
  tip.textContent = 'In Leadesk importieren'

  var icon = document.createElement('div')
  icon.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/></svg>'

  fb.appendChild(tip)
  fb.appendChild(icon)

  fb.addEventListener('mouseenter', function() { tip.style.display='block'; fb.style.filter='brightness(1.15)' })
  fb.addEventListener('mouseleave', function() { tip.style.display='none'; fb.style.filter='' })

  fb.addEventListener('click', function() {
    if (!window.location.href.includes('/in/')) {
      tip.textContent = 'Öffne ein LinkedIn-Profil'
      tip.style.display = 'block'
      setTimeout(function() { tip.textContent='In Leadesk importieren'; tip.style.display='none' }, 2000)
      return
    }
    doImport(
      function() {
        fb.style.background = '#6B7280'
        icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" style="animation:lsk-spin 0.8s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>'
        tip.textContent = 'Importiere...'
        tip.style.display = 'block'
      },
      function(name) {
        fb.style.background = '#059669'
        icon.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>'
        tip.textContent = '✓ ' + (name || 'Importiert!')
        tip.style.display = 'block'
        setTimeout(function() {
          fb.style.background = 'rgb(49,90,231)'
          icon.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/></svg>'
          tip.textContent = 'In Leadesk importieren'
          tip.style.display = 'none'
        }, 3500)
      },
      function(msg) {
        fb.style.background = '#DC2626'
        icon.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        tip.textContent = msg
        tip.style.display = 'block'
        setTimeout(function() {
          fb.style.background = 'rgb(49,90,231)'
          icon.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/></svg>'
          tip.textContent = 'In Leadesk importieren'
          tip.style.display = 'none'
        }, 3500)
      }
    )
  })

  document.body.appendChild(fb)
}

// ── Observer ──────────────────────────────────────────────────────
function startObserver() {
  var lastUrl = window.location.href
  var timer = null
  new MutationObserver(function() {
    var url = window.location.href
    if (url !== lastUrl) {
      lastUrl = url
      var old = document.getElementById('leadesk-portal')
      if (old) old.remove()
      clearTimeout(timer)
      if (url.includes('/in/')) timer = setTimeout(injectProfileButton, 2000)
    } else if (url.includes('/in/') && !document.getElementById('leadesk-portal')) {
      clearTimeout(timer)
      timer = setTimeout(injectProfileButton, 800)
    }
  }).observe(document.body, { childList: true, subtree: true })
}

// ── Chrome Messages ───────────────────────────────────────────────
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type === 'SCRAPE_PROFILE') sendResponse({ profile: scrapeProfile() })
  if (msg.type === 'PING') sendResponse({ ok: true, url: window.location.href })
  return true
})

// ── Init ──────────────────────────────────────────────────────────
;(function() {
  injectCSS()
  setTimeout(injectFloatingButton, 800)
  if (window.location.href.includes('/in/')) {
    setTimeout(injectProfileButton, 1500)
    setTimeout(injectProfileButton, 3000)
    setTimeout(injectProfileButton, 5000)
  }
  startObserver()
})()
