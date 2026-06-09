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
  '🎨 Pinsel werden angespitzt…',
  '💡 Lichtsetzung wird arrangiert…',
  '🌈 Farben werden gemischt…',
  '🖼️ Komposition wird geprüft…',
  '✨ Pastellig oder kräftig? Die KI ringt mit sich…',
  '🎬 Letzte Klappe vor dem Rendern…',
  '🔍 Der perfekte Bildausschnitt wird gesucht…',
  '📐 Goldene Schnittlinien werden gezogen…',
  '🌟 Highlights werden gesetzt…',
  '🎭 Drei Statisten verlassen die Szene wieder…',
  '🍃 Der Wind wird justiert (bitte halten Sie noch einen Moment)…',
  '📸 Brennweite wird optimiert…',
  '🖌️ Letzter Pinselstrich…',
  '☕ Die KI gönnt sich kurz einen Espresso…',
  '🧹 Im Hintergrund wird noch einmal Staub gewischt…',
  '🪄 Etwas Magie wird draufgestreut…',
  '🎯 Pixel werden präzise platziert…',
  '🔬 Details werden unter der Lupe geprüft…',
  '🎢 Die Komposition macht noch eine Achterbahnfahrt…',
  '🤔 Sieht das gut aus? Ja, jetzt sieht das gut aus.',
  '📚 Die KI blättert durch ihre Brand-Voice-Notizen…',
  '🧠 Synapsen werden frisch geölt…',
  '💬 Worte werden auf der Zunge gewendet…',
  '📝 Der Text wird einmal laut Probe gelesen…',
  '🎤 Tonalität wird feinjustiert…',
  '🪞 Die KI schaut nochmal in den Spiegel der Brand Voice…',
  '🍿 Wir sind gleich da — Popcorn vorbereitet?',
  '🎁 Letzter Feinschliff am Geschenk…',
]

export default function GenerationLoading({ premium = false, expectedSeconds, title, compact = false }) {
  const expectedMax = expectedSeconds || (premium ? 90 : 25)
  const [statusIdx, setStatusIdx] = useState(() => Math.floor(Math.random() * FUN_STATUS_MESSAGES.length))
  const [mode, setMode] = useState('art')
  const [elapsedSec, setElapsedSec] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    const tick = setInterval(() => setStatusIdx(i => (i + 1) % FUN_STATUS_MESSAGES.length), 3500)
    const timer = setInterval(() => setElapsedSec(Math.round((Date.now() - startRef.current) / 1000)), 1000)
    return () => { clearInterval(tick); clearInterval(timer) }
  }, [])

  const P = 'var(--wl-primary, rgb(49,90,231))'
  const progress = Math.min(99, Math.round((elapsedSec / expectedMax) * 100))

  return (
    <section style={{
      marginBottom: 16,
      padding: compact ? 14 : 20,
      borderRadius: 16,
      background: compact ? 'transparent' : 'linear-gradient(135deg, rgba(49,90,231,0.04) 0%, rgba(139,92,246,0.06) 100%)',
      border: compact ? 'none' : '1px solid rgba(49,90,231,0.18)',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            border: '3px solid rgba(49,90,231,0.18)', borderTopColor: P,
            animation: 'genLoadSpin 0.9s linear infinite',
          }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
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
            padding: '7px 14px', borderRadius: 8, border: '1.5px solid rgba(49,90,231,0.3)',
            background: mode === 'game' ? P : 'transparent',
            color: mode === 'game' ? '#fff' : P,
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          {mode === 'art' ? '🎮 Mini-Spiel zur Überbrückung' : '🎨 Zurück zur Animation'}
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

      {mode === 'art' ? (
        <ArtScene status={FUN_STATUS_MESSAGES[statusIdx]} />
      ) : (
        <SnakeGame primaryColor={P} />
      )}

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
  )
}

