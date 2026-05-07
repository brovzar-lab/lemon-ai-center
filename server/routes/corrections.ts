import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'
import { getBrainEngine } from '../lib/brain'

export const correctionsRouter = Router()
correctionsRouter.use(requireAuth)

const RULES_FILE = 'wiki/personal/productivity/briefing-rules.md'

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

/**
 * POST /api/corrections
 * Body: { correction: string, context?: string }
 *
 * Takes a CEO correction about the dashboard, uses AI to:
 * 1. Understand the correction
 * 2. Extract a concrete rule
 * 3. Append it to the briefing-rules.md file in the Obsidian vault
 * 4. The brain engine auto-re-indexes via file watcher
 * 5. Future briefings pick up the new rule
 */
correctionsRouter.post('/', csrfCheck, async (req, res) => {
  const { correction, context } = req.body as { correction: string; context?: string }

  if (!correction?.trim()) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Correction text is required', retryable: false },
    })
  }

  const vaultPath = process.env.OBSIDIAN_VAULT_PATH
  if (!vaultPath) {
    return res.status(500).json({
      error: { code: 'NO_VAULT', message: 'Obsidian vault not configured', retryable: false },
    })
  }

  try {
    const anthropic = getAnthropicClient()

    // Read current rules file
    const rulesPath = path.join(vaultPath, RULES_FILE)
    let currentRules = ''
    try {
      currentRules = fs.readFileSync(rulesPath, 'utf-8')
    } catch {
      // File doesn't exist yet — that's fine
    }

    // Use Claude to extract a rule from the correction
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: `You are a rules engine for a CEO dashboard. The CEO has given feedback about what the dashboard got wrong.

Your job:
1. Understand the correction
2. Extract ONE clear, actionable rule
3. Return ONLY a JSON object with these fields:
   - "rule": The rule text, written as a directive (e.g., "Never surface newsletter emails as HOT priority")
   - "category": One of "calendar", "email", "briefing", "general"
   - "summary": A brief 10-word summary of what was corrected
   - "action": What the system should do differently (e.g., "Add writersdigest.aimmedia.com to noise domains")

Output ONLY valid JSON. No markdown, no preamble.`,
      messages: [{
        role: 'user',
        content: `CEO correction: "${correction}"${context ? `\n\nDashboard context: ${context}` : ''}\n\nCurrent rules file:\n${currentRules}`,
      }],
    })

    const aiText = response.content[0].type === 'text' ? response.content[0].text : '{}'
    let parsed: { rule: string; category: string; summary: string; action: string }
    try {
      const cleaned = aiText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      parsed = {
        rule: correction,
        category: 'general',
        summary: 'Manual correction',
        action: 'Review and apply manually',
      }
    }

    // Append the new rule to the briefing-rules.md file
    const timestamp = new Date().toISOString().slice(0, 10)
    const ruleEntry = `\n${parsed.category === 'calendar' ? '### Calendar' : parsed.category === 'email' ? '### Email Triage' : parsed.category === 'briefing' ? '### Briefing' : '### General'}\n- **${parsed.rule}** _(added ${timestamp})_\n  - Action: ${parsed.action}\n`

    // Find the right place to append — after the "## Rules" section
    if (currentRules) {
      // Append before the "## Format Preferences" section if it exists
      const formatIdx = currentRules.indexOf('## Format Preferences')
      if (formatIdx > -1) {
        const updated = currentRules.slice(0, formatIdx) + ruleEntry + '\n' + currentRules.slice(formatIdx)
        fs.writeFileSync(rulesPath, updated, 'utf-8')
      } else {
        // Just append to end
        fs.writeFileSync(rulesPath, currentRules + '\n' + ruleEntry, 'utf-8')
      }
    } else {
      // Create new rules file
      const header = `---\ntitle: AI Briefing Operating Rules\ntype: productivity\ndate-created: ${timestamp}\n---\n\n# AI Briefing Operating Rules\n\n## Rules\n${ruleEntry}`
      fs.mkdirSync(path.dirname(rulesPath), { recursive: true })
      fs.writeFileSync(rulesPath, header, 'utf-8')
    }

    // The brain engine's file watcher will auto-detect and re-index this file
    // No manual re-index needed

    console.log(`[corrections] New rule saved: "${parsed.summary}" → ${RULES_FILE}`)

    res.json({
      data: {
        rule: parsed.rule,
        category: parsed.category,
        summary: parsed.summary,
        action: parsed.action,
        savedTo: RULES_FILE,
      },
    })
  } catch (err) {
    console.error('[corrections] Error:', (err as Error).message)
    res.status(500).json({
      error: { code: 'CORRECTION_FAILED', message: 'Failed to process correction', retryable: true },
    })
  }
})

/**
 * GET /api/corrections/rules
 * Returns the current briefing rules
 */
correctionsRouter.get('/rules', async (_req, res) => {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH
  if (!vaultPath) {
    return res.json({ data: { rules: '', exists: false } })
  }

  const rulesPath = path.join(vaultPath, RULES_FILE)
  try {
    const rules = fs.readFileSync(rulesPath, 'utf-8')
    res.json({ data: { rules, exists: true } })
  } catch {
    res.json({ data: { rules: '', exists: false } })
  }
})
