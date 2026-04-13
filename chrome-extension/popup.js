// Leadesk Extension Popup v4.0

let currentTab = null
let currentProfile = null

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.className = 'toast show' + (type === 'error' ? ' error' : type === 'success' ? ' success' : '')
  setTimeout(() => t.classList.remove('show'), 3000)
}

function sendBg(msg) {
  return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve))
}

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  // Aktuellen Tab holen
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  currentTab = tab

  // Status vom Background holen
  const status = await sendBg({ type: 'GET_STATUS' })
  
  if (!status?.authenticated) {
    // Versuche Session vom Dashboard zu laden
    const synced = await sendBg({ type: 'SYNC_SESSION' })
    if (!synced?.success) {
      showNotAuth()
      return
    }
    // Nochmal Status holen nach Sync
    const status2 = await sendBg({ type: 'GET_STATUS' })
    if (!status2?.authenticated) { showNotAuth(); return }
  }

  await showAuth(status)

  // Prüfe ob wir auf einem LinkedIn-Profil sind
  if (tab?.url?.includes('linkedin.com/in/')) {
    detectCurrentProfile()
  }

  // Job-Queue laden
  loadQueue()
}

function showNotAuth() {
  document.getElementById('notAuth').style.display = 'block'
  document.getElementById('authContent').style.display = 'none'
}

async function showAuth(status) {
  document.getElementById('notAuth').style.display = 'none'
  document.getElementById('authContent').style.display = 'block'

  // Profil-Daten aus Supabase laden
  if (status.userId) {
    try {
      const { supabaseSession } = await new Promise(r => chrome.storage.local.get(['supabaseSession'], r))
      const token = supabaseSession?.access_token
      if (token) {
        const res = await fetch(`https://jdhajqpgfrsuoluaesjn.supabase.co/rest/v1/profiles?id=eq.${status.userId}&select=full_name,email,avatar_url&limit=1`, {
          headers: {
            'apikey': 'sb_publishable__KdQsVuSD6WWuswGcViaRw_CxDK8grx',
            'Authorization': 'Bearer ' + token
          }
        })
        const profiles = await res.json()
        const profile = profiles?.[0]
        if (profile) {
          document.getElementById('profileName').textContent = profile.full_name || 'Leadesk User'
          document.getElementById('profileEmail').textContent = profile.email || ''
          const avatar = document.getElementById('profileAvatar')
          if (profile.avatar_url) {
            avatar.innerHTML = `<img src="${profile.avatar_url}" alt="">`
          } else {
            avatar.textContent = (profile.full_name || 'U')[0].toUpperCase()
          }
        }
      }
    } catch(e) { console.log('Profile load error:', e) }
  }

  // Status-Dot
  const syncAge = Date.now() - (status.syncedAt || 0)
  const fresh = syncAge < 10 * 60 * 1000 // 10 Minuten
  document.getElementById('statusDot').className = 'dot ' + (fresh ? 'dot-green' : 'dot-yellow')
  document.getElementById('statusText').textContent = fresh ? 'Verbunden · Automation aktiv' : 'Session veraltet'
  if (!fresh) {
    document.getElementById('statusAction').textContent = 'Neu laden'
    document.getElementById('statusAction').onclick = async () => {
      await sendBg({ type: 'SYNC_SESSION' })
      init()
    }
  }
}

async function detectCurrentProfile() {
  if (!currentTab?.id) return
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: () => {
        const name = document.querySelector('h1.text-heading-xlarge')?.innerText?.trim()
        const headline = document.querySelector('.text-body-medium.break-words')?.innerText?.trim()
        return name ? { name, headline } : null
      }
    })
    const profile = results?.[0]?.result
    if (profile) {
      currentProfile = profile
      document.getElementById('onProfile').style.display = 'block'
      document.getElementById('profileDetectedName').textContent = profile.name + (profile.headline ? ' · ' + profile.headline.substring(0,40) + '...' : '')
    }
  } catch(e) { /* Tab nicht zugänglich */ }
}

async function loadQueue() {
  const result = await sendBg({ type: 'GET_QUEUE_STATUS' })
  const jobs = result?.jobs || []
  
  document.getElementById('queueCount').textContent = jobs.length + (jobs.length === 1 ? ' Job' : ' Jobs')
  
  const list = document.getElementById('jobList')
  if (!jobs.length) {
    list.innerHTML = '<div style="font-size:11px;color:#94A3B8;padding:4px 0;">Keine Jobs in der Warteschlange</div>'
    return
  }

  const typeLabels = {
    visit_profile: { label: 'Besuch', cls: 'job-visit' },
    send_connect:  { label: 'Vernetzen', cls: 'job-connect' },
    send_message:  { label: 'Nachricht', cls: 'job-message' },
    import_profile: { label: 'Import', cls: 'job-import' },
    scrape_connections: { label: 'Scrape', cls: 'job-import' },
  }

  list.innerHTML = jobs.slice(0, 5).map(job => {
    const t = typeLabels[job.type] || { label: job.type, cls: 'job-visit' }
    const when = job.scheduled_at ? new Date(job.scheduled_at).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' }) : ''
    return `
      <div class="job-item">
        <span class="job-type ${t.cls}">${t.label}</span>
        <span class="job-name">${job.type}</span>
        <span class="job-status">${when}</span>
      </div>`
  }).join('')
}

