---
name: lemon-coverage
description: Development executive coverage tool for screenplay analysis with Mexican market focus. Triggers when user uploads a screenplay (PDF or Word) and asks for coverage, analysis, greenlight assessment, development notes, or evaluation. Performs two-pass analysis (gut reaction + analytical breakdown), generates traditional coverage top sheet with RECOMMEND/CONSIDER/PASS verdict, plus separate deliverables for character analysis (Enneagram + Mexican casting), structure notes (Story Grid + Save the Cat), theme pass, marketing/title ideas, and budget top sheet with line-item estimates in MXN. Evaluates commercial viability, genre effectiveness (comedy/horror priority), high-concept marketability, and cast attachability for the Mexican theatrical market.
---

# Lemon Coverage

Development executive coverage tool for Lemon Studios. Analyzes screenplays for greenlight decisions with Mexican market lens.

## Workflow

### Pass 1: The Read (Gut Reaction)

Read the screenplay as an audience member would experience it. Note:
- Where you felt engaged vs. where attention drifted
- Emotional peaks and valleys
- Moments of surprise or predictability
- Overall "watchability" — would you recommend this to a friend?
- First impressions of tone, genre execution, and commercial appeal

Output: 2-3 paragraph reader's reaction capturing the experience of watching this as a film.

### Pass 2: Analytical Breakdown

Re-examine the screenplay through professional lenses. This pass generates the separate deliverables.

## Deliverables

Generate each as a separate document:

### 1. Coverage Top Sheet (coverage-topsheet.md)

Traditional coverage format:

```
TITLE: [Title]
WRITER: [Name]
GENRE: [External/Internal genres]
PAGES: [Count]
DRAFT DATE: [If available]

LOGLINE: [1-2 sentences max]

COMPARABLE FILMS: [2-3 titles with brief box office/reception note]

BUDGET TIER: Bajo (<6M MXN) | Medio (~40M MXN) | Alto (>80M MXN)

VERDICT: RECOMMEND | CONSIDER | PASS

---

SYNOPSIS
[One page max. Focus on story engine, not plot details.]

---

READER'S REACTION
[From Pass 1]

---

STRENGTHS
• [Specific, not generic praise]
• [Quote memorable dialogue or describe standout scenes]

CONCERNS  
• [Specific problems with clear diagnosis]
• [What's preventing this from being a RECOMMEND?]

---

COMMERCIAL ASSESSMENT
- High Concept: [Yes/No + why]
- Target Audience: [Specific demographic]
- Genre Execution: [How well does it deliver genre goods?]
- Cast Attachability: [Easy/Medium/Hard + reasoning]
- Platform Fit: [Theatrical / Streaming / Both]
```

### 2. Character Pass (character-pass.md)

For each major character, provide:

**Enneagram Analysis** (invoke story-room methodology from `/mnt/skills/user/story-room/references/enneagram.md`):
- Core type + wing
- Moral blind spot
- Immoral effect (how it hurts others on page)
- Evolution vs. de-evolution path
- Arc assessment: Does transformation feel earned?

**Character Arc Tracking**:
- Starting state
- Key turning points
- Landing state
- Connection to theme

**Mexican Casting Suggestions**:
- 2-3 actors per major role
- Prioritize Mexican talent, then Colombian/Spanish if needed
- Include brief rationale (type, range, recent work, star power)
- Use web search to verify current relevance and availability
- Note: For leads in Bajo/Medio budget, consider rising talent. For Alto, consider established names.

### 3. Structure Pass (structure-pass.md)

**Story Grid Analysis** (invoke story-grid-expert methodology from `/mnt/skills/user/story-grid-expert/SKILL.md`):
- Six Core Questions answered
- Five Commandments at global level
- Genre conventions and obligatory scenes checklist
- Value progression assessment
- A Story vs B Story interplay

**Save the Cat Analysis** (invoke story-room methodology from `/mnt/skills/user/story-room/references/save-the-cat.md`):
- 15-beat sheet with page numbers
- Identify missing or weak beats
- Pacing assessment

