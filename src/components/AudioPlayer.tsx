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

  // Generate TTS via Gemini
  const generateAudio = async () => {
    if (loading || !briefText) return
    setLoading(true)

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: briefText }),
      })

      if (!res.ok) throw new Error('TTS generation failed')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)
      setDuration(estimatedDuration)
      setTranscript(lines[0] || '')
      setPlaying(true)
    } catch (err) {
      console.error('TTS error:', err)
      // Fallback: use browser SpeechSynthesis
      const utterance = new SpeechSynthesisUtterance(briefText)
      utterance.rate = 0.9
      utterance.pitch = 1
      utterance.voice = speechSynthesis.getVoices().find((v) => v.lang === 'en-US') || null
      utterance.onend = () => setPlaying(false)
      speechSynthesis.speak(utterance)
      setDuration(estimatedDuration)
      setTranscript(lines[0] || '')
      setPlaying(true)
    } finally {
      setLoading(false)
    }
  }

  // Audio element event handlers
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return

    audio.src = audioUrl
    audio.play()

    const handleTime = () => {
      setCurrentTime(audio.currentTime)
      // Update transcript line based on time
      const pct = audio.currentTime / audio.duration
      const idx = Math.min(Math.floor(pct * lines.length), lines.length - 1)
      setLineIndex(idx)
      setTranscript(lines[idx] || '')
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
  }, [audioUrl])

  const togglePlay = () => {
    if (!audioUrl) {
      generateAudio()
      return
    }
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      speechSynthesis.pause()
    } else {
      audio.play()
      speechSynthesis.resume()
    }
    setPlaying(!playing)
  }

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60)
    const secs = Math.floor(s % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <section className="py-4 border-t border-border-soft" aria-label="Audio briefing player">
      {/* Label */}
      <p className="text-[10px] font-body font-bold uppercase tracking-[0.2em] text-text-muted mb-3">
        Listen, Don’t Read · {Math.ceil(estimatedDuration / 60)}:{(estimatedDuration % 60).toString().padStart(2, '0')}
      </p>

      {/* Player bar */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={loading || !briefText}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-text-primary text-bg-base flex-shrink-0 hover:opacity-90 transition disabled:opacity-40"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {loading ? (
            <div className="spinner w-3 h-3 border-bg-base border-t-transparent" />
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
                className={`w-[2px] rounded-full transition-colors ${isActive ? 'bg-text-primary' : 'bg-border-medium'}`}
                style={{ height: `${height}px` }}
              />
            )
          })}
        </div>

        {/* Time */}
        <span className="text-[11px] font-body tabular-nums text-text-muted flex-shrink-0">
          {formatTime(currentTime)} / {formatTime(duration || estimatedDuration)}
        </span>
      </div>

      {/* Transcript preview */}
      <div className="mt-3 border-t border-border-soft pt-2">
        <p className="text-[10px] font-body font-bold uppercase tracking-[0.2em] text-text-muted mb-1">
          Line {lineIndex + 1} of {lines.length || 1}
        </p>
        <p className="font-display text-[13px] italic text-text-secondary leading-relaxed">
          "{transcript || (lines[0] ? `Hey Billy, good morning. ${lines[0]}` : 'Loading brief...')}"
        </p>
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef} preload="none" />

      <hr className="ed-rule mt-4" />
    </section>
  )
}
