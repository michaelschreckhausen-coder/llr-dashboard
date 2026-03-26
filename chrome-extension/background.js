// Lead Radar — Background Service Worker

const DASHBOARD = 'https://llr-dashboard.vercel.app/vernetzungen';

// Profil-Import vom Popup empfangen
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'IMPORT_PROFILE') {
    const profile = msg.profile;

    // Profil im Storage speichern — Dashboard liest es selbst beim Start
    chrome.storage.local.set({ llr_profile: profile, llr_ts: Date.now() }, () => {

      chrome.tabs.query({ url: 'https://llr-dashboard.vercel.app/*' }, (tabs) => {
        if (tabs.length > 0) {
          // Dashboard bereits offen — fokussieren und mehrfach versuchen zu senden
          const tabId = tabs[0].id;
          chrome.tabs.update(tabId, { active: true });
          chrome.windows.update(tabs[0].windowId, { focused: true });

          // Mehrere Versuche mit wachsendem Delay
          [500, 1500, 3000, 5000].forEach(delay => {
            setTimeout(() => {
              chrome.tabs.sendMessage(tabId, { type: 'LLR_IMPORT', profile }, () => {
                if (!chrome.runtime.lastError) {
                  // Erfolgreich gesendet — aus Storage entfernen
                  chrome.storage.local.remove(['llr_profile', 'llr_ts']);
                }
              });
            }, delay);
          });
        } else {
          // Dashboard neu öffnen — tabs.onUpdated holt das Profil aus dem Storage
          chrome.tabs.create({ url: DASHBOARD });
        }
      });
    });

    sendResponse({ ok: true });
  }
  return true;
});

// Wenn Dashboard-Tab fertig geladen: Profil aus Storage injizieren
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== 'complete') return;
  if (!tab.url || !tab.url.startsWith('https://llr-dashboard.vercel.app')) return;

  chrome.storage.local.get(['llr_profile', 'llr_ts'], (data) => {
    if (!data.llr_profile) return;
    if (Date.now() - (data.llr_ts || 0) > 300000) {
      chrome.storage.local.remove(['llr_profile', 'llr_ts']);
      return;
    }

    // React braucht Zeit zum Laden — mehrfach versuchen
    [1500, 3000, 5000].forEach(delay => {
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, { type: 'LLR_IMPORT', profile: data.llr_profile }, () => {
          if (!chrome.runtime.lastError) {
            chrome.storage.local.remove(['llr_profile', 'llr_ts']);
          }
        });
      }, delay);
    });
  });
});
