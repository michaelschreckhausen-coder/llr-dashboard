import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const VARIANTS = [
  { id: 'professional',  label: 'Professionell',      desc: 'Klar, serioes, vertrauenswuerdig' },
  { id: 'storytelling',  label: 'Story-driven',        desc: 'Persoenlich, emotional, inspirierend' },
  { id: 'results',       label: 'Ergebnisorientiert',  desc: 'Zahlen, Fakten, Erfolge' },
  { id: 'thought_leader',label: 'Thought Leader',      desc: 'Vision, Meinung, Expertise' },
]

const LENGTHS = [
  { id: 'short',  label: 'Kurz',  desc: '~300 Zeichen' },
  { id: 'medium', label: 'Mittel',desc: '~900 Zeichen' },
  { id: 'long',   label: 'Lang',  desc: '~2000 Zeichen' },
]

const FOCUS_AREAS = [
  'Expertise & Skills', 'Karriereweg', 'Mehrwert fuer Kunden', 'Persoenlichkeit',
  'Mission & Vision', 'Erfolge & Projekte', 'Netzwerk-Einladung', 'Aktuelles Angebot',
]

export default function LinkedInAbout({ session, sub }) {
  const [profile, setProfile] = useState(null)
  const [brandVoices, setBrandVoices] = useState([])
  const [activeBrand, setActiveBrand] = useState(null)
  const [loading, setLoading] = useState(true)
  const [variant, setVariant] = useState('professional')
  const [length, setLength] = useState('medium')
  const [focusAreas, setFocusAreas] = useState(['Expertise & Skills', 'Mehrwert fuer Kunden'])
  const [extraInfo, setExtraInfo] = useState('')
  const [language, setLanguage] = useState('de')
  const [selectedBrand, setSelectedBrand] = useState('auto')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState('')
  const [history, setHistory] = useState([])
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(function() { loadData() }, [])

  async function loadData() {
    setLoading(true)
    var profRes = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    var bvRes = await supabase.from('brand_voices').select('*').eq('user_id', session.user.id).order('updated_at', { ascending: false })
    var prof = profRes.data
    var bvList = bvRes.data || []
    setProfile(prof)
    setBrandVoices(bvList)
    var active = bvList.find(function(v) { return v.is_active }) || bvList[0] || null
    setActiveBrand(active)
    setLoading(false)
  }

  function toggleFocus(area) {
    setFocusAreas(function(prev) {
      if (prev.includes(area)) return prev.filter(function(a) { return a !== area })
      return prev.concat([area])
    })
  }

  var brandForGen = null
  if (selectedBrand === 'auto') brandForGen = activeBrand
  else if (selectedBrand !== 'none') brandForGen = brandVoices.find(function(b) { return b.id === selectedBrand }) || null

  async function generate() {
    setGenerating(true)
    setError('')
    var lengthMap = { short: '250-350', medium: '800-1000', long: '1800-2100' }
    var variantLabel = ''
    VARIANTS.forEach(function(v) { if (v.id === variant) variantLabel = v.label })
    var parts = [
      'Schreibe den LinkedIn Info-Bereich fuer folgende Person.', '',
      '## PROFILDATEN',
    ]
    if (profile && profile.full_name) parts.push('Name: ' + profile.full_name)
    if (profile && profile.headline)  parts.push('Position: ' + profile.headline)
    if (profile && profile.company)   parts.push('Unternehmen: ' + profile.company)
    if (profile && profile.bio)       parts.push('Bio: ' + profile.bio)
    parts.push('')
    parts.push('## ANFORDERUNGEN')
    parts.push('Stil: ' + variantLabel)
    parts.push('Laenge: ' + (lengthMap[length] || '800-1000') + ' Zeichen')
    parts.push('Sprache: ' + (language === 'de' ? 'Deutsch' : 'Englisch'))
    parts.push('Fokus: ' + focusAreas.join(', '))
    if (extraInfo) parts.push('Zusatzinfos: ' + extraInfo)
    if (brandForGen) {
      parts.push('')
      parts.push('## BRAND VOICE')
      if (brandForGen.brand_name)   parts.push('Marke: ' + brandForGen.brand_name)
      if (brandForGen.personality)  parts.push('Persoenlichkeit: ' + brandForGen.personality)
      if (brandForGen.tone_attributes && brandForGen.tone_attributes.length)
        parts.push('Ton: ' + brandForGen.tone_attributes.join(', '))
      if (brandForGen.formality === 'du') parts.push('Ansprache: Du-Form')
      if (brandForGen.dos)          parts.push('Dos: ' + brandForGen.dos)
      if (brandForGen.donts)        parts.push('Donts: ' + brandForGen.donts)
      if (brandForGen.ai_summary)   parts.push('Brand Summary: ' + brandForGen.ai_summary)
    }
    parts.push('')
    parts.push('## FORMAT')
    parts.push('Nur den fertigen Text, ohne Kommentar.')
    parts.push('Erste 2 Zeilen muessen fesseln.')
    parts.push('Zeilenumbrueche fuer Lesbarkeit nutzen.')
    var prompt = parts.filter(function(p) { return !!p }).join('\n')
    try {
      var sessionRes = await supabase.auth.getSession()
      var ss = sessionRes.data.session
      var res = await fetch('https://jdhajqpgfrsuoluaesjn.supabase.co/functions/v1/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ss.access_token },
        body: JSON.stringify({ type: 'linkedin_about', prompt: prompt })
      })
      var data = await res.json()
      var text = data.comment || data.summary || data.text || data.about || ''
      if (text) {
        setResult(text)
        setHistory(function(prev) {
          return [{ text: text, variant: variant, length: length, ts: new Date() }].concat(prev.slice(0, 3))
        })
      } else {
        setError('Keine Antwort vom KI-Service erhalten.')
      }
    } catch (e) {
      setError('Fehler: ' + e.message)
    }
    setGenerating(false)
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(result)
    } catch (e) {
      var ta = document.createElement('textarea')
      ta.value = result
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(function() { setCopied(false) }, 2500)
  }

  var charCount = result.length
  var charMax   = 2600
  var charOver  = charCount > charMax
  var charWarn  = charCount > (charMax * 0.9)

  if (loading) {
    return React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#94A3B8', fontSize: 14 }
    }, 'Lade Profildaten...')
  }

  var cardStyle = {
    background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0',
    overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,0.06)', marginBottom: 14
  }
  var cardHeaderStyle = { padding: '13px 18px', borderBottom: '1px solid #F1F5F9' }
  var cardBodyStyle   = { padding: '16px 18px' }
  var labelStyle = {
    fontSize: 11, fontWeight: 700, color: '#64748B',
    textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7, display: 'block'
  }

  function makeOptBtn(active, onClick, main, sub) {
    return React.createElement('button', {
      onClick: onClick,
      style: {
        padding: '9px 12px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
        width: '100%', display: 'block',
        border: '1.5px solid ' + (active ? 'rgb(49,90,231)' : '#E5E7EB'),
        background: active ? 'rgba(49,90,231,0.08)' : 'rgb(238,241,252)',
        transition: 'all 0.15s', marginBottom: 6
      }
    },
      React.createElement('div', { style: { fontSize: 12, fontWeight: 700, color: active ? 'rgb(49,90,231)' : 'rgb(20,20,43)' } }, main),
      sub ? React.createElement('div', { style: { fontSize: 10, color: '#94A3B8', marginTop: 2 } }, sub) : null
    )
  }

  /* ─── FIX: Brand Voice radio item ─── */
  function makeBrandRadio(value, isChecked, mainText, subText) {
    return React.createElement('label', {
      style: {
        display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px',
        borderRadius: 9, cursor: 'pointer', width: '100%', boxSizing: 'border-box',
        /* FIX: overflow auf dem label-Container entfernt — kein clip mehr */
        border: '1.5px solid ' + (isChecked ? 'rgb(49,90,231)' : '#E5E7EB'),
        background: isChecked ? 'rgba(49,90,231,0.08)' : 'rgb(238,241,252)'
      }
    },
      /* FIX: flexShrink korrekt im style-Objekt */
      React.createElement('input', {
        type: 'radio', name: 'brand', value: value,
        checked: isChecked,
        onChange: function() { setSelectedBrand(value) },
        style: { accentColor: 'rgb(49,90,231)', flexShrink: 0, width: 'auto', cursor: 'pointer' }
      }),
      /* FIX: flex:1 + minWidth:0 + textOverflow auf Texten */
      React.createElement('div', { style: { flex: 1, minWidth: 0 } },
        React.createElement('div', {
          style: {
            fontSize: 12, fontWeight: 700,
            color: isChecked ? 'rgb(49,90,231)' : 'rgb(20,20,43)',
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis'
          }
        }, mainText),
        subText ? React.createElement('div', {
          style: {
            fontSize: 11, color: '#94A3B8', marginTop: 2,
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis'
          }
        }, subText) : null
      )
    )
  }

  return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100 } },

    /* ── Header ── */
    React.createElement('div', {
      style: {
        background: 'linear-gradient(135deg, rgb(49,90,231), rgb(49,90,231))', borderRadius: 16,
        padding: '22px 28px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', boxShadow: '0 4px 20px rgba(10,102,194,0.25)'
      }
    },
      React.createElement('div', null,
        React.createElement('div', { style: { fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', marginBottom: 4 } },
          'LinkedIn Info-Bereich schreiben'),
        React.createElement('div', { style: { fontSize: 13, color: 'rgba(255,255,255,0.8)' } },
          'KI generiert deinen About-Text aus Profil und Brand Voice')
      ),
      profile && profile.full_name ? React.createElement('div', {
        style: {
          background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px 16px',
          border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0
        }
      },
        React.createElement('div', { style: { fontSize: 13, fontWeight: 700, color: '#fff' } }, profile.full_name),
        profile.headline ? React.createElement('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2 } }, profile.headline) : null
      ) : null
    ),

    /* ── Two columns ── */
    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 } },

      /* ── LEFT COLUMN ── */
      React.createElement('div', null,

        /* Datenquellen */
        React.createElement('div', { style: cardStyle },
          React.createElement('div', { style: cardHeaderStyle },
            React.createElement('span', { style: { fontSize: 13, fontWeight: 700, color: 'rgb(20,20,43)' } }, 'Datenquellen')
          ),
          React.createElement('div', { style: cardBodyStyle },
            /* Profile status */
            React.createElement('div', {
              style: {
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '9px 12px', borderRadius: 9, marginBottom: 12,
                background: (profile && profile.full_name) ? '#F0FDF4' : '#FFF7ED',
                border: '1px solid ' + ((profile && profile.full_name) ? '#A7F3D0' : '#FDE68A')
              }
            },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 } },
                React.createElement('div', {
                  style: {
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: (profile && profile.full_name) ? '#10B981' : '#F59E0B'
                  }
                }),
                React.createElement('div', { style: { minWidth: 0 } },
                  React.createElement('div', { style: { fontSize: 12, fontWeight: 700, color: 'rgb(20,20,43)' } }, 'Mein Profil'),
                  React.createElement('div', {
                    style: { fontSize: 11, color: '#64748B', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }
                  },
                    (profile && profile.full_name)
                      ? (profile.headline || profile.company || 'Profil hinterlegt')
                      : 'Profil unvollständig'
                  )
                )
              ),
              React.createElement('a', {
                href: '/profile',
                style: {
                  fontSize: 11, fontWeight: 700, color: 'rgb(49,90,231)', textDecoration: 'none',
                  background: 'rgba(49,90,231,0.08)', padding: '3px 10px', borderRadius: 999,
                  border: '1px solid #BFDBFE', flexShrink: 0, marginLeft: 8
                }
              }, 'Bearbeiten')
            ),

            /* Brand Voice */
            React.createElement('label', { style: labelStyle }, 'Brand Voice'),
            brandVoices.length === 0
              ? React.createElement('div', {
                  style: {
                    padding: '9px 12px', borderRadius: 9, background: '#FFF7ED',
                    border: '1px solid #FDE68A', fontSize: 12, color: '#92400E',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }
                },
                  React.createElement('span', null, 'Noch keine Brand Voice'),
                  React.createElement('a', { href: '/brand-voice', style: { fontSize: 11, fontWeight: 700, color: 'rgb(49,90,231)', textDecoration: 'none' } }, 'Erstellen')
                )
              : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                  /* FIX: Alle Brand Voice Optionen nutzen makeBrandRadio */
                  makeBrandRadio('auto', selectedBrand === 'auto',
                    'Automatisch (aktive Voice)',
                    activeBrand ? activeBrand.name : null
                  ),
                  brandVoices.map(function(bv) {
                    return React.createElement('div', { key: bv.id },
                      makeBrandRadio(bv.id, selectedBrand === bv.id,
                        bv.name,
                        (bv.tone_attributes || []).slice(0, 3).join(' · ')
                      )
                    )
                  }),
                  makeBrandRadio('none', selectedBrand === 'none', 'Ohne Brand Voice', null)
                )
          )
        ),

        /* Stil und Format */
        React.createElement('div', { style: cardStyle },
          React.createElement('div', { style: cardHeaderStyle },
            React.createElement('span', { style: { fontSize: 13, fontWeight: 700, color: 'rgb(20,20,43)' } }, 'Stil und Format')
          ),
          React.createElement('div', { style: cardBodyStyle },
            React.createElement('label', { style: labelStyle }, 'Schreibstil'),
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 14 } },
              VARIANTS.map(function(v) {
                return React.createElement('div', { key: v.id }, makeOptBtn(variant === v.id, function() { setVariant(v.id) }, v.label, v.desc))
              })
            ),
            React.createElement('label', { style: labelStyle }, 'Laenge'),
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7, marginBottom: 14 } },
              LENGTHS.map(function(l) {
                return React.createElement('div', { key: l.id }, makeOptBtn(length === l.id, function() { setLength(l.id) }, l.label, l.desc))
              })
            ),
            React.createElement('label', { style: labelStyle }, 'Sprache'),
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 } },
              makeOptBtn(language === 'de', function() { setLanguage('de') }, 'Deutsch', null),
              makeOptBtn(language === 'en', function() { setLanguage('en') }, 'English', null)
            )
          )
        ),

        /* Schwerpunkte */
        React.createElement('div', { style: cardStyle },
          React.createElement('div', { style: cardHeaderStyle },
            React.createElement('span', { style: { fontSize: 13, fontWeight: 700, color: 'rgb(20,20,43)' } },
              'Schwerpunkte (' + focusAreas.length + ' gewählt)')
          ),
          React.createElement('div', { style: cardBodyStyle },
            React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 7 } },
              FOCUS_AREAS.map(function(area) {
                var isActive = focusAreas.includes(area)
                return React.createElement('button', {
                  key: area, onClick: function() { toggleFocus(area) },
                  style: {
                    padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', border: 'none',
                    background: isActive ? 'rgb(49,90,231)' : 'rgb(238,241,252)',
                    color: isActive ? '#fff' : '#475569', transition: 'all 0.15s'
                  }
                }, area)
              })
            )
          )
        ),

        /* Zusaetzliche Infos */
        React.createElement('div', { style: cardStyle },
          React.createElement('div', { style: cardHeaderStyle },
            React.createElement('span', { style: { fontSize: 13, fontWeight: 700, color: 'rgb(20,20,43)' } }, 'Zusätzliche Infos (optional)')
          ),
          React.createElement('div', { style: cardBodyStyle },
            React.createElement('textarea', {
              value: extraInfo, onChange: function(e) { setExtraInfo(e.target.value) },
              rows: 4, placeholder: 'Besondere Erfolge, Keywords, aktuelle Projekte...',
              style: {
                width: '100%', padding: '9px 12px', border: '1.5px solid #E2E8F0',
                borderRadius: 9, fontSize: 13, fontFamily: 'inherit',
                resize: 'vertical', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box'
              }
            })
          )
        ),

        /* AI Gate — Pro+ */
        !(sub && sub.ai_access) ? React.createElement('div', {
          style: {
            background: 'linear-gradient(135deg,#F5F3FF,#EDE9FE)', borderRadius: 12,
            border: '1.5px solid #DDD6FE', padding: '20px', marginBottom: 14, textAlign: 'center'
          }
        },
          React.createElement('div', { style: { fontSize: 32, marginBottom: 8 } }, '✨'),
          React.createElement('div', { style: { fontSize: 15, fontWeight: 800, color: '#5B21B6', marginBottom: 6 } },
            'KI-Funktion — Pro-Plan erforderlich'),
          React.createElement('div', { style: { fontSize: 12, color: '#7C3AED', marginBottom: 16, lineHeight: 1.6 } },
            'Mit dem Pro-Plan kannst du unbegrenzt KI-Texte generieren, deinen LinkedIn About-Bereich automatisch schreiben lassen und Zeit sparen.'),
          React.createElement('a', {
            href: 'https://www.wix.com/upgrade/lead-radar', target: '_blank', rel: 'noreferrer',
            style: {
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 22px',
              borderRadius: 999, background: 'linear-gradient(135deg,#7C3AED,#5B21B6)', color: '#fff',
              fontSize: 13, fontWeight: 700, textDecoration: 'none', boxShadow: '0 4px 14px rgba(124,58,237,0.35)'
            }
          }, '⚡ Jetzt auf Pro upgraden')
        ) : null,

        /* Generate button */
        React.createElement('button', {
          onClick: generate,
          disabled: generating || !(profile && profile.full_name),
          style: {
            width: '100%', padding: '13px 24px', borderRadius: 999, border: 'none',
            background: generating ? '#94A3B8' : 'rgb(49,90,231)', color: '#fff',
            fontSize: 14, fontWeight: 700,
            cursor: (generating || !(profile && profile.full_name)) ? 'not-allowed' : 'pointer',
            boxShadow: generating ? 'none' : '0 4px 14px rgba(10,102,194,0.35)',
            opacity: !(profile && profile.full_name) ? 0.6 : 1
          }
        }, generating ? 'Generiere...' : (result ? 'Neu generieren' : 'LinkedIn Info generieren')),

        !(profile && profile.full_name) ? React.createElement('div', {
          style: {
            marginTop: 10, padding: '9px 14px', background: '#FFF7ED',
            border: '1px solid #FDE68A', borderRadius: 9, fontSize: 12, color: '#92400E', fontWeight: 600
          }
        }, 'Bitte zuerst Profil ausfüllen') : null,

        error ? React.createElement('div', {
          style: {
            marginTop: 10, padding: '9px 14px', background: '#FEF2F2',
            border: '1px solid #FCA5A5', borderRadius: 9, fontSize: 12, color: '#991B1B', fontWeight: 600
          }
        }, error) : null
      ),

      /* ── RIGHT COLUMN ── */
      React.createElement('div', null,

        /* Output card */
        React.createElement('div', { style: Object.assign({}, cardStyle, { marginBottom: 14 }) },
          React.createElement('div', {
            style: Object.assign({}, cardHeaderStyle, { display: 'flex', alignItems: 'center', justifyContent: 'space-between' })
          },
            React.createElement('span', { style: { fontSize: 13, fontWeight: 700, color: 'rgb(20,20,43)' } }, 'LinkedIn About-Text'),
            result ? React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
              React.createElement('span', {
                style: { fontSize: 12, fontWeight: 700, color: charOver ? '#EF4444' : charWarn ? '#F59E0B' : '#10B981' }
              }, charCount + ' / ' + charMax),
              React.createElement('button', {
                onClick: generate, disabled: generating,
                style: {
                  padding: '5px 12px', borderRadius: 8, border: '1px solid #E2E8F0',
                  background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#64748B'
                }
              }, 'Neu'),
              React.createElement('button', {
                onClick: copyText,
                style: {
                  padding: '5px 14px', borderRadius: 8, border: 'none',
                  background: copied ? '#DCFCE7' : 'rgb(49,90,231)',
                  cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  color: copied ? '#065F46' : '#fff'
                }
              }, copied ? 'Kopiert!' : 'Kopieren')
            ) : null
          ),

          result ? React.createElement('div', { style: { padding: 18 } },
            /* LinkedIn preview */
            React.createElement('div', {
              style: { background: '#F3F2EF', borderRadius: 10, padding: 14, border: '1px solid #E2E8F0', marginBottom: 14 }
            },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 } },
                React.createElement('div', {
                  style: {
                    width: 38, height: 38, borderRadius: '50%',
                    background: 'linear-gradient(135deg,rgb(49,90,231),#3B82F6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0
                  }
                }, (profile && profile.full_name) ? profile.full_name.charAt(0).toUpperCase() : '?'),
                React.createElement('div', { style: { minWidth: 0 } },
                  React.createElement('div', {
                    style: { fontSize: 13, fontWeight: 700, color: 'rgb(20,20,43)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }
                  }, profile && profile.full_name),
                  profile && profile.headline ? React.createElement('div', {
                    style: { fontSize: 11, color: '#64748B', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }
                  }, profile.headline) : null
                )
              ),
              React.createElement('div', {
                style: { fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }
              }, 'Info'),
              React.createElement('div', {
                style: { fontSize: 13, color: 'rgb(20,20,43)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }
              }, result)
            ),

            charOver ? React.createElement('div', {
              style: {
                marginBottom: 10, padding: '8px 12px', background: '#FEF2F2',
                border: '1px solid #FCA5A5', borderRadius: 8, fontSize: 12, color: '#991B1B', fontWeight: 600
              }
            }, 'Text ist ' + (charCount - charMax) + ' Zeichen zu lang.') : null,

            React.createElement('label', { style: labelStyle }, 'Bearbeiten und anpassen'),
            React.createElement('textarea', {
              value: result, onChange: function(e) { setResult(e.target.value) },
              rows: 10,
              style: {
                width: '100%', padding: '11px 13px', border: '1.5px solid #E2E8F0',
                borderRadius: 9, fontSize: 13, fontFamily: 'inherit',
                resize: 'vertical', outline: 'none', lineHeight: 1.7,
                boxSizing: 'border-box', color: 'rgb(20,20,43)'
              }
            }),
            React.createElement('button', {
              onClick: copyText,
              style: {
                width: '100%', marginTop: 10, padding: '11px', borderRadius: 999, border: 'none',
                background: copied ? '#DCFCE7' : 'rgb(49,90,231)',
                color: copied ? '#065F46' : '#fff', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', boxShadow: copied ? 'none' : '0 2px 8px rgba(10,102,194,0.3)'
              }
            }, copied ? 'In die Zwischenablage kopiert!' : 'Text kopieren und in LinkedIn einfügen')
          ) : React.createElement('div', {
            style: { padding: '56px 24px', textAlign: 'center', color: '#94A3B8' }
          },
            React.createElement('div', { style: { fontSize: 40, marginBottom: 12 } }, '✍️'),
            React.createElement('div', { style: { fontSize: 15, fontWeight: 700, color: '#475569', marginBottom: 6 } }, 'Noch kein Text generiert'),
            React.createElement('div', { style: { fontSize: 13, maxWidth: 280, margin: '0 auto', lineHeight: 1.6 } },
              'Konfiguriere links und klicke auf "LinkedIn Info generieren".')
          )
        ),

        /* Tips */
        React.createElement('div', {
          style: { background: 'linear-gradient(135deg,#F0F7FF,#EFF6FF)', borderRadius: 12, border: '1px solid #BFDBFE', padding: '14px 18px' }
        },
          React.createElement('div', { style: { fontSize: 12, fontWeight: 700, color: 'rgb(49,90,231)', marginBottom: 9 } },
            'Tipps für deinen LinkedIn Info-Bereich'),
          React.createElement('ul', { style: { margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 5 } },
            [
              'Die ersten 2 Zeilen entscheiden – nur Vorschau sichtbar',
              'Max. 2.600 Zeichen – nutze den Platz gezielt',
              'Konkreter CTA am Ende erhöht Kontaktanfragen',
              'Keywords helfen bei der LinkedIn-Suche',
              'Persönlichkeit schlägt Floskeln – sei authentisch',
            ].map(function(tip, i) {
              return React.createElement('li', { key: i, style: { fontSize: 12, color: '#1E40AF', lineHeight: 1.5 } }, tip)
            })
          )
        )
      )
    )
  )
}
