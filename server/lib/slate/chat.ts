import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { getAnthropicClient } from '../anthropic'
import { getBrainEngine } from '../brain'
import { CLAUDE_MODELS } from '@shared/models'
import { assessStaleness } from '@shared/slateStaleness'
import { listSlateProjects } from './index'
import { cosineSimilarity } from './embeddings'
import { listIndexEntries, searchSlate, type SlateIndexEntry } from './ingest'
import type { SlateProject } from '@shared/types'

/**
 * The query chat (spec §3) — the brain over the whole slate. Hybrid
 * retrieval per D5: the slate vector index (search_slate / read_material /
 * draft_structure / compare_projects), the FlexSearch vault brain
 * (search_vault), and the slate metadata itself, injected verbatim as
 * SLATE STATE the way the Billy Drawer injects its live state block.
 *
 * The external-material firewall (spec §7) is enforced HERE, in retrieval,
 * not just in the prompt: creative-purpose searches and comparisons drop
 * `origin: external` chunks before scoring unless Billy explicitly asked
 * for external material. Status queries include them, always marked.
 */

// ── Slate state block (the metadata leg of hybrid retrieval) ─────────────

function days(fromISO: string | undefined, now: Date): number | null {
  if (!fromISO) return null
  const t = new Date(fromISO).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000))
}

function describeProject(p: SlateProject, chunksByProject: Map<string, number>, now: Date): string {
  const head = [
    `${p.slug} — "${p.title}"`,
    p.format,
    `stage: ${p.stage}`,
    p.status.toUpperCase(),
    p.priority ? `priority ${p.priority}` : null,
    p.origin === 'external' ? 'EXTERNAL (firewalled submission)' : 'internal',
  ]
    .filter(Boolean)
    .join(' · ')

  const lines: string[] = [head]
  if (p.logline) lines.push(`  logline: ${p.logline.trim()}`)
  if (p.writers?.length) {
    lines.push(
      `  writers: ${p.writers.map((w) => `${w.name}${w.language ? ` (${w.language})` : ''}`).join(', ')}`,
    )
  }
  if (p.current_draft) {
    const d = p.current_draft
    lines.push(
      `  current draft: v${String(d.version).padStart(2, '0')}${d.ep !== undefined ? ` ep${d.ep}` : ''}${d.date ? ` (${d.date})` : ''} — ${d.file}`,
    )
  } else {
    lines.push('  current draft: none on file')
  }

  const touchedDays = days(p.last_touched, now)
  const staleness = assessStaleness(p, now)
  if (p.status === 'active') {
    const touch =
      p.last_touched && touchedDays !== null
        ? `last touched ${p.last_touched.slice(0, 10)} (${touchedDays}d ago)`
        : 'never touched'
    lines.push(
      `  ${touch} · staleness: ${staleness.days}/${staleness.threshold}d on the ${staleness.clock} clock — ${staleness.level.toUpperCase()}`,
    )
  }
  if (p.waiting_on) {
    const w = p.waiting_on
    lines.push(`  waiting on: ${w.who} — ${w.what} — since ${w.since} (${days(w.since, now) ?? '?'}d)`)
  }
  if (p.targets?.length) lines.push(`  targets: ${p.targets.join(', ')}`)
  if (p.deadlines?.length) {
    lines.push(`  deadlines: ${p.deadlines.map((d) => `${d.date} — ${d.what}`).join('; ')}`)
  }
  if (p.language) lines.push(`  language: ${p.language}`)
  if (p.notes) lines.push(`  notes: ${p.notes.trim().slice(0, 240)}`)
  const chunks = chunksByProject.get(p.slug) ?? 0
  lines.push(chunks > 0 ? `  indexed material: ${chunks} chunks` : '  indexed material: none yet')
  if (p.unfiled_count) lines.push(`  ${p.unfiled_count} unfiled file(s) awaiting confirmation`)
  return lines.join('\n')
}

