import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'

export const ttsRouter = Router()

/** Wrap raw little-endian 16-bit PCM in a minimal WAV container so browsers can play it. */
function pcmToWav(pcm: Buffer, sampleRate: number, channels = 1, bitsPerSample = 16): Buffer {
  const byteRate = sampleRate * channels * (bitsPerSample / 8)
  const blockAlign = channels * (bitsPerSample / 8)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // fmt chunk size
  header.writeUInt16LE(1, 20) // audio format = PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/**
 * POST /api/tts
 * Generate TTS audio from text using Gemini API.
 * Falls back to a simple placeholder WAV if Gemini is unavailable.
 */
ttsRouter.post('/', requireAuth, csrfCheck, async (req, res) => {
  try {
    const { text } = req.body
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'text is required', retryable: false } })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return res.status(503).json({ error: { code: 'NO_API_KEY', message: 'Gemini API key not configured', retryable: false } })
    }

    // Voice is configurable without a redeploy. Gemini prebuilt voices include
    // Kore (firm), Charon (informative), Puck (upbeat), Leda (youthful),
    // Sulafat (warm), Algieba (smooth) — see ai.google.dev TTS docs.
    const voiceName = process.env.GEMINI_TTS_VOICE?.trim() || 'Charon'

    // S-13: API key in header, not URL query string (prevents leaks in logs/Referer)
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `Read this morning brief aloud in a warm, natural, human tone. Speak fluidly and conversationally, like a trusted chief of staff briefing a CEO over coffee:\n\n${text.slice(0, 4000)}` }],
          }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName,
                },
              },
            },
          },
        }),
      },
    )

    if (!response.ok) {
      const errBody = await response.text()
      console.error('Gemini TTS error:', response.status, errBody)
      return res.status(502).json({ error: { code: 'GEMINI_ERROR', message: 'TTS generation failed', retryable: true } })
    }

    const data = await response.json() as any

    // Extract audio data from Gemini response
    const audioPart = data.candidates?.[0]?.content?.parts?.find(
      (p: any) => p.inlineData?.mimeType?.startsWith('audio/'),
    )

    if (!audioPart?.inlineData) {
      return res.status(502).json({ error: { code: 'NO_AUDIO', message: 'No audio in Gemini response', retryable: true } })
    }

    // Gemini returns raw little-endian PCM (e.g. "audio/L16;codec=pcm;rate=24000"),
    // which browsers cannot decode directly — wrap it in a WAV container first.
    const mimeType: string = audioPart.inlineData.mimeType || 'audio/L16;codec=pcm;rate=24000'
    const raw = Buffer.from(audioPart.inlineData.data, 'base64')

    let body: Buffer
    let contentType: string
    if (/audio\/(l16|pcm)|codec=pcm/i.test(mimeType)) {
      const rate = parseInt(mimeType.match(/rate=(\d+)/)?.[1] ?? '24000', 10)
      body = pcmToWav(raw, rate)
      contentType = 'audio/wav'
    } else {
      body = raw
      contentType = mimeType
    }

    res.set({
      'Content-Type': contentType,
      'Content-Length': String(body.length),
      'Cache-Control': 'private, max-age=3600',
    })
    res.send(body)
  } catch (err) {
    console.error('TTS route error:', err)
    res.status(500).json({ error: { code: 'INTERNAL', message: 'TTS generation failed', retryable: true } })
  }
})
