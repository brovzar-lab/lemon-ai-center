import { describe, expect, test } from 'vitest'
import { extractFdx, extractFountain, extractMarkdown, extractPlainText, looksLikeScreenplay } from './extract'
import { chunkExtracted } from './chunk'

const FDX = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
    <Paragraph Type="Scene Heading"><Text>INT. COCINA DE LA CASA - NOCHE</Text></Paragraph>
    <Paragraph Type="Action"><Text>MARÍA (50s) enciende un cerillo. La estufa no prende.</Text></Paragraph>
    <Paragraph Type="Character"><Text>MARÍA</Text></Paragraph>
    <Paragraph Type="Dialogue"><Text>Otra vez el gas. </Text><Text>Claro.</Text></Paragraph>
    <Paragraph Type="Scene Heading"><Text>EXT. PATIO - CONTINUOUS</Text></Paragraph>
    <Paragraph Type="Action"><Text>El tanque de gas, vacío, oxidado.</Text></Paragraph>
  </Content>
</FinalDraft>`

describe('extractFdx', () => {
  test('keeps scene boundaries and joins styled text runs', () => {
    const { blocks, screenplay } = extractFdx(FDX)
    expect(screenplay).toBe(true)
    const headings = blocks.filter((b) => b.sceneHeading).map((b) => b.text)
    expect(headings).toEqual(['INT. COCINA DE LA CASA - NOCHE', 'EXT. PATIO - CONTINUOUS'])
    expect(blocks.some((b) => b.text === 'Otra vez el gas. Claro.')).toBe(true)
  })
})

const FOUNTAIN = `Title: La Casa del Fuego
Author: María González

INT. COCINA - NOCHE

María enciende un cerillo.

MARÍA
Otra vez el gas.

EXT. PATIO - MOMENTOS DESPUÉS

El tanque vacío.

.FORZADO - UN ENCABEZADO

Texto bajo encabezado forzado.
`

describe('extractFountain', () => {
  test('skips the title page and detects INT/EXT + forced headings', () => {
    const { blocks, screenplay } = extractFountain(FOUNTAIN)
    expect(screenplay).toBe(true)
    expect(blocks[0]).toEqual({ text: 'INT. COCINA - NOCHE', sceneHeading: true })
    const headings = blocks.filter((b) => b.sceneHeading).map((b) => b.text)
    expect(headings).toEqual([
      'INT. COCINA - NOCHE',
      'EXT. PATIO - MOMENTOS DESPUÉS',
      'FORZADO - UN ENCABEZADO',
    ])
    expect(blocks.some((b) => b.text.includes('Title:'))).toBe(false)
  })
})

describe('extractPlainText / looksLikeScreenplay', () => {
  test('detects a script PDF text layer and chunks scene-aware', () => {
    const scriptText = [
      'INT. KITCHEN - NIGHT', '', 'Action line one.', '',
      'EXT. YARD - DAY', '', 'Action line two.', '',
      'INT. GARAGE - NIGHT', '', 'Action line three.',
    ].join('\n')
    expect(looksLikeScreenplay(scriptText.split('\n'))).toBe(true)
    const { blocks, screenplay } = extractPlainText(scriptText)
    expect(screenplay).toBe(true)
    expect(blocks.filter((b) => b.sceneHeading)).toHaveLength(3)
  })

  test('prose stays prose', () => {
    const { screenplay, blocks } = extractPlainText('Just some notes.\n\nSecond paragraph.')
    expect(screenplay).toBe(false)
    expect(blocks).toHaveLength(2)
  })
})

describe('extractMarkdown', () => {
  test('strips frontmatter and is never screenplay', () => {
    const { blocks, screenplay } = extractMarkdown('---\ntitle: x\n---\n\n# Notas\n\nContenido en español.')
    expect(screenplay).toBe(false)
    expect(blocks.map((b) => b.text)).toEqual(['# Notas', 'Contenido en español.'])
  })
})

describe('chunkExtracted', () => {
  test('screenplay chunks carry scene index and heading', () => {
    const chunks = chunkExtracted(extractFdx(FDX))
    expect(chunks).toHaveLength(1) // two tiny scenes merge
    expect(chunks[0].sceneIndex).toBe(1)
    expect(chunks[0].sceneHeading).toBe('INT. COCINA DE LA CASA - NOCHE')
    expect(chunks[0].text).toContain('EXT. PATIO')
  })

  test('scenes split into separate chunks once the target size is reached', () => {
    const scenes: string[] = []
    for (let i = 1; i <= 6; i++) {
      scenes.push(`INT. LUGAR ${i} - DÍA`, '', 'x'.repeat(900), '')
    }
    const chunks = chunkExtracted(extractPlainText(scenes.join('\n')))
    expect(chunks.length).toBeGreaterThanOrEqual(3)
    expect(chunks[0].sceneIndex).toBe(1)
    expect(chunks[1].sceneIndex).toBeGreaterThan(1)
  })

  test('a single oversized scene splits under the hard cap', () => {
    const text = `INT. ETERNO - NOCHE\n\n${'palabra '.repeat(1200)}`
    const chunks = chunkExtracted(extractFountain(text))
    expect(chunks.length).toBeGreaterThan(1)
    expect(Math.max(...chunks.map((c) => c.text.length))).toBeLessThanOrEqual(4800)
    expect(chunks.every((c) => c.sceneIndex === 1)).toBe(true)
  })

  test('prose packs paragraphs toward the target size', () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) => `Párrafo ${i} — ${'texto '.repeat(40)}`)
    const chunks = chunkExtracted({ screenplay: false, blocks: paragraphs.map((text) => ({ text })) })
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((c) => c.text.length <= 4800)).toBe(true)
    expect(chunks[0].sceneIndex).toBeUndefined()
  })
})
