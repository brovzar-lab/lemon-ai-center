import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'

export const ttsRouter = Router()

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

    // S-13: API key in header, not URL query string (prevents leaks in logs/Referer)
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `Read this morning brief aloud in a warm, professional tone. Speak naturally as a chief of staff briefing a CEO:\n\n${text.slice(0, 4000)}` }],
          }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: 'Kore',
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

    const audioBuffer = Buffer.from(audioPart.inlineData.data, 'base64')
    res.set({
      'Content-Type': audioPart.inlineData.mimeType,
      'Content-Length': String(audioBuffer.length),
      'Cache-Control': 'private, max-age=3600',
    })
    res.send(audioBuffer)
  } catch (err) {
    console.error('TTS route error:', err)
    res.status(500).json({ error: { code: 'INTERNAL', message: 'TTS generation failed', retryable: true } })
  }
})
