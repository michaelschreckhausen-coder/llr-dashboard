// Leadesk Extension Options — Model-Preference-Persistence
//
// chrome.storage.local.ai_model_preference wird vom sidepanel.js beim
// generate-Call gelesen. Leerer String / unset = EF nimmt account-default
// (siehe profiles.default_ai_model bzw. Account-Plan).

const select = document.getElementById('modelSelect')
const saveBtn = document.getElementById('saveBtn')
const saveStatus = document.getElementById('saveStatus')

// Initial-Load: existing Preference in Select setzen
chrome.storage.local.get(['ai_model_preference'], data => {
  const current = data.ai_model_preference || ''
  // Option mit value=current setzen (oder fallback auf erste "Standard"-Option)
  const option = Array.from(select.options).find(o => o.value === current)
  if (option) {
    select.value = current
  } else {
    select.value = ''  // Standard
  }
})

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true
  const value = select.value || ''
  await new Promise(r => chrome.storage.local.set({ ai_model_preference: value }, r))
  saveStatus.classList.add('visible')
  setTimeout(() => {
    saveStatus.classList.remove('visible')
    saveBtn.disabled = false
  }, 1800)
})
