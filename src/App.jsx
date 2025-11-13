import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Utility: next lower power of two <= n
function floorPowerOfTwo(n) {
  if (n < 1) return 1
  let p = 1
  while ((p << 1) <= n) p <<= 1
  return p
}

// Utility: next power of two >= n
function nextPowerOfTwo(n) {
  if (n < 1) return 1
  let p = 1
  while (p < n) p <<= 1
  return p
}

// Utility: simple Fisher-Yates shuffle
function shuffle(array) {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Build bracket with an automatic preliminary round (if needed)
// Data model: each match may specify sources for p1/p2: { r: roundIndex, m: matchIndex }
function createRoundsWithPrelim(seeds) {
  const n = seeds.length
  if (n < 2) return []

  const base = floorPowerOfTwo(n) // main bracket size
  const prelimMatches = n - base // number of preliminary matches required

  // If already power of two, build simple bracket without prelim/byes
  if (prelimMatches <= 0) {
    // Build first round from seeds directly
    const round0 = []
    for (let i = 0; i < n; i += 2) {
      round0.push({ p1: seeds[i] || null, p2: seeds[i + 1] || null, winner: null, score1: '', score2: '', id: `r0-m${i / 2}` })
    }
    // If odd n (shouldn't happen since base==n and n>=2 implies even), still handled by null
    const rounds = [round0]
    let size = round0.length
    let r = 1
    while (size > 1) {
      const matches = []
      for (let m = 0; m < size / 2; m++) {
        matches.push({ p1: null, p2: null, winner: null, score1: '', score2: '', id: `r${r}-m${m}`, source1: { r: r - 1, m: m * 2 }, source2: { r: r - 1, m: m * 2 + 1 } })
      }
      rounds.push(matches)
      size = matches.length
      r++
    }
    return propagateWinners(rounds)
  }

  // With prelim:
  // - first 2*prelimMatches participants play in prelim
  // - remaining get a bye into main bracket (base participants total)
  const prelimPlayersCount = prelimMatches * 2
  const prelimPlayers = seeds.slice(0, prelimPlayersCount)
  const byePlayers = seeds.slice(prelimPlayersCount)

  // Preliminary round
  const prelimRound = []
  for (let i = 0; i < prelimPlayers.length; i += 2) {
    prelimRound.push({ p1: prelimPlayers[i] || null, p2: prelimPlayers[i + 1] || null, winner: null, score1: '', score2: '', id: `r0-m${i / 2}` })
  }

  // Build main bracket entrants (base participants):
  // Fill first with winners from prelim (as sources), then with bye players (as fixed names)
  const entrants = []
  for (let i = 0; i < prelimRound.length; i++) {
    entrants.push({ source: { r: 0, m: i } })
  }
  for (const name of byePlayers) entrants.push({ name })
  // Now entrants.length === base

  // First main round (index 1)
  const round1 = []
  for (let i = 0; i < base; i += 2) {
    const a = entrants[i]
    const b = entrants[i + 1]
    round1.push({
      p1: a?.name || null,
      p2: b?.name || null,
      winner: null,
      score1: '',
      score2: '',
      id: `r1-m${i / 2}`,
      source1: a?.source ? { r: 0, m: a.source.m } : undefined,
      source2: b?.source ? { r: 0, m: b.source.m } : undefined,
    })
  }

  // Subsequent rounds
  const rounds = [prelimRound, round1]
  let size = round1.length
  let r = 2
  while (size > 1) {
    const matches = []
    for (let m = 0; m < size / 2; m++) {
      matches.push({ p1: null, p2: null, winner: null, score1: '', score2: '', id: `r${r}-m${m}`, source1: { r: r - 1, m: m * 2 }, source2: { r: r - 1, m: m * 2 + 1 } })
    }
    rounds.push(matches)
    size = matches.length
    r++
  }

  return propagateWinners(rounds)
}

// Propagate using explicit sources
function propagateWinners(rounds) {
  const newRounds = rounds.map(r => r.map(m => ({ ...m })))

  for (let r = 0; r < newRounds.length; r++) {
    const current = newRounds[r]
    for (let i = 0; i < current.length; i++) {
      const match = current[i]
      // Resolve p1 from source if exists
      if (match.source1) {
        const src = newRounds[match.source1.r][match.source1.m]
        match.p1 = src.winner || null
      }
      if (match.source2) {
        const src = newRounds[match.source2.r][match.source2.m]
        match.p2 = src.winner || null
      }
      // Auto-advance if one side present and the other absent
      if (match.p1 && !match.p2) match.winner = match.p1
      else if (match.p2 && !match.p1) match.winner = match.p2
      else if (match.winner && match.winner !== match.p1 && match.winner !== match.p2) match.winner = null
    }
  }

  return newRounds
}

export default function App() {
  const [num, setNum] = useState(8)
  const [names, setNames] = useState(() => Array.from({ length: 8 }, (_, i) => `Player ${i + 1}`))
  const [seeds, setSeeds] = useState([])
  const [rounds, setRounds] = useState([])
  const [showWheel, setShowWheel] = useState(false)
  const [spinning, setSpinning] = useState(false)

  // Ensure names array matches num
  useEffect(() => {
    setNames(prev => {
      const next = [...prev]
      if (next.length < num) {
        for (let i = next.length; i < num; i++) next.push(`Player ${i + 1}`)
      } else if (next.length > num) {
        next.length = num
      }
      return next
    })
  }, [num])

  const buildBracket = (filledNames) => {
    const randomized = shuffle(filledNames)
    setSeeds(randomized)
    setRounds(createRoundsWithPrelim(randomized))
  }

  // Start seeding with a spin effect
  const startSeeding = () => {
    const filled = names.map(n => n.trim()).filter(Boolean)
    if (filled.length < 2) {
      alert('Please enter at least 2 participant names.')
      return
    }
    setShowWheel(true)
    setSpinning(true)
    setTimeout(() => {
      buildBracket(filled)
      setSpinning(false)
      setTimeout(() => setShowWheel(false), 600)
    }, 2500)
  }

  // Handle winner selection for a given match
  const pickWinner = (roundIndex, matchIndex, winner) => {
    setRounds(prev => {
      const copy = prev.map(r => r.map(m => ({ ...m })))
      const match = copy[roundIndex][matchIndex]
      match.winner = winner
      return propagateWinners(copy)
    })
  }

  const clearBracket = () => {
    setSeeds([])
    setRounds([])
  }

  const printBracket = () => {
    window.print()
  }

  const hasBracket = rounds.length > 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-sky-50 to-cyan-50 text-gray-800">
      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur bg-white/60 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Tournament Bracket Generator</h1>
          <div className="hidden print:hidden sm:flex gap-2">
            <button onClick={printBracket} className="px-3 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700">Print / Save PDF</button>
            <button onClick={clearBracket} className="px-3 py-2 rounded-md bg-slate-200 hover:bg-slate-300">Reset</button>
          </div>
        </div>
      </header>

      {/* Controls */}
      <section className="print:hidden max-w-6xl mx-auto px-4 pt-6">
        <div className="bg-white/80 rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
          <div className="grid md:grid-cols-[220px_1fr] gap-4 md:gap-6">
            <div>
              <label className="block text-sm font-semibold mb-1">Number of participants</label>
              <input
                type="number"
                min={2}
                value={num}
                onChange={e => setNum(Math.max(2, parseInt(e.target.value || '2')))}
                className="w-full px-3 py-2 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-slate-500 mt-1">Any number supported. A preliminary round is created if needed.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-56 overflow-auto pr-1">
              {names.map((n, i) => (
                <input
                  key={i}
                  value={n}
                  onChange={e => setNames(prev => prev.map((x, idx) => (idx === i ? e.target.value : x)))}
                  placeholder={`Player ${i + 1}`}
                  className="px-2 py-2 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={startSeeding} className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700">Spin to Seed</button>
            <button onClick={() => { const filled = names.map(n => n.trim()).filter(Boolean); if (filled.length<2){alert('Enter at least 2 names'); return;} buildBracket(filled); }} className="px-4 py-2 rounded-md bg-slate-800 text-white hover:bg-slate-900">Quick Randomize</button>
          </div>
        </div>
      </section>

      {/* Seeds summary */}
      {seeds.length > 0 && (
        <section className="print:hidden max-w-6xl mx-auto px-4 mt-4">
          <div className="bg-white/70 rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold mb-2">Seeding Order</h3>
            <div className="flex flex-wrap gap-2 text-sm">
              {seeds.map((s, i) => (
                <span key={i} className="px-2 py-1 rounded border bg-slate-50">#{i + 1} {s}</span>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Bracket */}
      <section className="max-w-[1200px] mx-auto px-2 md:px-4 mt-6 pb-16">
        {hasBracket ? (
          <div className="relative bg-white/70 rounded-xl border border-slate-200 overflow-x-auto">
            <div className="min-w-[720px]">
              <Bracket rounds={rounds} onPick={pickWinner} />
            </div>
          </div>
        ) : (
          <div className="text-center text-slate-600 py-16">Enter names and spin to generate your bracket.</div>
        )}
      </section>

      {/* Spin Wheel Overlay */}
      <AnimatePresence>
        {showWheel && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/40 print:hidden">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-[90vw] max-w-xl">
              <h3 className="text-xl font-bold text-center mb-4">Seeding with Spin Wheel</h3>
              <div className="flex items-center justify-center py-4">
                <SpinWheel names={names.filter(Boolean)} spinning={spinning} />
              </div>
              <p className="text-center text-slate-500 text-sm">Shuffling participants...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer helper for print on small screens */}
      <div className="sm:hidden fixed bottom-3 inset-x-0 flex justify-center gap-3 print:hidden">
        <button onClick={printBracket} className="px-3 py-2 rounded-md bg-emerald-600 text-white shadow">Print / PDF</button>
        <button onClick={clearBracket} className="px-3 py-2 rounded-md bg-slate-200 shadow">Reset</button>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          header, section.print\\:hidden, .print\\:hidden, .sm\\:hidden { display: none !important; }
          body { background: white; }
        }
      `}</style>
    </div>
  )
}

function Bracket({ rounds, onPick }) {
  const roundNames = useMemo(() => {
    const total = rounds.length
    if (total === 0) return []
    const labels = []
    // Detect if first round is a preliminary: occurs when round 0 feeds into round 1 with arbitrary mapping (we always do when rounds.length>1)
    const hasPrelim = total > 1 && rounds[0].length !== rounds[1].length * 2
    for (let i = 0; i < total; i++) {
      if (hasPrelim && i === 0) {
        labels.push('Preliminary')
        continue
      }
      const remainingFromHere = total - i - (hasPrelim ? 1 : 0)
      if (remainingFromHere === 1) labels.push('Final')
      else if (remainingFromHere === 2) labels.push('Semi-finals')
      else if (remainingFromHere === 3) labels.push('Quarter-finals')
      else labels.push(`Round ${hasPrelim ? i : i + 1}`)
    }
    return labels
  }, [rounds])

  return (
    <div className="p-4 md:p-6">
      <div className="flex gap-4 md:gap-6">
        {rounds.map((matches, r) => (
          <div key={r} className="flex-1">
            <h4 className="text-sm font-semibold text-slate-600 mb-2 text-center">{roundNames[r]}</h4>
            <div className="flex flex-col gap-4">
              {matches.map((m, i) => (
                <MatchCard key={m.id} match={m} onPick={w => onPick(r, i, w)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MatchCard({ match, onPick }) {
  const selectable1 = !!match.p1
  const selectable2 = !!match.p2
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm px-3 py-2">
      <div className="space-y-1">
        <ParticipantRow
          name={match.p1 || '— waiting —'}
          active={match.winner === match.p1}
          disabled={!selectable1}
          onClick={() => selectable1 && onPick(match.p1)}
        />
        <ParticipantRow
          name={match.p2 || '— waiting —'}
          active={match.winner === match.p2}
          disabled={!selectable2}
          onClick={() => selectable2 && onPick(match.p2)}
        />
      </div>
    </div>
  )
}

function ParticipantRow({ name, active, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-2 py-2 rounded-md transition ${
        active ? 'bg-indigo-600 text-white' : disabled ? 'bg-slate-100 text-slate-400' : 'hover:bg-indigo-50'
      }`}
      title={disabled ? 'Waiting for previous match' : 'Click to set winner'}
    >
      <span className="truncate block">{name}</span>
    </button>
  )
}

// Simple spin wheel visualization using conic-gradient and rotation animation
function SpinWheel({ names, spinning }) {
  const segments = Math.max(names.length, 2)
  const palette = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#8B5CF6', '#84CC16', '#EC4899']
  // Build segments data
  const data = Array.from({ length: segments }).map((_, i) => ({
    label: names[i % names.length] || `P${i + 1}`,
    color: palette[i % palette.length],
  }))
  const angle = 360 / segments
  const background = `conic-gradient(${data
    .map((d, i) => `${d.color} ${i * angle}deg ${(i + 1) * angle}deg`)
    .join(',')})`

  return (
    <div className="relative">
      <motion.div
        animate={spinning ? { rotate: 1080 } : { rotate: 0 }}
        transition={{ duration: 2.2, ease: [0.2, 0.8, 0.2, 1] }}
        className="w-64 h-64 rounded-full shadow-inner border-4 border-white"
        style={{ background }}
      >
        {/* Labels */}
        <div className="relative w-full h-full rounded-full overflow-visible">
          {data.map((d, i) => (
            <div
              key={i}
              className="absolute left-1/2 top-1/2 origin-left text-xs text-white font-semibold"
              style={{ transform: `rotate(${i * angle + angle / 2}deg) translateX(18%)` }}
            >
              <span className="drop-shadow">{d.label}</span>
            </div>
          ))}
        </div>
      </motion.div>
      {/* Pointer */}
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-b-[14px] border-l-transparent border-r-transparent border-b-rose-600" />
    </div>
  )
}
