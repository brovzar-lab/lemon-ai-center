import React, { useState } from 'react'
import { X, Flame, Feather } from 'lucide-react'
import { TONE_TIERS, trainVoiceProfile, saveVoiceProfile } from '../lib/voiceProfile'
import VoiceDiff from './VoiceDiff'
import { useMissionStore } from '@/stores/useMissionStore'
import type { VoiceProfile, ToneTier } from '../lib/voiceProfile'

interface Props {
  open: boolean
  onClose: () => void
  voiceProfile: VoiceProfile
  onProfileUpdate: (p: VoiceProfile) => void
}

export default function SettingsModal({ open, onClose, voiceProfile, onProfileUpdate }: Props) {
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [proposed, setProposed] = useState<VoiceProfile | null>(null)
  const [emailsAnalyzed, setEmailsAnalyzed] = useState(0)
  const advisorTone = useMissionStore((s) => s.advisorTone)
  const setAdvisorTone = useMissionStore((s) => s.setAdvisorTone)

  if (!open) return null

  async function pullFromGmail() {
    setAnalyzing(true)
    setAnalyzeError(null)
    setProposed(null)
    try {
      const result = await trainVoiceProfile()
      setProposed(result.proposed)
      setEmailsAnalyzed(result.emailsAnalyzed)
    } catch (err: unknown) {
      setAnalyzeError(err instanceof Error ? err.message : 'Analysis failed')
    }
    setAnalyzing(false)
  }

  async function handleApprove(merged: VoiceProfile) {
    await saveVoiceProfile(merged)
    onProfileUpdate(merged)
    setProposed(null)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <span className="modal-title">Settings</span>
          <button onClick={onClose} className="modal-close" aria-label="Close"><X size={16} /></button>
        </div>

        {/* Advisor Tone Section */}
        <div className="settings-section">
          <div className="settings-section-header">
            <div>
              <h3 className="settings-section-title">Advisor Tone</h3>
              <p className="settings-section-desc">
                How the daily note and weekly review talk to you.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => void setAdvisorTone('brutal')}
              className="settings-train-btn"
              style={{
                opacity: advisorTone === 'brutal' ? 1 : 0.45,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              aria-pressed={advisorTone === 'brutal'}
            >
              <Flame size={14} /> Brutally honest
            </button>
            <button
              type="button"
              onClick={() => void setAdvisorTone('consigliere')}
              className="settings-train-btn"
              style={{
                opacity: advisorTone === 'consigliere' ? 1 : 0.45,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              aria-pressed={advisorTone === 'consigliere'}
            >
              <Feather size={14} /> Consigliere
            </button>
          </div>
        </div>

        {/* Voice Profile Section */}
        <div className="settings-section">
          <div className="settings-section-header">
            <div>
              <h3 className="settings-section-title">Voice Profile</h3>
              <p className="settings-section-desc">
                {voiceProfile.trained
                  ? `Trained on ${voiceProfile.emailsAnalyzed} emails, updated ${new Date(voiceProfile.lastUpdated!).toLocaleDateString()}`
                  : 'Using defaults. Pull from Gmail for accuracy.'}
              </p>
            </div>
            <span className={`settings-badge ${voiceProfile.trained ? 'active' : 'defaults'}`}>
              {voiceProfile.trained ? 'Active' : 'Defaults'}
            </span>
          </div>

          {/* Summary */}
          <div className="settings-voice-summary">{voiceProfile.summary}</div>

          {/* Tone tiers */}
          <div className="settings-tones">
            <div className="settings-tones-label">Tone tiers</div>
            {(Object.entries(TONE_TIERS) as [ToneTier, typeof TONE_TIERS[ToneTier]][]).map(([k, v]) => (
              <div key={k} className="settings-tone-row">
                <span className="settings-tone-name" style={{ color: v.color }}>{v.label}</span>
                <span className="settings-tone-desc">
                  {voiceProfile.tones[k] || v.desc}
                </span>
              </div>
            ))}
          </div>

          {/* Training section */}
          {proposed ? (
            <VoiceDiff
              current={voiceProfile}
              proposed={proposed}
              emailsAnalyzed={emailsAnalyzed}
              onApprove={handleApprove}
              onCancel={() => setProposed(null)}
            />
          ) : (
            <div className="settings-train">
              {analyzeError && (
                <div className="settings-error">{analyzeError}</div>
              )}
              <button onClick={pullFromGmail} disabled={analyzing} className="settings-train-btn">
                {analyzing ? (
                  <>
                    <div className="spinner" />
                    Analyzing your sent emails...
                  </>
                ) : (
                  'Pull from Gmail'
                )}
              </button>
              <p className="settings-train-note">
                Reads your last 50 sent emails. Nothing is stored until you approve.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