// ── Event Listeners ───────────────────────────────────────────────

// Manueller Session-Sync
document.getElementById('manualSync')?.addEventListener('click', async () => {
  showToast('Lade Session...')
  const ok = await sendBg({ type: 'SYNC_SESSION' })
  if (ok?.success) { showToast('Verbunden! ✓', 'success'); setTimeout(init, 500) }
  else showToast('Öffne app.leadesk.de und melde dich an', 'error')
})

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await sendBg({ type: 'LOGOUT' })
  showToast('Abgemeldet')
  setTimeout(init, 500)
})

// Profil importieren (aktuelles Tab)
document.getElementById('importBtn')?.addEventListener('click', async () => {
  if (!currentTab?.id) return
  document.getElementById('importBtn').textContent = '⏳ Importiere...'
  const result = await sendBg({ type: 'IMPORT_CURRENT_PROFILE' })
  if (result?.success) {
    showToast(`✓ ${result.lead?.first_name || 'Lead'} importiert!`, 'success')
    document.getElementById('importBtn').textContent = '✓ Importiert'
  } else {
    showToast(result?.error || 'Fehler beim Import', 'error')
    document.getElementById('importBtn').textContent = '⬇ Importieren'
  }
})

// Quick Connect
document.getElementById('quickConnectBtn')?.addEventListener('click', async () => {
  // Direkte Vernetzungsanfrage über Content Script
  if (!currentTab?.id) return
  const note = prompt('Vernetzungsnotiz (optional, max. 300 Zeichen):') || ''
  if (note === null) return // Abgebrochen

  showToast('Sende Vernetzungsanfrage...')
  const results = await chrome.scripting.executeScript({
    target: { tabId: currentTab.id },
    func: (message) => {
      return new Promise(async resolve => {
        const connectBtn = Array.from(document.querySelectorAll('button')).find(b =>
          b.innerText?.trim().match(/^Vernetzen|^Connect/i)
        )
        if (!connectBtn) { resolve({ sent: false }); return }
        connectBtn.click()
        await new Promise(r => setTimeout(r, 1500))
        
        if (message) {
          const noteBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText?.match(/Notiz|Add a note/i))
          if (noteBtn) {
            noteBtn.click()
            await new Promise(r => setTimeout(r, 1000))
            const ta = document.querySelector('textarea[name="message"], #custom-message')
            if (ta) { ta.value = message; ta.dispatchEvent(new Event('input', { bubbles: true })) }
          }
        }

        const sendBtn = Array.from(document.querySelectorAll('button')).find(b => 
          b.innerText?.match(/^Senden|^Send/i) || b.getAttribute('aria-label')?.match(/Senden|Send/i)
        )
        if (sendBtn) { sendBtn.click(); resolve({ sent: true }) }
        else resolve({ sent: false })
      })
    },
    args: [note]
  })
  const res = results?.[0]?.result
  if (res?.sent) showToast('✓ Vernetzungsanfrage gesendet!', 'success')
  else showToast('Konnte nicht senden — manuell versuchen', 'error')
})

// Alle Connections importieren
document.getElementById('actionImportAll')?.addEventListener('click', async () => {
  showToast('Job eingereiht: Connections importieren')
  const { supabaseSession, userId } = await new Promise(r => chrome.storage.local.get(['supabaseSession', 'userId'], r))
  if (!userId) { showToast('Nicht angemeldet', 'error'); return }
  
  await fetch('https://jdhajqpgfrsuoluaesjn.supabase.co/rest/v1/automation_jobs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': 'sb_publishable__KdQsVuSD6WWuswGcViaRw_CxDK8grx',
      'Authorization': 'Bearer ' + supabaseSession.access_token,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      user_id: userId,
      type: 'scrape_connections',
      payload: { max_count: 200 },
      priority: 3,
      scheduled_at: new Date().toISOString()
    })
  })
  showToast('✓ Job eingeplant — läuft im Hintergrund', 'success')
  setTimeout(loadQueue, 1000)
})

// Kampagnen-Dashboard öffnen
document.getElementById('actionQueue')?.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://app.leadesk.de/automatisierung' })
})

// Aktuelles Profil als besucht loggen
document.getElementById('actionVisit')?.addEventListener('click', async () => {
  if (!currentTab?.url?.includes('linkedin.com/in/')) {
    showToast('Kein LinkedIn-Profil geöffnet', 'error')
    return
  }
  const { supabaseSession, userId } = await new Promise(r => chrome.storage.local.get(['supabaseSession', 'userId'], r))
  await fetch('https://jdhajqpgfrsuoluaesjn.supabase.co/rest/v1/automation_jobs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': 'sb_publishable__KdQsVuSD6WWuswGcViaRw_CxDK8grx',
      'Authorization': 'Bearer ' + supabaseSession.access_token,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      user_id: userId,
      type: 'visit_profile',
      payload: { linkedin_url: currentTab.url },
      priority: 1,
      scheduled_at: new Date().toISOString()
    })
  })
  showToast('✓ Profil-Besuch eingereiht', 'success')
  setTimeout(loadQueue, 1000)
})

// Einstellungen
document.getElementById('actionSettings')?.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://app.leadesk.de/settings' })
})

// ── Start ─────────────────────────────────────────────────────────
init()
