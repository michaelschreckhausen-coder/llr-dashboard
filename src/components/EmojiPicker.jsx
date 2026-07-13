import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react'
import { Search } from 'lucide-react'

const P = 'var(--wl-primary, #0A6FB0)'

// Kuratiertes, breites Emoji-Set mit deutschen + englischen Such-Keywords.
// Browsing über Kategorien, Volltext-Suche über alle Einträge.
const EMOJIS = [
  // ── Smileys & Emotionen ──
  { c:'😀', cat:'Smileys', k:'grinsen lachen freude happy smiley' },
  { c:'😃', cat:'Smileys', k:'freude happy grinsen' },
  { c:'😄', cat:'Smileys', k:'lachen freude happy' },
  { c:'😁', cat:'Smileys', k:'grinsen zaehne happy' },
  { c:'😆', cat:'Smileys', k:'lachen prusten happy' },
  { c:'😅', cat:'Smileys', k:'lachen schweiss erleichtert' },
  { c:'😂', cat:'Smileys', k:'lachen traenen freude lol' },
  { c:'🤣', cat:'Smileys', k:'lachen rofl boden kringeln' },
  { c:'🙂', cat:'Smileys', k:'laecheln freundlich smile' },
  { c:'🙃', cat:'Smileys', k:'umgedreht ironie' },
  { c:'😉', cat:'Smileys', k:'zwinkern wink flirt' },
  { c:'😊', cat:'Smileys', k:'laecheln froehlich bluesh' },
  { c:'😇', cat:'Smileys', k:'engel heiligenschein unschuldig' },
  { c:'🥰', cat:'Smileys', k:'verliebt herzen liebe' },
  { c:'😍', cat:'Smileys', k:'verliebt herzaugen liebe' },
  { c:'🤩', cat:'Smileys', k:'sterne begeistert wow star' },
  { c:'😘', cat:'Smileys', k:'kuss kussmund liebe' },
  { c:'😋', cat:'Smileys', k:'lecker zunge yummy' },
  { c:'😜', cat:'Smileys', k:'zunge frech zwinkern' },
  { c:'🤪', cat:'Smileys', k:'verrueckt crazy bloed' },
  { c:'🤓', cat:'Smileys', k:'nerd brille streber' },
  { c:'😎', cat:'Smileys', k:'cool sonnenbrille' },
  { c:'🥳', cat:'Smileys', k:'party feiern hut konfetti' },
  { c:'😏', cat:'Smileys', k:'grinsen selbstgefaellig smirk' },
  { c:'😢', cat:'Smileys', k:'weinen traurig traene' },
  { c:'😭', cat:'Smileys', k:'weinen heulen traurig' },
  { c:'😤', cat:'Smileys', k:'wut dampf entschlossen' },
  { c:'😡', cat:'Smileys', k:'wut sauer rot angry' },
  { c:'🤯', cat:'Smileys', k:'kopf explodiert schock mind blown' },
  { c:'😳', cat:'Smileys', k:'schock erroeten verlegen' },
  { c:'🥵', cat:'Smileys', k:'heiss schwitzen hitze' },
  { c:'🥶', cat:'Smileys', k:'kalt frieren eis' },
  { c:'😱', cat:'Smileys', k:'schock angst schrei' },
  { c:'🤔', cat:'Smileys', k:'nachdenken denken hmm' },
  { c:'🤗', cat:'Smileys', k:'umarmung hug' },
  { c:'🤫', cat:'Smileys', k:'pssst leise still' },
  { c:'🙄', cat:'Smileys', k:'augenrollen genervt' },
  { c:'😴', cat:'Smileys', k:'schlafen muede zzz' },
  { c:'🤤', cat:'Smileys', k:'sabbern lecker' },
  { c:'🤮', cat:'Smileys', k:'kotzen uebel ekel' },
  { c:'😷', cat:'Smileys', k:'maske krank' },
  { c:'🤑', cat:'Smileys', k:'geld dollar gierig' },
  { c:'🤠', cat:'Smileys', k:'cowboy hut' },
  { c:'👻', cat:'Smileys', k:'geist gespenst boo' },
  { c:'💀', cat:'Smileys', k:'totenkopf tod skull' },
  { c:'🤡', cat:'Smileys', k:'clown' },
  { c:'👽', cat:'Smileys', k:'alien ausserirdisch' },
  { c:'🤖', cat:'Smileys', k:'roboter robot ki' },
  // ── Gesten & Menschen ──
  { c:'👋', cat:'Gesten', k:'winken hallo tschuess wave' },
  { c:'👍', cat:'Gesten', k:'daumen hoch gut top like' },
  { c:'👎', cat:'Gesten', k:'daumen runter schlecht dislike' },
  { c:'👌', cat:'Gesten', k:'ok perfekt' },
  { c:'🤌', cat:'Gesten', k:'finger italienisch' },
  { c:'✌️', cat:'Gesten', k:'victory frieden peace zwei' },
  { c:'🤞', cat:'Gesten', k:'daumen druecken glueck' },
  { c:'🤟', cat:'Gesten', k:'love you rock' },
  { c:'🤘', cat:'Gesten', k:'rock metal' },
  { c:'🤙', cat:'Gesten', k:'call me shaka' },
  { c:'👈', cat:'Gesten', k:'links zeigen' },
  { c:'👉', cat:'Gesten', k:'rechts zeigen' },
  { c:'👆', cat:'Gesten', k:'hoch zeigen oben' },
  { c:'👇', cat:'Gesten', k:'runter zeigen unten' },
  { c:'☝️', cat:'Gesten', k:'zeigefinger achtung' },
  { c:'✋', cat:'Gesten', k:'hand stopp high five' },
  { c:'🖐️', cat:'Gesten', k:'hand fuenf finger' },
  { c:'🖖', cat:'Gesten', k:'vulkan spock' },
  { c:'👏', cat:'Gesten', k:'klatschen applaus bravo' },
  { c:'🙌', cat:'Gesten', k:'jubel haende hoch hurra' },
  { c:'🙏', cat:'Gesten', k:'danke bitte beten please' },
  { c:'🤝', cat:'Gesten', k:'handschlag deal einig' },
  { c:'💪', cat:'Gesten', k:'muskel stark kraft power' },
  { c:'✍️', cat:'Gesten', k:'schreiben hand' },
  { c:'🤳', cat:'Gesten', k:'selfie' },
  { c:'👀', cat:'Gesten', k:'augen schauen look' },
  { c:'🧠', cat:'Gesten', k:'gehirn denken brain' },
  { c:'👶', cat:'Gesten', k:'baby kind' },
  { c:'🧑', cat:'Gesten', k:'person mensch' },
  { c:'👨', cat:'Gesten', k:'mann' },
  { c:'👩', cat:'Gesten', k:'frau' },
  { c:'🧓', cat:'Gesten', k:'alt senior' },
  // ── Tiere & Natur ──
  { c:'🐶', cat:'Tiere', k:'hund dog' },
  { c:'🐱', cat:'Tiere', k:'katze cat' },
  { c:'🦊', cat:'Tiere', k:'fuchs fox' },
  { c:'🦁', cat:'Tiere', k:'loewe lion' },
  { c:'🐯', cat:'Tiere', k:'tiger' },
  { c:'🐻', cat:'Tiere', k:'baer bear' },
  { c:'🐨', cat:'Tiere', k:'koala' },
  { c:'🐼', cat:'Tiere', k:'panda' },
  { c:'🐸', cat:'Tiere', k:'frosch frog' },
  { c:'🐵', cat:'Tiere', k:'affe monkey' },
  { c:'🐔', cat:'Tiere', k:'huhn chicken' },
  { c:'🦅', cat:'Tiere', k:'adler eagle' },
  { c:'🦉', cat:'Tiere', k:'eule owl' },
  { c:'🦄', cat:'Tiere', k:'einhorn unicorn' },
  { c:'🐝', cat:'Tiere', k:'biene bee' },
  { c:'🦋', cat:'Tiere', k:'schmetterling butterfly' },
  { c:'🐢', cat:'Tiere', k:'schildkroete turtle' },
  { c:'🐍', cat:'Tiere', k:'schlange snake' },
  { c:'🐙', cat:'Tiere', k:'krake octopus' },
  { c:'🐠', cat:'Tiere', k:'fisch fish' },
  { c:'🐬', cat:'Tiere', k:'delfin dolphin' },
  { c:'🐳', cat:'Tiere', k:'wal whale' },
  { c:'🦈', cat:'Tiere', k:'hai shark' },
  { c:'🐘', cat:'Tiere', k:'elefant elephant' },
  { c:'🌵', cat:'Tiere', k:'kaktus cactus' },
  { c:'🌲', cat:'Tiere', k:'baum tanne tree' },
  { c:'🌴', cat:'Tiere', k:'palme palm' },
  { c:'🌱', cat:'Tiere', k:'pflanze setzling wachstum' },
  { c:'🍀', cat:'Tiere', k:'kleeblatt glueck luck' },
  { c:'🌸', cat:'Tiere', k:'bluete kirschbluete blume' },
  { c:'🌹', cat:'Tiere', k:'rose blume' },
  { c:'🌻', cat:'Tiere', k:'sonnenblume blume' },
  { c:'🌞', cat:'Tiere', k:'sonne sun' },
  { c:'🌝', cat:'Tiere', k:'mond moon' },
  { c:'⭐', cat:'Tiere', k:'stern star' },
  { c:'🌟', cat:'Tiere', k:'stern glitzern star' },
  { c:'✨', cat:'Tiere', k:'funkeln glitzer sparkles' },
  { c:'⚡', cat:'Tiere', k:'blitz strom energie' },
  { c:'🔥', cat:'Tiere', k:'feuer flamme hot fire lit' },
  { c:'🌈', cat:'Tiere', k:'regenbogen rainbow' },
  { c:'☀️', cat:'Tiere', k:'sonne wetter' },
  { c:'☁️', cat:'Tiere', k:'wolke wetter' },
  { c:'❄️', cat:'Tiere', k:'schnee flocke winter' },
  { c:'💧', cat:'Tiere', k:'tropfen wasser' },
  { c:'🌊', cat:'Tiere', k:'welle wasser meer' },
  // ── Essen & Trinken ──
  { c:'🍎', cat:'Essen', k:'apfel apple obst' },
  { c:'🍌', cat:'Essen', k:'banane banana' },
  { c:'🍉', cat:'Essen', k:'melone wassermelone' },
  { c:'🍓', cat:'Essen', k:'erdbeere strawberry' },
  { c:'🍇', cat:'Essen', k:'trauben grapes' },
  { c:'🍒', cat:'Essen', k:'kirsche cherry' },
  { c:'🍑', cat:'Essen', k:'pfirsich peach po' },
  { c:'🥑', cat:'Essen', k:'avocado' },
  { c:'🍅', cat:'Essen', k:'tomate tomato' },
  { c:'🌽', cat:'Essen', k:'mais corn' },
  { c:'🥕', cat:'Essen', k:'karotte moehre carrot' },
  { c:'🍔', cat:'Essen', k:'burger hamburger' },
  { c:'🍟', cat:'Essen', k:'pommes fries' },
  { c:'🍕', cat:'Essen', k:'pizza' },
  { c:'🌮', cat:'Essen', k:'taco' },
  { c:'🍣', cat:'Essen', k:'sushi' },
  { c:'🍜', cat:'Essen', k:'nudeln ramen suppe' },
  { c:'🍝', cat:'Essen', k:'pasta spaghetti' },
  { c:'🍞', cat:'Essen', k:'brot bread' },
  { c:'🧀', cat:'Essen', k:'kaese cheese' },
  { c:'🍩', cat:'Essen', k:'donut' },
  { c:'🍪', cat:'Essen', k:'keks cookie' },
  { c:'🍫', cat:'Essen', k:'schokolade chocolate' },
  { c:'🍰', cat:'Essen', k:'kuchen torte cake' },
  { c:'🎂', cat:'Essen', k:'geburtstag torte cake' },
  { c:'🍦', cat:'Essen', k:'eis ice cream' },
  { c:'🍿', cat:'Essen', k:'popcorn' },
  { c:'☕', cat:'Essen', k:'kaffee coffee tee' },
  { c:'🍵', cat:'Essen', k:'tee tea matcha' },
  { c:'🍺', cat:'Essen', k:'bier beer' },
  { c:'🍻', cat:'Essen', k:'prost bier cheers' },
  { c:'🥂', cat:'Essen', k:'prost sekt champagner cheers' },
  { c:'🍷', cat:'Essen', k:'wein wine' },
  { c:'🥤', cat:'Essen', k:'getraenk softdrink' },
  // ── Aktivität & Reisen ──
  { c:'⚽', cat:'Reisen', k:'fussball soccer ball' },
  { c:'🏀', cat:'Reisen', k:'basketball' },
  { c:'🏈', cat:'Reisen', k:'football' },
  { c:'🎾', cat:'Reisen', k:'tennis' },
  { c:'🏐', cat:'Reisen', k:'volleyball' },
  { c:'🥅', cat:'Reisen', k:'tor goal' },
  { c:'⛳', cat:'Reisen', k:'golf' },
  { c:'🏆', cat:'Reisen', k:'pokal trophy sieg gewinner' },
  { c:'🥇', cat:'Reisen', k:'gold medaille erster' },
  { c:'🎯', cat:'Reisen', k:'ziel target dart treffer' },
  { c:'🎲', cat:'Reisen', k:'wuerfel dice zufall' },
  { c:'🎮', cat:'Reisen', k:'gaming controller spiel' },
  { c:'🎨', cat:'Reisen', k:'kunst malen palette' },
  { c:'🎬', cat:'Reisen', k:'film klappe movie' },
  { c:'🎤', cat:'Reisen', k:'mikrofon singen mic' },
  { c:'🎧', cat:'Reisen', k:'kopfhoerer musik' },
  { c:'🎵', cat:'Reisen', k:'musik note song' },
  { c:'🚗', cat:'Reisen', k:'auto car' },
  { c:'🚕', cat:'Reisen', k:'taxi' },
  { c:'🚌', cat:'Reisen', k:'bus' },
  { c:'🚓', cat:'Reisen', k:'polizei police' },
  { c:'🚑', cat:'Reisen', k:'krankenwagen ambulance' },
  { c:'🚀', cat:'Reisen', k:'rakete rocket start launch' },
  { c:'✈️', cat:'Reisen', k:'flugzeug reisen plane flight' },
  { c:'🚁', cat:'Reisen', k:'helikopter hubschrauber' },
  { c:'⛵', cat:'Reisen', k:'segelboot boot sail' },
  { c:'🚢', cat:'Reisen', k:'schiff ship' },
  { c:'🚲', cat:'Reisen', k:'fahrrad bike' },
  { c:'🗺️', cat:'Reisen', k:'karte map reisen' },
  { c:'🏔️', cat:'Reisen', k:'berg gipfel mountain' },
  { c:'🏖️', cat:'Reisen', k:'strand beach urlaub' },
  { c:'🏕️', cat:'Reisen', k:'camping zelt' },
  { c:'🏠', cat:'Reisen', k:'haus zuhause home' },
  { c:'🏢', cat:'Reisen', k:'buero gebaeude office' },
  { c:'🎉', cat:'Reisen', k:'party konfetti feiern tada' },
  { c:'🎊', cat:'Reisen', k:'konfetti party' },
  { c:'🎁', cat:'Reisen', k:'geschenk present gift' },
  // ── Objekte ──
  { c:'💡', cat:'Objekte', k:'idee gluehbirne licht idea' },
  { c:'🔦', cat:'Objekte', k:'taschenlampe licht' },
  { c:'📱', cat:'Objekte', k:'handy smartphone phone' },
  { c:'💻', cat:'Objekte', k:'laptop computer' },
  { c:'🖥️', cat:'Objekte', k:'monitor computer pc' },
  { c:'⌨️', cat:'Objekte', k:'tastatur keyboard' },
  { c:'🖱️', cat:'Objekte', k:'maus mouse' },
  { c:'📷', cat:'Objekte', k:'kamera foto camera' },
  { c:'📹', cat:'Objekte', k:'videokamera video' },
  { c:'📺', cat:'Objekte', k:'fernseher tv' },
  { c:'📞', cat:'Objekte', k:'telefon anruf phone call' },
  { c:'🔋', cat:'Objekte', k:'batterie akku' },
  { c:'💰', cat:'Objekte', k:'geld geldsack money' },
  { c:'💵', cat:'Objekte', k:'geld dollar cash' },
  { c:'💳', cat:'Objekte', k:'kreditkarte karte card' },
  { c:'💎', cat:'Objekte', k:'diamant edelstein gem' },
  { c:'⚖️', cat:'Objekte', k:'waage gerecht recht balance' },
  { c:'🔧', cat:'Objekte', k:'schraubenschluessel werkzeug tool' },
  { c:'🔨', cat:'Objekte', k:'hammer werkzeug' },
  { c:'⚙️', cat:'Objekte', k:'zahnrad einstellung settings gear' },
  { c:'🔒', cat:'Objekte', k:'schloss sicher lock' },
  { c:'🔑', cat:'Objekte', k:'schluessel key' },
  { c:'📌', cat:'Objekte', k:'pin pinnnadel markieren' },
  { c:'📎', cat:'Objekte', k:'bueroklammer anhang clip' },
  { c:'✂️', cat:'Objekte', k:'schere cut scissors' },
  { c:'📝', cat:'Objekte', k:'notiz schreiben memo' },
  { c:'✏️', cat:'Objekte', k:'bleistift schreiben pencil' },
  { c:'📚', cat:'Objekte', k:'buecher lernen books' },
  { c:'📖', cat:'Objekte', k:'buch lesen book' },
  { c:'📅', cat:'Objekte', k:'kalender termin date' },
  { c:'📊', cat:'Objekte', k:'diagramm balken statistik chart' },
  { c:'📈', cat:'Objekte', k:'wachstum hoch trend up graph' },
  { c:'📉', cat:'Objekte', k:'sinken runter trend down' },
  { c:'📢', cat:'Objekte', k:'megafon ankuendigung lautsprecher' },
  { c:'📣', cat:'Objekte', k:'megafon laut' },
  { c:'✉️', cat:'Objekte', k:'brief email mail' },
  { c:'📧', cat:'Objekte', k:'email mail' },
  { c:'🔍', cat:'Objekte', k:'lupe suche search' },
  { c:'⏰', cat:'Objekte', k:'wecker uhr zeit alarm' },
  { c:'⏳', cat:'Objekte', k:'sanduhr zeit warten' },
  // ── Symbole ──
  { c:'❤️', cat:'Symbole', k:'herz liebe rot love heart' },
  { c:'🧡', cat:'Symbole', k:'herz orange' },
  { c:'💛', cat:'Symbole', k:'herz gelb' },
  { c:'💚', cat:'Symbole', k:'herz gruen' },
  { c:'💙', cat:'Symbole', k:'herz blau' },
  { c:'💜', cat:'Symbole', k:'herz lila' },
  { c:'🖤', cat:'Symbole', k:'herz schwarz' },
  { c:'🤍', cat:'Symbole', k:'herz weiss' },
  { c:'💔', cat:'Symbole', k:'herz gebrochen broken' },
  { c:'💕', cat:'Symbole', k:'herzen liebe' },
  { c:'💯', cat:'Symbole', k:'hundert prozent perfekt 100' },
  { c:'✅', cat:'Symbole', k:'haken check erledigt gruen' },
  { c:'☑️', cat:'Symbole', k:'haken checkbox' },
  { c:'✔️', cat:'Symbole', k:'haken check' },
  { c:'❌', cat:'Symbole', k:'kreuz falsch x nein' },
  { c:'❗', cat:'Symbole', k:'ausrufezeichen wichtig' },
  { c:'❓', cat:'Symbole', k:'fragezeichen frage' },
  { c:'⚠️', cat:'Symbole', k:'warnung achtung' },
  { c:'🚫', cat:'Symbole', k:'verboten stopp no' },
  { c:'💢', cat:'Symbole', k:'wut zornig' },
  { c:'💬', cat:'Symbole', k:'sprechblase chat kommentar' },
  { c:'💭', cat:'Symbole', k:'gedanke denkblase' },
  { c:'🔔', cat:'Symbole', k:'glocke benachrichtigung bell' },
  { c:'➡️', cat:'Symbole', k:'pfeil rechts arrow' },
  { c:'⬅️', cat:'Symbole', k:'pfeil links arrow' },
  { c:'⬆️', cat:'Symbole', k:'pfeil hoch arrow' },
  { c:'⬇️', cat:'Symbole', k:'pfeil runter arrow' },
  { c:'🔄', cat:'Symbole', k:'wiederholen refresh sync' },
  { c:'➕', cat:'Symbole', k:'plus hinzufuegen' },
  { c:'➖', cat:'Symbole', k:'minus' },
  { c:'❣️', cat:'Symbole', k:'herz ausruf' },
  { c:'⭕', cat:'Symbole', k:'kreis rot' },
  { c:'🔴', cat:'Symbole', k:'punkt rot kreis' },
  { c:'🟢', cat:'Symbole', k:'punkt gruen kreis' },
  { c:'🔵', cat:'Symbole', k:'punkt blau kreis' },
  { c:'⚫', cat:'Symbole', k:'punkt schwarz' },
  { c:'🏁', cat:'Symbole', k:'ziel flagge finish' },
  { c:'🚩', cat:'Symbole', k:'flagge markierung flag' },
  { c:'♻️', cat:'Symbole', k:'recycling nachhaltig' },
  { c:'🆕', cat:'Symbole', k:'neu new' },
  { c:'🆓', cat:'Symbole', k:'gratis kostenlos free' },
]

