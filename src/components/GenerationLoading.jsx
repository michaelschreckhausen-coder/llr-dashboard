// src/components/GenerationLoading.jsx
//
// Einheitliche Lade-Animation fuer alle KI-Operationen (Brand Voice, Zielgruppen,
// Wissensdatenbank, Profiltexte, Visuals, Redaktionsplan, Messages, Vernetzungen,
// LeadProfile, Assistent ...). Zwei Modi:
//   1) 'art'  — bunte tanzende Punkte um ein Pinsel-Emoji + rotierende Status-Texte
//   2) 'game' — Mini-Snake mit Highscore in localStorage
//
// Props:
//   premium?         — boolean, setzt expectedSeconds=90 (sonst Default 25)
//   expectedSeconds? — Override fuer die Progress-Bar / "ca. Xs erwartet"
//   title?           — Optionaler Header-Text (Default: "KI denkt nach")
//   compact?         — Falls true: ohne aussere Card-Hintergrund, fuer Inline-Use

import React, { useState, useEffect, useRef } from 'react'

const FUN_STATUS_MESSAGES = [
  'Pinsel werden angespitzt…',
  'Lichtsetzung wird arrangiert…',
  'Farben werden gemischt…',
  'Komposition wird geprüft…',
  'Pastellig oder kräftig? Die KI ringt mit sich…',
  'Letzte Klappe vor dem Rendern…',
  'Der perfekte Bildausschnitt wird gesucht…',
  'Goldene Schnittlinien werden gezogen…',
  'Highlights werden gesetzt…',
  'Drei Statisten verlassen die Szene wieder…',
  'Der Wind wird justiert (bitte halten Sie noch einen Moment)…',
  'Brennweite wird optimiert…',
  'Letzter Pinselstrich…',
  'Die KI gönnt sich kurz einen Espresso…',
  'Im Hintergrund wird noch einmal Staub gewischt…',
  'Etwas Magie wird draufgestreut…',
  'Pixel werden präzise platziert…',
  'Details werden unter der Lupe geprüft…',
  'Die Komposition macht noch eine Achterbahnfahrt…',
  'Sieht das gut aus? Ja, jetzt sieht das gut aus.',
  'Die KI blättert durch ihre Brand-Voice-Notizen…',
  'Synapsen werden frisch geölt…',
  'Worte werden auf der Zunge gewendet…',
  'Der Text wird einmal laut Probe gelesen…',
  'Tonalität wird feinjustiert…',
  'Die KI schaut nochmal in den Spiegel der Brand Voice…',
  'Wir sind gleich da — Popcorn vorbereitet?',
  'Letzter Feinschliff am Geschenk…',
]