/** Every project, metadata + staleness math done, external loudly marked. */
export function buildSlateStateBlock(projects: SlateProject[], now: Date): string {
  if (projects.length === 0) {
    return 'The slate is empty — no projects tracked yet. Say so; do not invent any.'
  }
  const chunksByProject = new Map<string, number>()
  for (const entry of listIndexEntries()) {
    chunksByProject.set(entry.meta.project, (chunksByProject.get(entry.meta.project) ?? 0) + 1)
  }
  const live = projects.filter((p) => p.status !== 'dead')
  const dead = projects.filter((p) => p.status === 'dead')
  const parts = [
    `${live.length} project(s) on the slate (${live.filter((p) => p.origin === 'external').length} external), ${dead.length} archived/dead.`,
    ...live.map((p) => describeProject(p, chunksByProject, now)),
  ]
  if (dead.length > 0) {
    parts.push(
      `Archived (dead, material not indexed): ${dead.map((p) => `${p.slug} ("${p.title}")`).join(', ')}`,
    )
  }
  return parts.join('\n\n')
}

// ── Tools ─────────────────────────────────────────────────────────────────

/*
 * Input schemas — strict, per the chatTools.ts convention: anything not
 * whitelisted is rejected before it touches retrieval.
 */

const PurposeSchema = z.enum(['status', 'creative'])

const SearchSlateSchema = z
  .object({
    query: z.string().min(1),
    purpose: PurposeSchema,
    include_external: z.boolean().optional(),
    project: z.string().optional(),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .strict()

const ReadMaterialSchema = z
  .object({
    file: z.string().min(1),
    from_seq: z.number().int().min(0).optional(),
    max_chunks: z.number().int().min(1).max(10).optional(),
  })
  .strict()

const DraftStructureSchema = z
  .object({
    project: z.string().min(1),
    version: z.number().int().min(1).optional(),
  })
  .strict()

const CompareProjectsSchema = z
  .object({
    purpose: PurposeSchema,
    include_external: z.boolean().optional(),
    top: z.number().int().min(1).max(15).optional(),
  })
  .strict()

const SearchVaultSchema = z
  .object({
    query: z.string().min(1),
    limit: z.number().int().min(1).max(15).optional(),
  })
  .strict()

/**
 * The firewall rule, in one place (spec §7): creative retrieval never sees
 * external material unless Billy explicitly asked for it. Status retrieval
 * sees everything — results always carry origin.
 */
function firewallScope(purpose: 'status' | 'creative', includeExternal?: boolean): 'all' | 'internal' {
  return purpose === 'creative' && !includeExternal ? 'internal' : 'all'
}

export const SLATE_CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_slate',
    description:
      'Semantic search over all indexed slate material — drafts, treatments, outlines, ideas, coverage, notes, correspondence, Spanish and English alike. Returns best-matching chunks with project, file, kind and score. Use for any "which project has/says/is about…" question. purpose="creative" (brainstorming, comparing ideas, finding material to pitch or send out, rewrite thinking) enforces the external-material firewall at retrieval. Set include_external=true ONLY when Billy explicitly asks to look at external submissions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'What to look for; natural language, either language' },
        purpose: { type: 'string', enum: ['status', 'creative'] },
        include_external: { type: 'boolean' },
        project: { type: 'string', description: 'Restrict to one project slug' },
        limit: { type: 'number', description: 'Max hits, default 8' },
      },
      required: ['query', 'purpose'],
    },
  },
  {
    name: 'read_material',
    description:
      'Read an indexed file in order, a page of chunks at a time — the tool for actually reading a draft before judging it (act structure, what happens in the middle, how a character is written). Find the file via slate state, search_slate or draft_structure first. Returns chunks from from_seq onward plus how many remain.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file: { type: 'string', description: 'DEVELOPMENT-relative path as shown by other tools' },
        from_seq: { type: 'number', description: 'First chunk seq to return, default 0' },
        max_chunks: { type: 'number', description: 'Chunks per page, default 6, max 10' },
      },
      required: ['file'],
    },
  },
  {
    name: 'draft_structure',
    description:
      "Scene map of a project's current draft (or a given version): every scene heading in order with its chunk positions. The skeleton for act-structure analysis — locate act two, then read_material the scenes that matter.",
    input_schema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project slug' },
        version: { type: 'number', description: 'Specific draft version; default = highest indexed' },
      },
      required: ['project'],
    },
  },
  {
    name: 'compare_projects',
    description:
      'Measure which projects actually resemble each other from the embedded material itself (ideas, treatments, outlines, drafts — not notes). Returns the most similar pairs with scores; the tool for "which two projects are secretly the same movie". Creative purpose excludes external submissions unless Billy explicitly asked.',
    input_schema: {
      type: 'object' as const,
      properties: {
        purpose: { type: 'string', enum: ['status', 'creative'] },
        include_external: { type: 'boolean' },
        top: { type: 'number', description: 'How many pairs, default 5' },
      },
      required: ['purpose'],
    },
  },
  {
    name: 'search_vault',
    description:
      "Keyword search over Billy's Obsidian vault (the existing brain): per-project slate status notes, meeting notes, deal memos — context that lives outside the script material.",
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', description: 'Max results, default 6' },
      },
      required: ['query'],
    },
  },
]

