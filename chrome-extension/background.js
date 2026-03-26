// Lead Radar — Background Service Worker (v5)
// Strategie: Profil ins Chrome Storage → Dashboard neu laden → beim Mount lesen

const DASHBOARD = 'https://llr-dashboard.vercel.app/vernetzungen';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'IMPORT_PROFILE') return;
  const profile = msg.profile;

  // Profil speichern
  chrome.storage.local.set({ llr_profile: profile, llr_ts: Date.now() }, () => {

    chrome.tabs.query({}, (tabs) => {
      const dashTab = tabs.find(t => t.url && t.url.startsWith('https://llr-dashboard.vercel.app'));

      if (dashTab) {
        // Dashboard ist offen: Tab fokussieren und neu laden
        chrome.tabs.update(dashTab.id, { active: true });
        chrome.windows.update(dashTab.windowId, { focused: true });
        // Neu laden damit React neu mountet und Storage liest
        chrome.tabs.reload(dashTab.id);
      } else {
        // Neu öffnen
        chrome.tabs.create({ url: DASHBOARD });
      }
    });
  });

  sendResponse({ ok: true });
  return true;
});

// Wenn Dashboard fertig geladen: Profil aus Storage injizieren via postMessage
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== 'complete') return;
  if (!tab.url || !tab.url.startsWith('https://llr-dashboard.vercel.app')) return;

  chrome.storage.local.get(['llr_profile', 'llr_ts'], (data) => {
    if (!data.llr_profile) return;
    if (Date.now() - (data.llr_ts || 0) > 300000) {
      chrome.storage.local.remove(['llr_profile', 'llr_ts']);
      return;
    }
    const profile = data.llr_profile;

    // Nach dem Laden React Zeit geben, dann postMessage injizieren
    [1500, 3000].forEach(delay => {
      setTimeout(() => {
        chrome.scripting.executeScript({
          target: { tabId },
          func: (p) => {
            window.postMessage({ type: 'LLR_IMPORT', profile: p }, '*');
          },
          args: [profile]
        }).then(() => {
          chrome.storage.local.remove(['llr_profile', 'llr_ts']);
        }).catch(() => {});
      }, delay);
    });
  });
});