function ArtScene({ status }) {
  const dots = []
  const palette = ['#315ae7', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#a855f7']
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
      <div style={{ position: 'relative', width: 280, height: 140 }}>
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
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: 44,
          animation: 'gen_brushBob 2.4s ease-in-out infinite',
        }}>🎨</div>
      </div>
      <div key={status} style={{
        fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
        textAlign: 'center', minHeight: 22,
        animation: 'gen_statusFade 0.5s ease-out',
      }}>{status}</div>
    </div>
  )
}

const SNAKE_COLS = 18
const SNAKE_ROWS = 12
const SNAKE_CELL = 16
function SnakeGame({ primaryColor }) {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(() => {
    try { return parseInt(localStorage.getItem('visuals_snake_hi') || '0', 10) } catch { return 0 }
  })
  const [running, setRunning] = useState(false)
  const [gameOver, setGameOver] = useState(false)

  function reset() {
    stateRef.current = {
      snake: [{ x: 9, y: 6 }, { x: 8, y: 6 }, { x: 7, y: 6 }],
      dir: { x: 1, y: 0 },
      pendingDir: { x: 1, y: 0 },
      food: { x: 13, y: 6 },
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

  function draw() {
    const cnv = canvasRef.current
    if (!cnv) return
    const ctx = cnv.getContext('2d')
    ctx.fillStyle = '#0F172A'
    ctx.fillRect(0, 0, cnv.width, cnv.height)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1
    for (let x = 0; x <= SNAKE_COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * SNAKE_CELL, 0); ctx.lineTo(x * SNAKE_CELL, SNAKE_ROWS * SNAKE_CELL); ctx.stroke()
    }
    for (let y = 0; y <= SNAKE_ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * SNAKE_CELL); ctx.lineTo(SNAKE_COLS * SNAKE_CELL, y * SNAKE_CELL); ctx.stroke()
    }
    const s = stateRef.current
    if (!s) return
    s.snake.forEach((seg, i) => {
      ctx.fillStyle = i === 0 ? '#60a5fa' : '#315ae7'
      ctx.fillRect(seg.x * SNAKE_CELL + 1, seg.y * SNAKE_CELL + 1, SNAKE_CELL - 2, SNAKE_CELL - 2)
    })
    ctx.fillStyle = '#ef4444'
    ctx.beginPath()
    ctx.arc(s.food.x * SNAKE_CELL + SNAKE_CELL / 2, s.food.y * SNAKE_CELL + SNAKE_CELL / 2, SNAKE_CELL / 2 - 2, 0, Math.PI * 2)
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
    }, 130)
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
          width: 38, height: 38, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer', fontSize: 18, fontWeight: 700,
        }}>{label}</button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
        <span>Punkte: <span style={{ color: primaryColor, fontVariantNumeric: 'tabular-nums' }}>{score}</span></span>
        <span style={{ color: 'var(--text-muted)' }}>·</span>
        <span>Highscore: <span style={{ color: primaryColor, fontVariantNumeric: 'tabular-nums' }}>{highScore}</span></span>
      </div>
      <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}>
        <canvas ref={canvasRef} width={SNAKE_COLS * SNAKE_CELL} height={SNAKE_ROWS * SNAKE_CELL}
          style={{ display: 'block' }}/>
        {!running && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(15,23,42,0.85)', color: '#fff',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 10,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {gameOver ? '💥 Game Over – ' + score + ' Punkte' : '🐍 Mini-Snake'}
            </div>
            <button onClick={startGame}
              style={{
                padding: '8px 18px', borderRadius: 8, border: 'none',
                background: primaryColor, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>
              {gameOver ? 'Nochmal' : 'Start'}
            </button>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
              Pfeiltasten oder Buttons unten
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 38px)', gridTemplateRows: 'repeat(3, 38px)', gap: 4, marginTop: 4 }}>
        <div /><div>{dirButton('↑', 0, -1)}</div><div />
        <div>{dirButton('←', -1, 0)}</div><div /><div>{dirButton('→', 1, 0)}</div>
        <div /><div>{dirButton('↓', 0, 1)}</div><div />
      </div>
    </div>
  )
}
