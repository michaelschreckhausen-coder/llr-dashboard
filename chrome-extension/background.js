// Lead Radar — Background Service Worker

const DASHBOARD = 'https://llr-dashboard.vercel.app/vernetzungen';

// Nachricht vom Popup empfangen und Profil ans Dashboard weitergeben
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'IMPORT_PROFILE') {
    const profile = msg.profile;

    // Im Storage zwischenspeichern
    chrome.storage.local.set({ llr_profile: profile, llr_ts: Date.now() }, () => {
      // Dashboard-Tab suchen oder öffnen
      chrome.tabs.query({ url: DASHBOARD + '*' }, (tabs) => {
        if (tabs.length > 0) {
          // Bestehender Tab: fokussieren und Nachricht senden
          chrome.tabs.update(tabs[0].id, { active: true });
          chrome.windows.update(tabs[0].windowId, { focused: true });
          setTimeout(() => {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'LLR_IMPORT', profile });
          }, 300);
        } else {
          // Neuen Tab öffnen
          chrome.tabs.create({ url: DASHBOARD });
        }
      });
    });
    sendResponse({ ok: true });
  }
  return true;
});

// Wenn Dashboard-Tab geladen wird: gespeichertes Profil injizieren
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== 'complete') return;
  if (!tab.url || !tab.url.startsWith('https://llr-dashboard.vercel.app')) return;

  chrome.storage.local.get(['llr_profile', 'llr_ts'], (data) => {
    if (!data.llr_profile) return;
    // Nur wenn jünger als 5 Minuten
    if (Date.now() - (data.llr_ts || 0) > 300000) {
      chrome.storage.local.remove(['llr_profile', 'llr_ts']);
      return;
    }
    // Kurz warten bis React geladen ist
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, { type: 'LLR_IMPORT', profile: data.llr_profile }, () => {
        if (chrome.runtime.lastError) return; // Tab noch nicht bereit
        chrome.storage.local.remove(['llr_profile', 'llr_ts']);
      });
    }, 2000);
  });
});