export interface SlateToolOutcome {
  /** JSON/text payload returned to the model */
  content: string
  /** One human-readable line surfaced to the UI ("Searched the slate for …") */
  label: string
}

const CREATIVE_KINDS = new Set(['idea', 'treatment', 'outline', 'draft'])

function externalBanner(origin: string): string {
  return origin === 'external' ? ' [EXTERNAL — firewalled submission]' : ''
}

async function toolSearchSlate(input: unknown): Promise<SlateToolOutcome> {
  const args = SearchSlateSchema.parse(input)
  const scope = firewallScope(args.purpose, args.include_external)
  const hits = await searchSlate(args.query, {
    scope,
    project: args.project,
    limit: args.limit ?? 8,
  })
  const payload = {
    scope: scope === 'internal' ? 'internal only (firewall active)' : 'all material, external marked',
    hits: hits.map((h) => ({
      score: Number(h.score.toFixed(3)),
      project: h.project,
      origin: h.origin,
      file: h.file,
      kind: h.kind,
      ...(h.version !== undefined ? { version: h.version } : {}),
      ...(h.ep !== undefined ? { ep: h.ep } : {}),
      ...(h.sceneHeading ? { scene: h.sceneHeading } : {}),
      text: h.text.slice(0, 700),
    })),
  }
  return {
    content: JSON.stringify(payload),
    label: `Searched the slate for "${args.query}"${scope === 'internal' ? ' (internal only)' : ''} — ${hits.length} hit(s)`,
  }
}

function fileEntries(file: string): SlateIndexEntry[] {
  return listIndexEntries()
    .filter((e) => e.meta.file === file)
    .sort((a, b) => a.meta.seq - b.meta.seq)
}

