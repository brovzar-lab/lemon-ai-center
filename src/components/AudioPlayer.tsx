import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useBriefStore } from '@/stores/useBriefStore'

/**
 * Audio player that generates TTS of the morning brief using Gemini.
 * Shows waveform visualization and transcript preview.
 */
export function AudioPlayer() {
  const jarvis = useBriefStore((s) => s.jarvis)
  const overview = useBriefStore((s) => s.overview)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const [lineIndex, setLineIndex] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const unlockedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  // A valid 0-length silent WAV, used to "unlock" the <audio> element inside
  // the tap gesture so iOS Safari allows playback after the async TTS fetch.
  const silentWavUrl = useMemo(() => {
    const bytes = new Uint8Array(44)
    const dv = new DataView(bytes.buffer)
    const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
    w(0, 'RIFF'); dv.setUint32(4, 36, true); w(8, 'WAVE'); w(12, 'fmt ')
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
    dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true)
    w(36, 'data'); dv.setUint32(40, 0, true)
    return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
  }, [])

  // Build the brief text for TTS
  const briefText = overview
    ? overview.map((c, i) => `${i + 1}. ${c.text}`).join('\n\n')
    : jarvis || ''

  const lines = briefText.split('\n\n').filter(Boolean)
  const estimatedDuration = Math.ceil(briefText.length / 15) // ~15 chars/sec speaking

  // C4: Memoize waveform heights so they don't randomize on every render
  const waveformHeights = useMemo(
    () => Array.from({ length: 40 }, () => Math.random() * 16 + 4),
    [],
  )

  // E3: Seek handler for waveform click
  const handleWaveformClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || !audioUrl || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    audio.currentTime = pct * duration
  }, [audioUrl, duration])

  // iOS Safari blocks audio that starts after an async gap. Playing the silent
  // WAV synchronously inside the tap "blesses" the element so the real TTS clip
  // (fetched async) is allowed to play afterward.
  const unlockAudio = () => {
    const audio = audioRef.current
    if (!audio || unlockedRef.current) return
    try {
      audio.src = silentWavUrl
      const p = audio.play()
      if (p) p.then(() => audio.pause()).catch(() => {})
      unlockedRef.current = true
    } catch {
      /* ignore — best-effort unlock */
    }
  }

  // Last-resort fallback when Gemini TTS is unavailable (e.g. no API key).
  // Browser SpeechSynthesis is robotic and unreliable on iOS, so we only use it
  // if the real voice fails — and surface a message so it's not a silent no-op.
  const speakFallback = () => {
    try {
      const synth = window.speechSynthesis
      if (!synth || !briefText) return
      synth.cancel()
      const utterance = new SpeechSynthesisUtterance(briefText)
      utterance.rate = 0.95
      utterance.onend = () => setPlaying(false)
      const pick = () => synth.getVoices().find((v) => v.lang?.startsWith('en')) || null
      utterance.voice = pick()
      if (!utterance.voice) synth.onvoiceschanged = () => { utterance.voice = pick() }
      synth.speak(utterance)
      setPlaying(true)
    } catch {
      /* ignore */
    }
  }

  // Fetch the Gemini WAV and play it. Called from the tap path after unlock.
  const loadAndPlay = async () => {
    if (loading || !briefText) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: briefText }),
      })
      if (!res.ok) {
        setError(
          res.status === 503
            ? 'High-quality voice unavailable — add a Gemini API key.'
            : 'Voice failed to generate — tap to retry.',
        )
        speakFallback()
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)
      setTranscript(lines[0] || '')
      const audio = audioRef.current
      if (!audio) return
      audio.src = url
      try {
        await audio.play()
        setPlaying(true)
      } catch {
        // Element wasn't unlocked in time — the next tap will play cleanly.
        setError('Tap play again to start audio.')
      }
    } catch (err) {
      console.error('TTS error:', err)
      setError('Voice failed — tap to retry.')
      speakFallback()
    } finally {
      setLoading(false)
    }
  }

  // Attach playback listeners once to the persistent <audio> element.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTime = () => {
      setCurrentTime(audio.currentTime)
      if (audio.duration) {
        const pct = audio.currentTime / audio.duration
        const idx = Math.min(Math.floor(pct * lines.length), Math.max(lines.length - 1, 0))
        setLineIndex(idx)
        setTranscript(lines[idx] || '')
      }
    }
    const handleDuration = () => setDuration(audio.duration)
    const handleEnd = () => setPlaying(false)

    audio.addEventListener('timeupdate', handleTime)
    audio.addEventListener('loadedmetadata', handleDuration)
    audio.addEventListener('ended', handleEnd)

    return () => {
      audio.removeEventListener('timeupdate', handleTime)
      audio.removeEventListener('loadedmetadata', handleDuration)
      audio.removeEventListener('ended', handleEnd)
    }
  }, [lines.length])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return

    // Already generated — just toggle play/pause synchronously (gesture-safe).
    if (audioUrl) {
      if (playing) {
        audio.pause()
        setPlaying(false)
      } else {
        audio.play().then(() => setPlaying(true)).catch(() => {})
      }
      return
    }

    // Fallback speech in progress — stop it.
    if (window.speechSynthesis?.speaking) {
      window.speechSynthesis.cancel()
      setPlaying(false)
      return
    }

    // First play: unlock within the gesture, then fetch + play.
    unlockAudio()
    void loadAndPlay()
  }

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60)
    const secs = Math.floor(s % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <section className="py-4 border-t border-line" aria-label="Audio briefing player">
      {/* Label */}
      <p className="text-[10px] font-sans font-bold uppercase tracking-[0.2em] text-ink-3 mb-3">
        Listen, Don’t Read · {Math.ceil(estimatedDuration / 60)}:{(estimatedDuration % 60).toString().padStart(2, '0')}
      </p>

      {/* Player bar */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={loading || !briefText}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-ink text-bg flex-shrink-0 hover:opacity-90 transition disabled:opacity-40"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {loading ? (
            <div className="spinner w-3 h-3 border-bg border-t-transparent" />
          ) : playing ? (
            <span className="text-sm">⏸</span>
          ) : (
            <span className="text-sm ml-0.5">▶</span>
          )}
        </button>

        {/* Waveform visualization — clickable for seeking */}
        <div
          className="flex-1 flex items-center gap-[2px] h-6 cursor-pointer"
          onClick={handleWaveformClick}
          role="slider"
          aria-label="Audio progress"
          aria-valuenow={Math.round(currentTime)}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration || estimatedDuration)}
          tabIndex={0}
        >
          {waveformHeights.map((height, i) => {
            const progress = duration > 0 ? currentTime / duration : 0
            const isActive = i / 40 < progress
            return (
              <div
                key={i}
                className={`w-[2px] rounded-full transition-colors ${isActive ? 'bg-ink' : 'bg-line'}`}
                style={{ height: `${height}px` }}
              />
            )
          })}
        </div>

        {/* Time */}
        <span className="text-[11px] font-sans tabular-nums text-ink-3 flex-shrink-0">
          {formatTime(currentTime)} / {formatTime(duration || estimatedDuration)}
        </span>
      </div>

      {/* Inline error — never fail silently */}
      {error && (
        <p className="mt-2 text-[11px] font-sans text-data-coral" role="status">
          {error}
        </p>
      )}

      {/* Transcript preview */}
      <div className="mt-3 border-t border-line pt-2">
        <p className="text-[10px] font-sans font-bold uppercase tracking-[0.2em] text-ink-3 mb-1">
          Line {lineIndex + 1} of {lines.length || 1}
        </p>
        <p className="font-sans text-[13px] italic text-ink-2 leading-relaxed">
          "{transcript || (lines[0] ? `${new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}. ${lines[0]}` : 'Loading brief...')}"
        </p>
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef} preload="auto" />

      <hr className="ed-rule mt-4" />
    </section>
  )
}