**Structure Notes**:
- Specific, actionable fixes
- Prioritized by impact (what would most improve the script?)
- Include page references

### 4. Theme Pass (theme-pass.md)

- Controlling idea / thematic statement
- How theme manifests through:
  - Protagonist's arc
  - Antagonist's counter-argument
  - Supporting characters' variations
  - Visual/dialogue motifs
- Assessment: Is theme clear? Muddled? Heavy-handed? Absent?
- Notes to strengthen thematic coherence

### 5. Marketing Pass (marketing-pass.md)

**Title Assessment**:
- Does it work in Spanish? In English for international?
- Memorability, searchability, genre signaling
- Alternative title suggestions if needed

**Marketing Angles**:
- Primary hook for trailer/poster
- Secondary hooks
- Social media pitch (1 sentence)
- Festival strategy (if applicable)

**Audience Building Ideas**:
- Out-of-the-box promotional concepts
- Partnership opportunities (brands, influencers, cultural events)
- Community/grassroots approaches
- Digital-first strategies

### 6. Budget Top Sheet (budget-topsheet.md)

Line-item estimate in MXN. See `references/budget-categories.md` for standard categories.

Format:
```
BUDGET TOP SHEET
[Title]
Budget Tier: [Bajo/Medio/Alto]
Estimated Total: $X,XXX,XXX MXN

ABOVE THE LINE
- Story/Script:           $XXX,XXX
- Producer(s):            $XXX,XXX
- Director:               $XXX,XXX
- Principal Cast:         $XXX,XXX
Subtotal ATL:             $XXX,XXX

BELOW THE LINE - PRODUCTION
- Production Staff:       $XXX,XXX
- Camera:                 $XXX,XXX
- Sound:                  $XXX,XXX
- Art Department:         $XXX,XXX
- Wardrobe/Makeup:        $XXX,XXX
- Locations:              $XXX,XXX
- Transportation:         $XXX,XXX
- Equipment Rentals:      $XXX,XXX
Subtotal Production:      $XXX,XXX

BELOW THE LINE - POST
- Editing:                $XXX,XXX
- VFX:                    $XXX,XXX
- Music/Score:            $XXX,XXX
- Sound Post:             $XXX,XXX
- Color/DCP:              $XXX,XXX
Subtotal Post:            $XXX,XXX

OTHER
- Insurance:              $XXX,XXX
- Legal:                  $XXX,XXX
- Contingency (10%):      $XXX,XXX
Subtotal Other:           $XXX,XXX

GRAND TOTAL:              $X,XXX,XXX MXN

SHOOTING DAYS: [Estimate]
KEY BUDGET DRIVERS: [What makes this expensive/cheap]
COST REDUCTION OPTIONS: [If budget needs trimming]
```

Base estimates on:
- Number of locations (practical vs. built)
- Cast size (speaking roles, extras)
- Period/contemporary
- VFX requirements
- Stunts/action sequences
- Night shoots
- Location complexity (CDMX vs. remote)

## Greenlight Criteria

Factors that push toward RECOMMEND:
- Strong high concept (can explain in one sentence)
- Comedy or horror genre with fresh execution
- Clear target audience with theatrical appetite
- Cast-attachable roles (2-3 meaty parts for stars)
- Manageable budget for expected returns
- Festival potential + commercial appeal

Factors that push toward PASS:
- Unclear genre or muddled tone
- Passive protagonist / weak engine
- Concept requires explanation
- No clear audience
- Budget/scope mismatch with commercial potential
- Similar film flopped recently

CONSIDER = Has potential but needs development work to reach RECOMMEND.

## Tone

Write like a development executive who respects the craft — direct, specific, no fluff. Challenge weak choices. Celebrate strong ones. Always explain *why* something works or doesn't.

The goal is to give the producer (Billy) everything needed to make a greenlight decision and, if proceeding, a roadmap for development.
