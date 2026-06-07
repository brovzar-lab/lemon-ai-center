# Design System — Lemon AI Center

## Aesthetic
Warm-dark editorial. Lemon Studios brand identity. Rich chocolate-brown base, warm parchment text, lemon gold accent.

## Colors
| Token | Hex | Usage |
|-------|-----|-------|
| bg-base | #15110e | Page background |
| bg-surface | #1c1816 | Cards, panels |
| bg-elevated | #221d1a | Modals, dropdowns |
| accent-lemon | #f5d547 | Primary action, highlights |
| accent-coral | #d97757 | HOT priority, urgent |
| accent-blue | #8ab4d6 | Links, info |
| accent-sage | #a8b89a | MED priority, secondary |
| accent-rose | #c97062 | Destructive, error |
| text-primary | #f5ede2 | Body text |
| text-secondary | #c9b9a3 | Metadata, labels |
| text-tertiary | #8a7a65 | Timestamps, subdued |
| text-muted | #5a4d3f | Disabled, placeholders |
| border-soft | rgba(180,140,100,0.08) | Subtle dividers |
| border-medium | rgba(180,140,100,0.14) | Card borders |
| border-strong | rgba(200,160,110,0.22) | Active/focused borders |

## Typography
- **Display (Fraunces):** BriefPanel (19px/15px), SparkCard (italic), HeadlineNumbers
- **Body (Inter):** Everything else. 500 for labels, 400 for body, 600 for actions

## Component Patterns
- Panel: `bg-bg-surface border border-border-soft rounded-lg p-4`
- Elevated modal: `bg-bg-elevated border border-border-medium`
- Priority HOT: `accent-coral` left border (2px), lemon dot
- Priority MED: `accent-sage` left border
- Priority LOW: `text-tertiary` label
- Tone dot hot: filled `accent-coral` circle (6px)
- Tone dot active: filled `accent-lemon` circle
- Tone dot cool: outlined `border-medium` circle

## Transitions
- Cross-fade on brief update: 200ms CSS transition
- Drawer open/close: 300ms slide
- Skill launcher: 200ms scale + fade