function toolReadMaterial(input: unknown): SlateToolOutcome {
  const args = ReadMaterialSchema.parse(input)
  const entries = fileEntries(args.file)
  if (entries.length === 0) {
    return {
      content: `No indexed file at "${args.file}". Use the exact DEVELOPMENT-relative path from search_slate, draft_structure or the slate state.`,
      label: `Tried to read ${args.file} — not in the index`,
    }
  }
  const from = args.from_seq ?? 0
  const pageSize = args.max_chunks ?? 6
  const page = entries.filter((e) => e.meta.seq >= from).slice(0, pageSize)
  const last = page.length > 0 ? page[page.length - 1].meta.seq : from
  const remaining = entries.filter((e) => e.meta.seq > last).length
  const { project, origin } = entries[0].meta
  const body = page
    .map((e) => {
      const scene = e.meta.sceneHeading
        ? `[scene ${e.meta.sceneIndex ?? '?'} — ${e.meta.sceneHeading}]\n`
        : ''
      return `--- chunk ${e.meta.seq} ---\n${scene}${e.text}`
    })
    .join('\n\n')
  const header = `${args.file} — ${project}${externalBanner(origin)} · ${entries.length} chunks total, showing seq ${from}–${last}${remaining > 0 ? ` · ${remaining} more (continue with from_seq=${last + 1})` : ' · end of file'}`
  return {
    content: `${header}\n\n${body}`,
    label: `Read ${args.file} (chunks ${from}–${last})`,
  }
}

function toolDraftStructure(input: unknown): SlateToolOutcome {
  const args = DraftStructureSchema.parse(input)
  const drafts = listIndexEntries().filter(
    (e) => e.meta.project === args.project && e.meta.kind === 'draft',
  )
  if (drafts.length === 0) {
    return {
      content: `No indexed draft material for project "${args.project}".`,
      label: `Looked for drafts of ${args.project} — none indexed`,
    }
  }
  const versions = drafts.map((e) => e.meta.version ?? 0)
  const version = args.version ?? Math.max(...versions)
  const ofVersion = drafts.filter((e) => (e.meta.version ?? 0) === version)
  if (ofVersion.length === 0) {
    return {
      content: `Project "${args.project}" has no indexed draft v${version}. Indexed versions: ${[...new Set(versions)].sort((a, b) => a - b).join(', ')}.`,
      label: `Looked for ${args.project} draft v${version} — not indexed`,
    }
  }
  // The same version can exist as .fdx and .pdf — map the richest file.
  const byFile = new Map<string, SlateIndexEntry[]>()
  for (const e of ofVersion) {
    const list = byFile.get(e.meta.file) ?? []
    list.push(e)
    byFile.set(e.meta.file, list)
  }
  const [file, entries] = [...byFile.entries()].sort(
    (a, b) =>
      b[1].filter((e) => e.meta.sceneHeading).length - a[1].filter((e) => e.meta.sceneHeading).length ||
      b[1].length - a[1].length,
  )[0]
  entries.sort((a, b) => a.meta.seq - b.meta.seq)
  const origin = entries[0].meta.origin

  const scenes: Array<{ scene: number; heading: string; chunks: number[] }> = []
  for (const e of entries) {
    if (e.meta.sceneIndex === undefined || !e.meta.sceneHeading) continue
    const prev = scenes[scenes.length - 1]
    if (prev && prev.scene === e.meta.sceneIndex) prev.chunks.push(e.meta.seq)
    else scenes.push({ scene: e.meta.sceneIndex, heading: e.meta.sceneHeading, chunks: [e.meta.seq] })
  }
  const payload = {
    project: args.project,
    origin,
    file,
    version,
    chunkCount: entries.length,
    ...(scenes.length > 0
      ? { scenes: scenes.map((s) => ({ ...s, chunks: `${s.chunks[0]}–${s.chunks[s.chunks.length - 1]}` })) }
      : { note: 'No scene headings detected (prose or non-screenplay draft) — read_material sequentially.' }),
  }
  return {
    content: JSON.stringify(payload),
    label: `Mapped ${args.project} draft v${version} — ${scenes.length > 0 ? `${scenes.length} scenes` : `${entries.length} chunks, no scene map`}`,
  }
}