export default function GenerationLoading({ premium = false, expectedSeconds, title, compact = false, embedded = false, startedAt }) {
  const expectedMax = expectedSeconds || (premium ? 90 : 25)
  const [statusIdx, setStatusIdx] = useState(() => Math.floor(Math.random() * FUN_STATUS_MESSAGES.length))
  const [mode, setMode] = useState('art')
  const [elapsedSec, setElapsedSec] = useState(0)
  const startRef = useRef(startedAt || Date.now())

  useEffect(() => {
    const tick = setInterval(() => setStatusIdx(i => (i + 1) % FUN_STATUS_MESSAGES.length), 3500)
    const timer = setInterval(() => setElapsedSec(Math.round((Date.now() - startRef.current) / 1000)), 1000)
    return () => { clearInterval(tick); clearInterval(timer) }
  }, [])

  const P = 'var(--wl-primary, rgb(49,90,231))'
  const progress = Math.min(99, Math.round((elapsedSec / expectedMax) * 100))

  return (
    <div style={embedded ? {
      position: 'relative', width: '100%', height: '100%',
      display: 'flex', alignItems: 'stretch', justifyContent: 'center',
      boxSizing: 'border-box',
    } : {
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(248,250,252,0.90)',
      backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '7vh 20px 24px', overflowY: 'auto', boxSizing: 'border-box',
    }}>
    <section style={embedded ? {
      width: '100%', height: '100%',
      padding: 12,
      borderRadius: 12,
      background: '#fff',
      border: '1px solid rgba(49,90,231,0.18)',
      boxShadow: '0 1px 6px rgba(15,23,42,0.08)',
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      boxSizing: 'border-box',
    } : {
      width: '100%', maxWidth: 680,
      padding: compact ? 16 : 24,
      borderRadius: 16,
      background: '#fff',
      border: '1px solid rgba(49,90,231,0.18)',
      boxShadow: '0 24px 64px rgba(15,23,42,0.20)',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: embedded ? 20 : 28, height: embedded ? 20 : 28, borderRadius: '50%', flexShrink: 0,
            border: '3px solid rgba(49,90,231,0.18)', borderTopColor: P,
            animation: 'genLoadSpin 0.9s linear infinite',
          }} />
          <div>
            <div style={{ fontSize: embedded ? 12.5 : 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              {title || 'KI denkt nach'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {elapsedSec}s vergangen · ca. {expectedMax}s erwartet
            </div>
          </div>
        </div>
        <button
          onClick={() => setMode(m => m === 'art' ? 'game' : 'art')}
          style={{
            padding: embedded ? '5px 10px' : '7px 14px', borderRadius: 8, border: '1.5px solid rgba(49,90,231,0.3)',
            background: mode === 'game' ? P : 'transparent',
            color: mode === 'game' ? '#fff' : P,
            fontSize: embedded ? 11 : 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          {mode === 'art'
            ? (embedded ? '🎮 Mini-Spiel' : 'Mini-Spiel zur Überbrückung')
            : (embedded ? '← Animation' : 'Zurück zur Animation')}
        </button>
      </div>

      <div style={{ position: 'relative', height: 6, borderRadius: 4, background: 'rgba(49,90,231,0.12)', overflow: 'hidden', marginBottom: 14 }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, height: '100%', width: progress + '%',
          background: 'linear-gradient(90deg, ' + P + ' 0%, rgb(139,92,246) 100%)',
          transition: 'width 0.7s ease-out',
          borderRadius: 4,
        }} />
        <div style={{
          position: 'absolute', top: 0, left: 0, height: '100%', width: '60px',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
          animation: 'genLoadShimmer 1.8s linear infinite',
        }} />
      </div>

      <div style={{ flex: embedded ? 1 : 'none', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0, overflow: embedded ? 'auto' : 'visible' }}>
        {mode === 'art' ? (
          <ArtScene status={FUN_STATUS_MESSAGES[statusIdx]} compact={embedded} />
        ) : (
          <SnakeGame primaryColor={P} />
        )}
      </div>

      <style>{`
        @keyframes genLoadSpin { to { transform: rotate(360deg); } }
        @keyframes genLoadShimmer { 0% { transform: translateX(-60px); } 100% { transform: translateX(800px); } }
        @keyframes gen_brushBob {
          0%, 100% { transform: translate(0, 0) rotate(-12deg); }
          25% { transform: translate(10px, -4px) rotate(-8deg); }
          50% { transform: translate(20px, 2px) rotate(-12deg); }
          75% { transform: translate(10px, -2px) rotate(-15deg); }
        }
        @keyframes gen_dotFloat {
          0% { transform: translate(0, 0) scale(1); opacity: 0.8; }
          50% { transform: translate(var(--dx, 20px), var(--dy, -20px)) scale(1.4); opacity: 1; }
          100% { transform: translate(0, 0) scale(1); opacity: 0.8; }
        }
        @keyframes gen_statusFade {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
    </div>
  )
}

function ArtScene({ status, compact = false }) {
  const dots = []
  const palette = ['#1F3EAF', '#2A4ECC', '#315ae7', '#5478ED', '#7B8FF2', '#9D8FF5', '#8B5CF6', '#A78BFA']
  for (let i = 0; i < 22; i++) {
    const angle = (i / 22) * Math.PI * 2
    const r = 60 + (i % 4) * 22
    const x = 50 + Math.cos(angle) * (r / 8)
    const y = 50 + Math.sin(angle) * (r / 12)
    dots.push({
      x, y,
      color: palette[i % palette.length],
      delay: (i * 0.15) % 2.5,
      dx: Math.cos(angle * 2) * 18,
      dy: Math.sin(angle * 2) * 18,
      size: 6 + (i % 3) * 3,
    })
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '14px 0' }}>
      <div style={{ position: 'relative', width: compact ? 210 : 280, height: compact ? 100 : 140 }}>
        {dots.map((d, i) => (
          <div key={i}
            style={{
              position: 'absolute',
              left: d.x + '%',
              top: d.y + '%',
              width: d.size, height: d.size, borderRadius: '50%',
              background: d.color,
              boxShadow: '0 0 8px ' + d.color + '55',
              animation: 'gen_dotFloat 3.2s ease-in-out infinite',
              animationDelay: d.delay + 's',
              '--dx': d.dx + 'px',
              '--dy': d.dy + 'px',
            }}/>
        ))}
      </div>
      <div key={status} style={{
        fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
        textAlign: 'center', minHeight: 22,
        animation: 'gen_statusFade 0.5s ease-out',
      }}>{status}</div>
    </div>
  )
}

const SNAKE_COLS = 26
const SNAKE_ROWS = 16
const SNAKE_CELL = 22

function SnakeGame({ primaryColor }) {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(() => {
    try { return parseInt(localStorage.getItem('visuals_snake_hi') || '0', 10) } catch { return 0 }
  })
  const [running, setRunning] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [isTouch, setIsTouch] = useState(false)

  useEffect(() => {
    try { setIsTouch(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) } catch {}
  }, [])

  function reset() {
    const cx = Math.floor(SNAKE_COLS / 2)
    const cy = Math.floor(SNAKE_ROWS / 2)
    stateRef.current = {
      snake: [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }, { x: cx - 3, y: cy }],
      dir: { x: 1, y: 0 },
      pendingDir: { x: 1, y: 0 },
      food: { x: cx + 6, y: cy },
    }
    setScore(0); setGameOver(false)
  }

  function placeFood() {
    const s = stateRef.current
    let f
    do {
      f = { x: Math.floor(Math.random() * SNAKE_COLS), y: Math.floor(Math.random() * SNAKE_ROWS) }
    } while (s.snake.some(seg => seg.x === f.x && seg.y === f.y))
    s.food = f
  }

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }

  function draw() {
    const cnv = canvasRef.current
    if (!cnv) return
    const ctx = cnv.getContext('2d')
    const W = cnv.width, H = cnv.height
    // Hintergrund — sanfter Gradient
    const bg = ctx.createLinearGradient(0, 0, W, H)
    bg.addColorStop(0, '#1E293B')
    bg.addColorStop(1, '#0F172A')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)
    // dezentes Punkte-Grid statt Linien
    ctx.fillStyle = 'rgba(255,255,255,0.045)'
    for (let x = 0; x < SNAKE_COLS; x++) {
      for (let y = 0; y < SNAKE_ROWS; y++) {
        ctx.beginPath()
        ctx.arc(x * SNAKE_CELL + SNAKE_CELL / 2, y * SNAKE_CELL + SNAKE_CELL / 2, 1.2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    const s = stateRef.current
    if (!s) return
    // Snake — abgerundete Segmente mit Gradient vom Kopf zum Schwanz
    s.snake.forEach((seg, i) => {
      const t = i / Math.max(s.snake.length - 1, 1)
      const r = Math.round(96 - t * 36)
      const g = Math.round(165 - t * 75)
      const b = Math.round(250 - t * 19)
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')'
      roundedRect(ctx, seg.x * SNAKE_CELL + 2, seg.y * SNAKE_CELL + 2, SNAKE_CELL - 4, SNAKE_CELL - 4, 5)
      ctx.fill()
      // Augen am Kopf
      if (i === 0) {
        ctx.fillStyle = '#fff'
        const cx = seg.x * SNAKE_CELL + SNAKE_CELL / 2
        const cy = seg.y * SNAKE_CELL + SNAKE_CELL / 2
        const ex = s.dir.x !== 0 ? s.dir.x * 3 : 0
        const ey = s.dir.y !== 0 ? s.dir.y * 3 : 0
        const off = 3
        ctx.beginPath(); ctx.arc(cx + ex - (s.dir.y !== 0 ? off : 0), cy + ey - (s.dir.x !== 0 ? off : 0), 2, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(cx + ex + (s.dir.y !== 0 ? off : 0), cy + ey + (s.dir.x !== 0 ? off : 0), 2, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#0F172A'
        ctx.beginPath(); ctx.arc(cx + ex - (s.dir.y !== 0 ? off : 0), cy + ey - (s.dir.x !== 0 ? off : 0), 1, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(cx + ex + (s.dir.y !== 0 ? off : 0), cy + ey + (s.dir.x !== 0 ? off : 0), 1, 0, Math.PI * 2); ctx.fill()
      }
    })
    // Apfel mit Glanzpunkt
    const fcx = s.food.x * SNAKE_CELL + SNAKE_CELL / 2
    const fcy = s.food.y * SNAKE_CELL + SNAKE_CELL / 2
    const fr = SNAKE_CELL / 2 - 3
    ctx.fillStyle = '#ef4444'
    ctx.beginPath(); ctx.arc(fcx, fcy, fr, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.beginPath(); ctx.arc(fcx - fr * 0.35, fcy - fr * 0.35, fr * 0.35, 0, Math.PI * 2); ctx.fill()
    // Blatt-Stiel oben
    ctx.fillStyle = '#22c55e'
    ctx.beginPath()
    ctx.ellipse(fcx + 2, fcy - fr - 1, 3, 1.5, -Math.PI / 4, 0, Math.PI * 2)
    ctx.fill()
  }

  useEffect(() => {
    reset()
    draw()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!running) return
    const tick = setInterval(() => {
      const s = stateRef.current
      if (!s) return
      s.dir = s.pendingDir
      const head = s.snake[0]
      const next = { x: head.x + s.dir.x, y: head.y + s.dir.y }
      if (next.x < 0 || next.x >= SNAKE_COLS || next.y < 0 || next.y >= SNAKE_ROWS) {
        setRunning(false); setGameOver(true)
        setHighScore(prev => {
          const nv = Math.max(prev, score)
          try { localStorage.setItem('visuals_snake_hi', String(nv)) } catch {}
          return nv
        })
        return
      }
      if (s.snake.some(seg => seg.x === next.x && seg.y === next.y)) {
        setRunning(false); setGameOver(true)
        setHighScore(prev => {
          const nv = Math.max(prev, score)
          try { localStorage.setItem('visuals_snake_hi', String(nv)) } catch {}
          return nv
        })
        return
      }
      s.snake.unshift(next)
      if (next.x === s.food.x && next.y === s.food.y) {
        setScore(p => p + 1)
        placeFood()
      } else {
        s.snake.pop()
      }
      draw()
    }, 120)
    return () => clearInterval(tick)
  }, [running, score])

  useEffect(() => {
    function onKey(e) {
      if (!running) return
      const s = stateRef.current
      if (!s) return
      const k = e.key
      if (k === 'ArrowUp'    && s.dir.y !== 1)  { s.pendingDir = { x: 0, y: -1 }; e.preventDefault() }
      if (k === 'ArrowDown'  && s.dir.y !== -1) { s.pendingDir = { x: 0, y: 1 };  e.preventDefault() }
      if (k === 'ArrowLeft'  && s.dir.x !== 1)  { s.pendingDir = { x: -1, y: 0 }; e.preventDefault() }
      if (k === 'ArrowRight' && s.dir.x !== -1) { s.pendingDir = { x: 1, y: 0 };  e.preventDefault() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running])

  function startGame() {
    reset(); setRunning(true); placeFood(); draw()
  }

  function dirButton(label, dx, dy) {
    return (
      <button
        onClick={() => {
          if (!running) return
          const s = stateRef.current
          if (!s) return
          if (dx !== 0 && s.dir.x !== -dx) s.pendingDir = { x: dx, y: 0 }
          if (dy !== 0 && s.dir.y !== -dy) s.pendingDir = { x: 0, y: dy }
        }}
        style={{
          width: 44, height: 44, borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)',
          background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: 20, fontWeight: 700,
          touchAction: 'manipulation',
        }}>{label}</button>
    )
  }

  const boardW = SNAKE_COLS * SNAKE_CELL
  const boardH = SNAKE_ROWS * SNAKE_CELL

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <div style={{
        position: 'relative',
        borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(15,23,42,0.18), inset 0 0 0 1px rgba(255,255,255,0.06)',
        maxWidth: '100%',
      }}>
        <canvas ref={canvasRef} width={boardW} height={boardH}
          style={{ display: 'block', maxWidth: '100%', height: 'auto' }}/>

        {/* Score-Badges schweben oben im Spielfeld */}
        <div style={{
          position: 'absolute', top: 10, left: 12, display: 'flex', gap: 8, pointerEvents: 'none',
        }}>
          <div style={{
            padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
            background: 'rgba(15,23,42,0.6)', color: '#fff',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ opacity: 0.65 }}>Punkte</span>
            <span style={{ color: '#60a5fa', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{score}</span>
          </div>
        </div>
        <div style={{
          position: 'absolute', top: 10, right: 12, display: 'flex', gap: 8, pointerEvents: 'none',
        }}>
          <div style={{
            padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
            background: 'rgba(15,23,42,0.6)', color: '#fff',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ opacity: 0.65 }}>Best</span>
            <span style={{ color: '#fbbf24', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{highScore}</span>
          </div>
        </div>

        {/* Start / Game-Over Overlay */}
        {!running && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(15,23,42,0.55) 0%, rgba(15,23,42,0.85) 100%)',
            color: '#fff',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 14, backdropFilter: 'blur(2px)',
          }}>
            <div style={{ fontSize: 38 }}>{gameOver ? '🎯' : '🐍'}</div>
            <div style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>
              {gameOver
                ? (score >= highScore && score > 0 ? 'Neuer Highscore — ' + score : score + ' Punkte erreicht')
                : 'Mini-Snake'}
            </div>
            <button onClick={startGame}
              style={{
                padding: '11px 32px', borderRadius: 999, border: 'none',
                background: primaryColor, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 6px 20px rgba(49,90,231,0.4)',
                transition: 'transform 0.15s',
              }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              {gameOver ? 'Nochmal spielen' : 'Spiel starten'}
            </button>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
              {isTouch ? 'Steuerung per Touch-Buttons darunter' : 'Steuerung per Pfeiltasten'}
            </div>
          </div>
        )}
      </div>

      {/* Dpad nur auf Touch-Geräten */}
      {isTouch && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 44px)', gridTemplateRows: 'repeat(3, 44px)', gap: 6 }}>
          <div /><div>{dirButton('↑', 0, -1)}</div><div />
          <div>{dirButton('←', -1, 0)}</div><div /><div>{dirButton('→', 1, 0)}</div>
          <div /><div>{dirButton('↓', 0, 1)}</div><div />
        </div>
      )}
    </div>
  )
}