const CATS = [
  { id:'Smileys', icon:'😀', label:'Smileys & Emotionen' },
  { id:'Gesten',  icon:'👍', label:'Gesten & Menschen' },
  { id:'Tiere',   icon:'🐶', label:'Tiere & Natur' },
  { id:'Essen',   icon:'🍎', label:'Essen & Trinken' },
  { id:'Reisen',  icon:'✈️', label:'Aktivität & Reisen' },
  { id:'Objekte', icon:'💡', label:'Objekte' },
  { id:'Symbole', icon:'❤️', label:'Symbole' },
]

export default function EmojiPicker({ onPick, onClose }) {
  const [query, setQuery] = useState('')
  const [activeCat, setActiveCat] = useState('Smileys')
  const inputRef = useRef(null)
  const popRef = useRef(null)
  const [pos, setPos] = useState(null)
  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 40); return () => clearTimeout(t) }, [])
  // Popover als position:fixed positionieren → entkommt overflow:hidden der Vorfahren.
  useLayoutEffect(() => {
    const el = popRef.current; if (!el) return
    const btn = el.parentElement && el.parentElement.querySelector('button')
    const r = btn ? btn.getBoundingClientRect() : { left: 20, top: 60, bottom: 90 }
    const W = 312, H = el.offsetHeight || 340
    const winH = window.innerHeight, winW = window.innerWidth
    let top = r.bottom + 6
    if (top + H > winH - 8) top = Math.max(8, r.top - 6 - H)  // nach oben klappen
    let left = Math.min(r.left, winW - 8 - W)
    setPos({ top, left: Math.max(8, left) })
  }, [])

  const q = query.trim().toLowerCase()
  const list = useMemo(() => {
    if (q) return EMOJIS.filter(e => e.c === query || e.k.includes(q) || e.cat.toLowerCase().includes(q))
    return EMOJIS.filter(e => e.cat === activeCat)
  }, [q, query, activeCat])

  return (
    <>
      <div onMouseDown={(e) => { e.preventDefault(); onClose && onClose() }} style={{ position:'fixed', inset:0, zIndex:80 }}/>
      <div ref={popRef} onMouseDown={e => { if (e.target.tagName !== 'INPUT') e.preventDefault() }}
        style={{ position:'fixed', top: pos ? pos.top : -9999, left: pos ? pos.left : -9999, visibility: pos ? 'visible' : 'hidden', zIndex:1000, width:312, background:'#fff',
                 border:'1px solid var(--border,#E6E9EF)', borderRadius:12, boxShadow:'0 12px 34px rgba(16,24,40,0.16)', padding:8 }}>
        {/* Suche */}
        <div style={{ display:'flex', alignItems:'center', gap:6, background:'#F4F6FA', borderRadius:9, padding:'6px 10px', marginBottom:6 }}>
          <Search size={14} style={{ color:'var(--text-soft,#98a2b3)', flexShrink:0 }}/>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') onClose && onClose() }}
            placeholder={'Emoji suchen \u2026 z. B. herz, rakete, daumen'}
            style={{ flex:1, minWidth:0, border:'none', outline:'none', background:'transparent', fontSize:13, fontFamily:'inherit', color:'var(--text-primary)' }}/>
        </div>

        {/* Kategorie-Tabs (nur ohne Suche) */}
        {!q && (
          <div style={{ display:'flex', gap:2, marginBottom:6, borderBottom:'1px solid var(--border,#EEF1F6)', paddingBottom:6 }}>
            {CATS.map(cat => (
              <button key={cat.id} title={cat.label} onClick={() => setActiveCat(cat.id)}
                style={{ flex:1, height:30, border:'none', borderRadius:7, cursor:'pointer', fontSize:16, lineHeight:1,
                         background: activeCat === cat.id ? 'rgba(10,111,176,0.10)' : 'transparent' }}
                onMouseEnter={e => { if (activeCat !== cat.id) e.currentTarget.style.background = '#F4F6FA' }}
                onMouseLeave={e => { if (activeCat !== cat.id) e.currentTarget.style.background = 'transparent' }}>
                {cat.icon}
              </button>
            ))}
          </div>
        )}

        {/* Grid */}
        <div style={{ maxHeight:220, overflowY:'auto', display:'grid', gridTemplateColumns:'repeat(8, 1fr)', gap:1 }}>
          {list.length === 0 ? (
            <div style={{ gridColumn:'1 / -1', padding:'18px 8px', textAlign:'center', fontSize:12.5, color:'var(--text-muted,#667085)' }}>
              Kein Emoji gefunden.
            </div>
          ) : list.map((e, i) => (
            <button key={e.c + i} title={e.k.split(' ')[0]}
              onMouseDown={ev => ev.preventDefault()}
              onClick={() => onPick && onPick(e.c)}
              style={{ height:32, border:'none', background:'transparent', borderRadius:7, cursor:'pointer', fontSize:19, lineHeight:1, padding:0 }}
              onMouseEnter={ev => ev.currentTarget.style.background = '#F1F3F7'}
              onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
              {e.c}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
