import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { History, DayLog } from './types'

const STORAGE_KEYS = {
  COUNT: 'japa.count',
  HISTORY: 'japa.history',
  SETTINGS: 'japa.settings'
} as const

type Settings = {
  vibrate: boolean
  vibrateMs: number
  autoResetAfterLog: boolean
  hapticsOnDecrement: boolean
}

const defaultSettings: Settings = {
  vibrate: true,
  vibrateMs: 10,
  autoResetAfterLog: true,
  hapticsOnDecrement: false
}

function loadNumber(key: string, fallback = 0): number {
  const raw = localStorage.getItem(key)
  const n = raw ? Number(raw) : fallback
  return Number.isFinite(n) ? n : fallback
}

function saveNumber(key: string, value: number) {
  localStorage.setItem(key, String(value))
}

function loadHistory(): History {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HISTORY)
    if (!raw) return {}
    const obj = JSON.parse(raw) as History
    return obj || {}
  } catch {
    return {}
  }
}

function saveHistory(h: History) {
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(h))
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS)
    return raw ? { ...defaultSettings, ...(JSON.parse(raw) as Settings) } : defaultSettings
  } catch {
    return defaultSettings
  }
}

function saveSettings(s: Settings) {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(s))
}

function todayKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type HoldState = { delay: number | null; repeat: number | null }

function BeadTrack({ count, direction }: { count: number; direction: 'inc' | 'dec' }) {
  const beadsContainer = useRef<HTMLDivElement>(null)
  const beadGap = 40
  const beadCount = 5
  const isAnimatingRef = useRef(false)
  const offsetRef = useRef(0)

  // Create beads initially
  useEffect(() => {
    const container = beadsContainer.current
    if (!container) return
    container.innerHTML = ''
    for (let i = 0; i < beadCount; i++) {
      const bead = document.createElement('div')
      bead.className = 'bead'
      container.appendChild(bead)
    }
    applyGlow(0)
  }, [])

  // React to count changes
  useEffect(() => {
    if (!beadsContainer.current) return
    step(direction)
  }, [count, direction])

  function applyGlow(current: number) {
    const container = beadsContainer.current
    if (!container) return
    const beads = container.querySelectorAll('.bead')
    beads.forEach(b => b.classList.remove('glow'))

    const mid = Math.floor((beads.length - 1) / 2)

    // Highlight center if count is exactly 0
    if (current === 0) {
      beads[mid]?.classList.add('glow')
      return
    }

    // Glow for the 108th-cycle window: 106..110 → -2,-1,0,+1,+2 around center
    const remainder = ((current - 106) % 108 + 108) % 108 + 106
    if (remainder >= 106 && remainder <= 110) {
      const glowOffset = remainder - 108 // 106→-2, 107→-1, 108→0, 109→+1, 110→+2
      const idx = mid + glowOffset
      if (idx >= 0 && idx < beads.length) beads[idx].classList.add('glow')
    }
  }

  function step(dir: 'inc' | 'dec') {
    if (isAnimatingRef.current) return
    isAnimatingRef.current = true

    const container = beadsContainer.current
    if (!container) return

    const delta = dir === 'inc' ? beadGap : -beadGap
    const nextOffset = offsetRef.current + delta

    container.style.transition = 'transform 0.12s linear'
    container.style.transform = `translate(-50%, -50%) translateX(${nextOffset}px)`

    const handleEnd = () => {
      if (!container) return

      // recycle bead
      if (dir === 'inc') {
        const last = container.lastElementChild
        if (last) container.insertBefore(last, container.firstElementChild)
      } else {
        const first = container.firstElementChild
        if (first) container.appendChild(first)
      }

      // reset transform
      offsetRef.current = 0
      container.style.transition = 'none'
      container.style.transform = `translate(-50%, -50%) translateX(${offsetRef.current}px)`
      void container.offsetWidth // force reflow

      applyGlow(count)
      isAnimatingRef.current = false
      container.removeEventListener('transitionend', handleEnd)
    }

    container.addEventListener('transitionend', handleEnd)
  }

  return (
    <div className="track">
      <div className="beads" ref={beadsContainer}></div>
    </div>
  )
}