function toolCompareProjects(input: unknown): SlateToolOutcome {
  const args = CompareProjectsSchema.parse(input)
  const scope = firewallScope(args.purpose, args.include_external)
  const byProject = new Map<string, { sum: Float64Array; count: number; origin: string }>()
  for (const e of listIndexEntries()) {
    if (!CREATIVE_KINDS.has(e.meta.kind)) continue
    if (scope === 'internal' && e.meta.origin === 'external') continue
    let acc = byProject.get(e.meta.project)
    if (!acc) {
      acc = { sum: new Float64Array(e.vector.length), count: 0, origin: e.meta.origin }
      byProject.set(e.meta.project, acc)
    }
    for (let i = 0; i < e.vector.length; i++) acc.sum[i] += e.vector[i]
    acc.count++
  }
  const MIN_CHUNKS = 3 // one stray note shouldn't define a project's identity
  const centroids = [...byProject.entries()]
    .filter(([, v]) => v.count >= MIN_CHUNKS)
    .map(([project, v]) => {
      // Chunk vectors are unit-length but their mean is not — renormalize,
      // or projects with varied material read as less similar to everything.
      const norm = Math.sqrt(v.sum.reduce((s, x) => s + x * x, 0)) || 1
      return {
        project,
        origin: v.origin,
        count: v.count,
        centroid: Float64Array.from(v.sum, (x) => x / norm),
      }
    })
  const skipped = [...byProject.entries()]
    .filter(([, v]) => v.count < MIN_CHUNKS)
    .map(([project, v]) => `${project} (${v.count} chunks)`)
  if (centroids.length < 2) {
    return {
      content: `Not enough indexed creative material to compare (${centroids.length} project(s) with ≥${MIN_CHUNKS} chunks${scope === 'internal' ? ', external excluded by the firewall' : ''}).`,
      label: 'Compared projects — not enough material',
    }
  }
  const pairs: Array<{ a: string; b: string; similarity: number }> = []
  for (let i = 0; i < centroids.length; i++) {
    for (let j = i + 1; j < centroids.length; j++) {
      pairs.push({
        a: centroids[i].project,
        b: centroids[j].project,
        similarity: Number(cosineSimilarity(centroids[i].centroid, centroids[j].centroid).toFixed(4)),
      })
    }
  }
  pairs.sort((a, b) => b.similarity - a.similarity)
  const payload = {
    scope: scope === 'internal' ? 'internal only (firewall active)' : 'all material, external marked',
    projects: centroids.map((c) => ({ project: c.project, origin: c.origin, chunks: c.count })),
    pairs: pairs.slice(0, args.top ?? 5),
    ...(skipped.length > 0 ? { skippedTooLittleMaterial: skipped } : {}),
  }
  return {
    content: JSON.stringify(payload),
    label: `Compared ${centroids.length} projects by embedded material${scope === 'internal' ? ' (internal only)' : ''}`,
  }
}

function toolSearchVault(input: unknown): SlateToolOutcome {
  const args = SearchVaultSchema.parse(input)
  const engine = getBrainEngine()
  if (!engine || !engine.isReady()) {
    return {
      content: 'The vault brain is not available on this host.',
      label: 'Vault search unavailable',
    }
  }
  const results = engine.search(args.query, args.limit ?? 6)
  const payload = results.map((r) => ({
    path: r.path,
    title: r.title,
    folder: r.folder,
    snippet: r.snippet,
    modifiedAt: r.modifiedAt,
  }))
  return {
    content: JSON.stringify(payload),
    label: `Searched the vault for "${args.query}" — ${results.length} note(s)`,
  }
}

export async function executeSlateChatTool(name: string, input: unknown): Promise<SlateToolOutcome> {
  switch (name) {
    case 'search_slate':
      return toolSearchSlate(input)
    case 'read_material':
      return toolReadMaterial(input)
    case 'draft_structure':
      return toolDraftStructure(input)
    case 'compare_projects':
      return toolCompareProjects(input)
    case 'search_vault':
      return toolSearchVault(input)
    default:
      return { content: `Unknown tool: ${name}`, label: `Unknown tool ${name}` }
  }
}

// ── The chat loop ─────────────────────────────────────────────────────────

