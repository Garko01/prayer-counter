
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
  } catch { return {} }
}

function saveHistory(h: History) {
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(h))
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS)
    return raw ? { ...defaultSettings, ...(JSON.parse(raw) as Settings) } : defaultSettings
  } catch { return defaultSettings }
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

export default function App(){
  const [count, setCount] = useState<number>(() => loadNumber(STORAGE_KEYS.COUNT, 0))
  const [history, setHistory] = useState<History>(() => loadHistory())
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const incHoldRef = useRef<HoldState>({ delay: null, repeat: null })
  const decHoldRef = useRef<HoldState>({ delay: null, repeat: null })
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Persist count
  useEffect(() => { saveNumber(STORAGE_KEYS.COUNT, count) }, [count])
  // Persist history
  useEffect(() => { saveHistory(history) }, [history])
  // Persist settings
  useEffect(() => { saveSettings(settings) }, [settings])

  function vibrate(ms = settings.vibrateMs){
    if (!settings.vibrate) return
    if ('vibrate' in navigator) {
      try { navigator.vibrate(ms) } catch {}
    }
  }

  function increment(step = 1) {
    if (settings.vibrate && 'vibrate' in navigator) navigator.vibrate(settings.vibrateMs)
    setCount(c => Math.max(0, c + step))
  }

  function decrement(step = 1) {
    if (settings.hapticsOnDecrement && 'vibrate' in navigator)
    navigator.vibrate(settings.vibrateMs)
    setCount(c => Math.max(0, c - step))
  }

  // side effects handled separately, but guard to avoid redundant re-writes
  useEffect(() => {
    if (count < 0) return // safety guard
    const key = todayKey()

    // only update if count actually changed from stored total
    setHistory(h => {
      const prev = h[key]?.total ?? -1
      if (prev === count) return h
      return { ...h, [key]: { date: key, total: count } }
    })

    // vibrate()
  }, [count])


  function updateTodayHistory(newCount: number) {
    const key = todayKey()
    setHistory(h => ({
      ...h,
      [key]: { date: key, total: newCount }
    }))
  }

  function todayKeyForDate(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2,'0')
    const day = String(d.getDate()).padStart(2,'0')
    return `${y}-${m}-${day}`
  }

  function reset(){
    setCount(0)
  }

  // -- Helper: fixed hold logic
  function startHold(ref: React.MutableRefObject<HoldState>, fn: () => void) {
    // schedule the repeat only (don’t run fn yet)
    ref.current.delay = window.setTimeout(() => {
      fn() // first auto increment
      ref.current.repeat = window.setInterval(fn, 150)
    }, 300)
  }

  function stopHold(ref: React.MutableRefObject<HoldState>, fn: () => void) {
    // if released before delay triggers, treat as a quick tap
    const hadDelay = ref.current.delay !== null
    const hadRepeat = ref.current.repeat !== null

    if (hadDelay && !hadRepeat) {
      // short press — single increment
      fn()
    }

    if (ref.current.delay !== null) {
      clearTimeout(ref.current.delay)
      ref.current.delay = null
    }
    if (ref.current.repeat !== null) {
      clearInterval(ref.current.repeat)
      ref.current.repeat = null
    }
  }

  function clearToday(){
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

  const today = useMemo(() => history[todayKey()], [history])
  const streak = useMemo(() => calcStreak(), [history])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore if the keypress originated from a button click
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

  return (
    <div className="wrap">
      <header className="toolbar">
        <div className="pill">连续 <strong>{streak}</strong> 天</div>
        <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <button
            className="icon-btn"
            onClick={() => setShowHistory(true)}
            aria-label="Open History"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 6h13M8 12h13M8 18h13M3 6h0M3 12h0M3 18h0"/>
            </svg>
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowSettings(true)}
            aria-label="Open Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.26 1.3.73 1.77.47.47 1.11.73 1.77.73h.09a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
            </svg>
          </button>
        </div>
      </header>

      <main className="card">
        <div className="display" aria-live="polite" role="status">
          <span>{count}</span>
        </div>

        <div className="counter-layout">
          {/* + button */}
          <button
            className="btn-huge btn-accent"
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              startHold(incHoldRef, increment)
            }}
            onPointerUp={(e) => { e.preventDefault(); stopHold(incHoldRef, increment) }}
            onPointerLeave={() => stopHold(incHoldRef, increment)}
            onPointerCancel={() => stopHold(incHoldRef, increment)}
            aria-label="Increment"
          >
            +
          </button>

          <div className="counter-sub">
            {/* Reset button (now first, on the left) */}
            <button
              className="btn-small btn-danger icon-btn"
              onClick={reset}
              aria-label="Reset Counter"
              title="Reset"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 256 256"
                width="20"
                height="20"
              >
                <g transform="translate(1.4 1.4) scale(2.81 2.91)">
                  <path
                    d="M75.702 53.014c-2.142 7.995-7.27 14.678-14.439 18.816-7.168 4.138-15.519 5.239-23.514 3.095-16.505-4.423-26.335-21.448-21.913-37.953C20.258 20.467 37.286 10.64 53.79 15.06c4.213 1.129 8.076 3.118 11.413 5.809l-8.349 8.35h26.654V2.565l-8.354 8.354c-5.1-4.405-11.133-7.61-17.74-9.381C33.451-4.882 8.735 9.389 2.314 33.35c-6.42 23.961 7.851 48.678 31.811 55.098C38.001 89.486 41.934 90 45.842 90c7.795 0 15.488-2.044 22.42-6.046 10.407-6.008 17.851-15.709 20.962-27.317l-13.522-3.623z"
                    fill="currentColor"
                  />
                </g>
              </svg>
            </button>

            {/* − button (now second, on the right) */}
            <button
              className="btn-small"
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                startHold(decHoldRef, decrement)
              }}
              onPointerUp={(e) => { e.preventDefault(); stopHold(decHoldRef, decrement) }}
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
          <div
            className="overlay-card"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="title">记录</div>
              <button className="btn-ghost" onClick={() => setShowHistory(false)}>✖</button>
            </header>

            <div className="history" aria-live="polite">
              {(() => {
                const items: JSX.Element[] = []
                const clamp = 14
                for (let i = 0; i < clamp; i++) {
                  const d = new Date()
                  d.setDate(d.getDate() - i)
                  const key = todayKeyForDate(d)
                  const log = history[key]
                  const total = log ? log.total : 0
                  items.push(
                    <div className="history-item" key={key}>
                      <div style={{fontWeight:600}}>{key}</div>
                      <div style={{fontWeight:700}}>{total}</div>
                    </div>
                  )
                }
                return items
              })()}
            </div>

            <div className="row center" style={{ marginTop: 12 }}>
              <button
                className="btn-danger"
                onClick={() => {
                  localStorage.clear()
                  location.reload()
                }}
              >
                重置全部
              </button>
              <button className="btn-ghost" onClick={clearToday}>清除今天</button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Settings overlay is now separate and independent */}
      {showSettings && (
        <div className="overlay" onClick={() => setShowSettings(false)}>
          <div
            className="overlay-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <header className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="title">Settings</div>
              <button className="btn-ghost" onClick={() => setShowSettings(false)}>✖</button>
            </header>

            <div className="settings-body">
              <div className="row" style={{justifyContent:'space-between'}}>
                <label className="muted">Vibrate</label>
                <input type="checkbox" checked={settings.vibrate}
                  onChange={e => setSettings(s => ({...s, vibrate: e.target.checked}))}/>
              </div>
              <div className="row" style={{justifyContent:'space-between'}}>
                <label className="muted">Vibration ms</label>
                <input type="number" min={0} max={50} value={settings.vibrateMs}
                  onChange={e => setSettings(s => ({...s, vibrateMs: Number(e.target.value)}))}
                  style={{width:90, background:'transparent', color:'white', border:'1px solid #1f2937', borderRadius:8, padding:'6px 8px'}}/>
              </div>
              <div className="row" style={{justifyContent:'space-between'}}>
                <label className="muted">Haptic on −</label>
                <input type="checkbox" checked={settings.hapticsOnDecrement}
                  onChange={e => setSettings(s => ({...s, hapticsOnDecrement: e.target.checked}))}/>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}