export default function App() {
  const [count, setCount] = useState<number>(() => loadNumber(STORAGE_KEYS.COUNT, 0))
  const [history, setHistory] = useState<History>(() => loadHistory())
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [direction, setDirection] = useState<'inc' | 'dec'>('inc')
  const incHoldRef = useRef<HoldState>({ delay: null, repeat: null })
  const decHoldRef = useRef<HoldState>({ delay: null, repeat: null })
  const [showHistory, setShowHistory] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Persist count/history/settings
  useEffect(() => saveNumber(STORAGE_KEYS.COUNT, count), [count])
  useEffect(() => saveHistory(history), [history])
  useEffect(() => saveSettings(settings), [settings])

  function vibrate(ms = settings.vibrateMs) {
    if (!settings.vibrate) return
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(ms)
      } catch {}
    }
  }

  function increment(step = 1) {
    setDirection('inc')
    setCount(c => Math.max(0, c + step))
    vibrate()
  }

  function decrement(step = 1) {
    setDirection('dec')
    setCount(c => Math.max(0, c - step))
    if (settings.hapticsOnDecrement) vibrate()
  }

  useEffect(() => {
    if (count < 0) return
    const key = todayKey()
    setHistory(h => {
      const prev = h[key]?.total ?? -1
      if (prev === count) return h
      return { ...h, [key]: { date: key, total: count } }
    })
  }, [count])

  function reset() {
    setCount(0)
  }

  function clearToday() {
    const key = todayKey()
    if (!history[key]) return
    const { [key]: _, ...rest } = history
    setHistory(rest)
  }

  function calcStreak(): number {
    const dates = Object.keys(history).sort()
    if (dates.length === 0) return 0
    const set = new Set(dates.filter(d => (history[d].total ?? 0) > 0))
    let streak = 0
    let cursor = new Date()
    const todayHas = set.has(todayKey())
    if (!todayHas) cursor.setDate(cursor.getDate() - 1)
    while (true) {
      const key = todayKeyForDate(cursor)
      if (set.has(key)) {
        streak++
        cursor.setDate(cursor.getDate() - 1)
      } else {
        break
      }
    }
    return streak
  }

  function todayKeyForDate(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  function startHold(ref: React.MutableRefObject<HoldState>, fn: () => void) {
    fn() // immediate feedback
    ref.current.delay = window.setTimeout(() => {
      ref.current.repeat = window.setInterval(fn, 150)
    }, 300)
  }

  function stopHold(ref: React.MutableRefObject<HoldState>, fn: () => void) {
    if (ref.current.delay !== null) {
      clearTimeout(ref.current.delay)
      ref.current.delay = null
    }
    if (ref.current.repeat !== null) {
      clearInterval(ref.current.repeat)
      ref.current.repeat = null
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLButtonElement) return
      if (e.key === 'ArrowUp' || e.key === '+') increment()
      else if (e.key === 'ArrowDown' || e.key === '-') decrement()
      else if (e.key.toLowerCase() === 'r') reset()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settings])

  useEffect(() => {
    const checkDayChange = () => {
      const key = todayKey()
      if (!history[key]) {
        setCount(0)
        setHistory(h => ({ ...h, [key]: { date: key, total: 0 } }))
      }
    }
    const interval = setInterval(checkDayChange, 60_000)
    checkDayChange()
    return () => clearInterval(interval)
  }, [history])

  const streak = useMemo(() => calcStreak(), [history])

  return (
    <div className="wrap">
      <header className="toolbar">
        <div className="pill">连续 <strong translate="no">{streak}</strong> 天</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="icon-btn" onClick={() => setShowHistory(true)} aria-label="Open History">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 6h13M8 12h13M8 18h13M3 6h0M3 12h0M3 18h0" />
            </svg>
          </button>
          <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Open Settings">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82h0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      <main className="card">
        <BeadTrack count={count} direction={direction} />
        <div className="display" aria-live="polite" role="status">
          <span translate="no">{count}</span>
        </div>

        <div className="counter-layout">
          <button
            className="btn-huge btn-accent"
            onPointerDown={e => { e.preventDefault(); startHold(incHoldRef, increment) }}
            onPointerUp={e => { e.preventDefault(); stopHold(incHoldRef, increment) }}
            onPointerLeave={() => stopHold(incHoldRef, increment)}
            onPointerCancel={() => stopHold(incHoldRef, increment)}
            aria-label="Increment"
          >
            +
          </button>

          <div className="counter-sub">
            <button className="btn-small btn-danger icon-btn" onClick={reset} aria-label="Reset Counter" title="Reset">
              ⟳
            </button>

            <button
              className="btn-small"
              onPointerDown={e => { e.preventDefault(); startHold(decHoldRef, decrement) }}
              onPointerUp={e => { e.preventDefault(); stopHold(decHoldRef, decrement) }}
              onPointerLeave={() => stopHold(decHoldRef, decrement)}
              onPointerCancel={() => stopHold(decHoldRef, decrement)}
              aria-label="Decrement"
            >
              −
            </button>
          </div>
        </div>
      </main>

      {showHistory && (
        <div className="overlay" onClick={() => setShowHistory(false)}>
          <div className="overlay-card" onClick={e => e.stopPropagation()}>
            <header className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="title">记录</div>
              <button className="btn-ghost" onClick={() => setShowHistory(false)}>✖</button>
            </header>
            <div className="history">
              {Array.from({ length: 14 }).map((_, i) => {
                const d = new Date()
                d.setDate(d.getDate() - i)
                const key = todayKeyForDate(d)
                const total = history[key]?.total ?? 0
                return (
                  <div className="history-item" key={key}>
                    <div style={{ fontWeight: 600 }}>{key}</div>
                    <div style={{ fontWeight: 700 }}>{total}</div>
                  </div>
                )
              })}
            </div>
            <div className="row center" style={{ marginTop: 12 }}>
              <button className="btn-danger" onClick={() => { localStorage.clear(); location.reload() }}>重置全部</button>
              <button className="btn-ghost" onClick={clearToday}>清除今天</button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="overlay" onClick={() => setShowSettings(false)}>
          <div className="overlay-card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <header className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="title">Settings</div>
              <button className="btn-ghost" onClick={() => setShowSettings(false)}>✖</button>
            </header>

            <div className="settings-body">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <label className="muted">Vibrate</label>
                <input type="checkbox" checked={settings.vibrate}
                  onChange={e => setSettings(s => ({ ...s, vibrate: e.target.checked }))} />
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <label className="muted">Vibration ms</label>
                <input type="number" min={0} max={50} value={settings.vibrateMs}
                  onChange={e => setSettings(s => ({ ...s, vibrateMs: Number(e.target.value) }))} />
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <label className="muted">Haptic on −</label>
                <input type="checkbox" checked={settings.hapticsOnDecrement}
                  onChange={e => setSettings(s => ({ ...s, hapticsOnDecrement: e.target.checked }))} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