export function buildSlateChatSystem(projects: SlateProject[], now: Date): string {
  return `You are the development brain of DEVELOPMENT-HELL — the development-slate command center Billy Rovzar (producer, Lemon Studios) runs his slate from. You sit over the whole slate: every project's metadata is below, and your tools search and read the actual material — drafts, treatments, outlines, ideas, coverage, notes, in Spanish and English.

## What you are for
Development-executive questions across the slate: comparing projects, finding material by what's inside it, structural script analysis (act breaks, weak stretches, character work), staleness and momentum, packaging and pitching angles, plain status.

## Ground rules
- ANSWER FROM EVIDENCE. Metadata questions (stage, staleness, waiting-on, targets, priority, drafts on file) are answered from SLATE STATE below — do that math directly, no tools needed. Content judgments REQUIRE reading: search_slate to locate, draft_structure + read_material to actually read before judging a script. Never assess material you have not retrieved. Never invent projects, people, titles or content — if the slate doesn't hold the answer, say so plainly.
- THE EXTERNAL FIREWALL (hard rule, spec §7). Projects marked EXTERNAL are other people's submissions. Status questions may include them — always labeled [EXTERNAL]. Creative work — brainstorming, comparing ideas, finding something of Billy's to pitch or send out, rewrite thinking — must not draw on external material: use purpose="creative", which excludes it at the retrieval layer. Set include_external=true only when Billy explicitly asks about external material. Whenever external material appears in an answer, tag it [EXTERNAL].
- BILINGUAL SLATE: material mixes Spanish and English; search crosses both. Answer in English, quote material in its original language.
- CITE YOUR BASIS: name projects as Title (SLUG); when you read material, say which file/scenes you sampled. If a judgment rests on a partial read, say what you sampled.
- Be a sharp development exec: direct, specific, willing to rank and pick when the material supports it, plain about thin evidence when it doesn't.

## Today
${now.toISOString().slice(0, 10)} — staleness figures in SLATE STATE are computed against today.

## SLATE STATE (live, verified)
${buildSlateStateBlock(projects, now)}`
}

export interface SlateChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export type SlateChatEmit = (event: Record<string, unknown>) => void

const MAX_ROUNDS = 6

/**
 * Streamed agentic loop, mirroring the Billy Drawer chat: stream text
 * tokens, execute tools between rounds, surface every tool call to the UI.
 * Callers own the transport — `emit` writes one SSE event.
 */
export async function runSlateChat(
  message: string,
  history: SlateChatTurn[],
  emit: SlateChatEmit,
): Promise<void> {
  const projects = await listSlateProjects()
  const system = buildSlateChatSystem(projects, new Date())

  const messages: Anthropic.MessageParam[] = [
    ...history.map((t) => ({ role: t.role, content: t.text }) as Anthropic.MessageParam),
    { role: 'user', content: message },
  ]

  const anthropic = getAnthropicClient()
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const stream = anthropic.messages.stream({
      model: CLAUDE_MODELS.smart,
      max_tokens: 2000,
      system,
      tools: SLATE_CHAT_TOOLS,
      messages,
    })

    stream.on('text', (text: string) => emit({ type: 'token', text }))

    const final = await stream.finalMessage()
    if (final.stop_reason !== 'tool_use') break

    messages.push({ role: 'assistant', content: final.content })
    const results: Anthropic.ToolResultBlockParam[] = []
    for (const block of final.content) {
      if (block.type !== 'tool_use') continue
      let outcome: SlateToolOutcome
      try {
        outcome = await executeSlateChatTool(block.name, block.input)
      } catch (err) {
        outcome = {
          content: `Tool failed: ${(err as Error).message}`,
          label: `${block.name} failed`,
        }
      }
      emit({ type: 'tool', name: block.name, label: outcome.label })
      results.push({ type: 'tool_result', tool_use_id: block.id, content: outcome.content })
    }
    messages.push({ role: 'user', content: results })
  }
}
