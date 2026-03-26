// LinkedIn Lead Radar — Content Script
// Liest LinkedIn-Profildaten aus dem DOM

(function() {
  'use strict';

  function get(sel, ctx) {
    const el = (ctx||document).querySelector(sel);
    return el ? el.textContent.trim().replace(/\s+/g,' ') : '';
  }
  function getAny(sels, ctx) {
    for (const s of sels) { const t = get(s,ctx); if (t) return t; }
    return '';
  }

  function extractProfile() {
    const p = {};

    p.li_name = getAny([
      'h1.text-heading-xlarge',
      '.top-card-layout__title',
      'h1'
    ]);

    p.li_headline = getAny([
      '.text-body-medium.break-words',
      '.top-card-layout__headline',
      '.pv-top-card .ph5 .text-body-medium'
    ]);

    p.li_location = getAny([
      '.text-body-small.inline.t-black--light.break-words',
      '.top-card-layout__first-subline span',
      '.pv-top-card--list-bullet span[aria-hidden]'
    ]);

    p.li_company = '';
    const exp = document.querySelector('#experience');
    if (exp) {
      const sec = exp.closest('section') || exp.parentElement;
      if (sec) p.li_company = get('.hoverable-link-text .t-bold span[aria-hidden]', sec) || get('.t-bold span[aria-hidden]', sec) || '';
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
        const els = sec.querySelectorAll('.hoverable-link-text span[aria-hidden="true"], .t-bold span[aria-hidden="true"]');
        p.li_skills = Array.from(els).map(e=>e.textContent.trim()).filter(s=>s.length>1&&s.length<60).slice(0,10);
      }
    }

    p.li_url = window.location.href.split('?')[0];
    const img = document.querySelector('.pv-top-card-profile-picture__image, img.profile-photo-edit__preview');
    p.li_avatar_url = img ? img.src : '';

    return p;
  }

  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg.type === 'GET_PROFILE') {
      try {
        const profile = extractProfile();
        // Toast anzeigen
        const t = document.createElement('div');
        t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#0A66C2;color:#fff;padding:12px 20px;border-radius:10px;font-family:-apple-system,sans-serif;font-size:14px;font-weight:700;z-index:999999;box-shadow:0 4px 20px rgba(0,0,0,.25)';
        t.textContent = '\uD83C\uDFAF ' + (profile.li_name||'Profil') + ' wird importiert...';
        document.body.appendChild(t);
        setTimeout(()=>t.remove(), 3000);
        sendResponse({ success:true, profile });
      } catch(e) {
        sendResponse({ success:false, error:e.message });
      }
    }
    return true;
  });

  console.log('[Lead Radar] bereit auf:', window.location.href);
})();
