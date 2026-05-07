import type { SeedsData } from './types'

export const seeds: SeedsData = {
  isDemo: true,

  tasks: [
    {
      id: 'seed-t1',
      title: 'Review Creel.mx deal memo',
      bucket: 'now',
      done: false,
      createdAt: '2026-04-28T08:00:00Z',
      updatedAt: '2026-04-28T08:00:00Z',
      source: 'email',
      linkedEmailId: 'seed-th1',
    },
    {
      id: 'seed-t2',
      title: 'Approve festival strategy for Morena Films co-prod',
      bucket: 'now',
      done: false,
      createdAt: '2026-04-28T08:00:00Z',
      updatedAt: '2026-04-28T08:00:00Z',
      source: 'morning-brief',
    },
    {
      id: 'seed-t3',
      title: 'Send updated deck to Apple Films contact',
      bucket: 'next',
      done: false,
      createdAt: '2026-04-28T08:00:00Z',
      updatedAt: '2026-04-28T08:00:00Z',
      source: 'manual',
    },
    {
      id: 'seed-t4',
      title: 'Review Q2 budget with CFO',
      bucket: 'next',
      done: false,
      createdAt: '2026-04-28T08:00:00Z',
      updatedAt: '2026-04-28T08:00:00Z',
      source: 'meeting',
    },
    {
      id: 'seed-t5',
      title: 'Explore streaming deal with GBM Sports',
      bucket: 'orbit',
      done: false,
      createdAt: '2026-04-27T08:00:00Z',
      updatedAt: '2026-04-27T08:00:00Z',
      source: 'manual',
    },
    {
      id: 'seed-t6',
      title: 'Research Cannes co-production opportunities',
      bucket: 'orbit',
      done: false,
      createdAt: '2026-04-26T08:00:00Z',
      updatedAt: '2026-04-26T08:00:00Z',
      source: 'manual',
    },
  ],

  decisions: [
    {
      id: 'seed-d1',
      text: 'Going with Onza Films for North America distribution rights.',
      ts: '2026-04-27T15:30:00Z',
      updatedAt: '2026-04-27T15:30:00Z',
      tags: ['distribution', 'deal'],
      outcome: 'made',
    },
    {
      id: 'seed-d2',
      text: 'Deferred the GBM partnership conversation until Q3 revenue is clearer.',
      ts: '2026-04-25T11:00:00Z',
      updatedAt: '2026-04-25T11:00:00Z',
      tags: ['partnership'],
      outcome: 'deferred',
    },
    {
      id: 'seed-d3',
      text: 'Hiring a dedicated post-production supervisor for the next project cycle.',
      ts: '2026-04-23T09:00:00Z',
      updatedAt: '2026-04-23T09:00:00Z',
      tags: ['hiring', 'production'],
      outcome: 'made',
    },
    {
      id: 'seed-d4',
      text: 'Using Anthropic Claude for all AI voice and research tools in the dashboard.',
      ts: '2026-04-20T14:00:00Z',
      updatedAt: '2026-04-20T14:00:00Z',
      tags: ['technology', 'ai'],
      outcome: 'made',
    },
  ],

  brief: {
    jarvis:
      'Good morning, Billy. You have three high-priority items requiring attention today. The Creel.mx deal memo landed overnight — Mirna Alvarado is waiting on your notes before the afternoon call. The Apple Films connection followed up on the deck; Tyler Gould wants revisions by EOD. Your Morena Films co-production letter of intent needs signature before Friday. On the finance side, Q1 wrapped 8% above projection — congratulations. Two required meetings today: 10am internal creative review, 3pm Andersen call. Recommend tackling the Creel memo first.',
    billy:
      "Morning. Looks like the deals are heating up — Creel and Apple both need responses today. The good news is Q1 closed strong so you have leverage going into the Andersen call. I'd block 90 minutes this morning for deep work before the 10am, knock out the Creel notes and get the Apple deck revision done. The Morena LOI is straightforward, schedule 15 minutes before 3pm. You're in a strong position right now — use it.",
  },

  threads: [
    {
      id: 'seed-th1',
      subject: 'Re: Project collaboration — deal memo attached',
      from: 'Mirna Alvarado',
      fromDomain: 'creel.mx',
      snippet: 'Hi Billy, please find the updated deal memo attached. Looking forward to your notes before the call...',
      unread: true,
      receivedAt: '2026-04-28T02:14:00Z',
      tag: 'DEAL',
      priority: 'HOT',
    },
    {
      id: 'seed-th2',
      subject: 'Deck revisions needed — Apple partnership',
      from: 'Tyler Gould',
      fromDomain: 'apple.com',
      snippet: 'Billy, we need the updated slides by end of day. The committee meets Thursday...',
      unread: true,
      receivedAt: '2026-04-28T07:30:00Z',
      tag: 'DEAL',
      priority: 'HOT',
    },
    {
      id: 'seed-th3',
      subject: 'LOI signature — Morena co-production',
      from: 'Rene Cardona',
      fromDomain: 'morenafilms.com',
      snippet: 'Dear Billy, the letter of intent is ready for your signature...',
      unread: false,
      receivedAt: '2026-04-27T18:00:00Z',
      tag: 'DEAL',
      priority: 'MED',
    },
    {
      id: 'seed-th4',
      subject: 'Creative review agenda — today 10am',
      from: 'Ana Torres',
      fromDomain: 'lemonfilms.com',
      snippet: "Team, here is the agenda for this morning's review...",
      unread: false,
      receivedAt: '2026-04-28T08:00:00Z',
      tag: 'INT',
      priority: 'MED',
    },
    {
      id: 'seed-th5',
      subject: 'Q1 financial summary — final numbers',
      from: 'Finance Team',
      fromDomain: 'lemonfilms.com',
      snippet: 'Hi Billy, please find the Q1 summary. Overall revenue was 8% above projection...',
      unread: false,
      receivedAt: '2026-04-27T16:00:00Z',
      tag: 'INT',
      priority: 'LOW',
    },
    {
      id: 'seed-th6',
      subject: 'CANACINE annual conference — call for speakers',
      from: 'CANACINE',
      fromDomain: 'canacine.org.mx',
      snippet: 'Estimado Sr. Rovzar, nos complace invitarle a participar como ponente...',
      unread: false,
      receivedAt: '2026-04-26T10:00:00Z',
      tag: 'INDUSTRY',
      priority: 'LOW',
    },
    {
      id: 'seed-th7',
      subject: 'Anthropic API — your April usage summary',
      from: 'Anthropic',
      fromDomain: 'anthropic.com',
      snippet: 'Your monthly usage report for the CEO Dashboard project...',
      unread: false,
      receivedAt: '2026-04-27T09:00:00Z',
      tag: 'INFO',
      priority: 'LOW',
    },
    {
      id: 'seed-th8',
      subject: 'Re: Andersen call prep — 3pm today',
      from: 'Santiago de la Rica',
      fromDomain: 'andersen.com',
      snippet: 'Billy, confirming 3pm. Please review the attached term sheet before we speak...',
      unread: true,
      receivedAt: '2026-04-28T06:45:00Z',
      tag: 'DEAL',
      priority: 'HOT',
    },
    {
      id: 'seed-th9',
      subject: 'GBM Sports streaming proposal',
      from: 'Bernardo Gomez',
      fromDomain: 'gbm.com',
      snippet: 'Billy, we have put together a streaming partnership proposal...',
      unread: false,
      receivedAt: '2026-04-25T14:00:00Z',
      tag: 'DEAL',
      priority: 'MED',
    },
    {
      id: 'seed-th10',
      subject: 'Black List weekly digest',
      from: 'The Black List',
      fromDomain: 'theblacklist.com',
      snippet: "This week's top scripts on the Black List...",
      unread: false,
      receivedAt: '2026-04-28T06:00:00Z',
      tag: 'INFO',
      priority: 'LOW',
    },
  ],

  meetings: [
    {
      id: 'seed-m1',
      title: 'Internal Creative Review',
      start: '2026-04-28T16:00:00Z',
      end: '2026-04-28T17:00:00Z',
      attendees: ['billy@lemonfilms.com', 'ana@lemonfilms.com', 'team@lemonfilms.com'],
      isRequired: true,
      description: 'Q2 slate review and current project status',
    },
    {
      id: 'seed-m2',
      title: 'Andersen Partnership Call',
      start: '2026-04-28T21:00:00Z',
      end: '2026-04-28T22:00:00Z',
      attendees: ['billy@lemonfilms.com', 'santiago@andersen.com'],
      isRequired: true,
      meetLink: 'https://meet.google.com/abc-defg-hij',
      description: 'Review term sheet and next steps for the Andersen co-production deal',
    },
    {
      id: 'seed-m3',
      title: 'Team Standup',
      start: '2026-04-28T14:00:00Z',
      end: '2026-04-28T14:15:00Z',
      attendees: ['billy@lemonfilms.com', 'team@lemonfilms.com'],
      isRequired: false,
    },
  ],

  notionBlocks: [
    { id: 'seed-nb1', type: 'heading_2', text: 'Active Deals', toneDot: 'hot' },
    { id: 'seed-nb2', type: 'bulleted_list_item', text: 'Creel.mx — deal memo in review, call today', toneDot: 'hot' },
    { id: 'seed-nb3', type: 'bulleted_list_item', text: 'Apple Films — deck revisions needed by EOD', toneDot: 'hot' },
    { id: 'seed-nb4', type: 'heading_2', text: 'Active Projects', toneDot: 'active' },
    { id: 'seed-nb5', type: 'bulleted_list_item', text: 'Morena co-production — LOI signing this week', toneDot: 'active' },
    { id: 'seed-nb6', type: 'bulleted_list_item', text: 'Q2 slate — 3 projects in development', toneDot: 'active' },
    { id: 'seed-nb7', type: 'heading_2', text: 'Watching', toneDot: 'cool' },
    { id: 'seed-nb8', type: 'bulleted_list_item', text: 'GBM Sports streaming proposal — Q3 decision', toneDot: 'cool' },
  ],

  spark:
    'What would the Lemon Studios version of A24 look like in Mexico — what is the one greenlight that would change everything about how the industry sees us?',

  captures: [
    {
      id: 'seed-cap1',
      text: 'Call Mirna about updated deal terms',
      kind: 'todo',
      createdAt: '2026-04-28T09:30:00Z',
    },
    {
      id: 'seed-cap2',
      text: 'What if we packaged the Apple pitch as a series instead of a feature?',
      kind: 'idea',
      createdAt: '2026-04-28T10:15:00Z',
    },
    {
      id: 'seed-cap3',
      text: 'Crisanto handle the CANACINE speaker confirmation',
      kind: 'delegate',
      createdAt: '2026-04-28T11:00:00Z',
    },
  ],
}

// Demo overview and oneThing for the new brief format
seeds.brief.overview = [
  {
    text: '**Creel.mx deal memo** landed overnight — Mirna awaits your notes before the afternoon call.',
    citations: [{ sourceType: 'gmail', sourceId: 'seed-th1', snippet: 'Please find the updated deal memo attached. Looking forward to your notes...', confidence: 'high' }],
  },
  {
    text: '**Apple Films** deck revisions needed by EOD — committee meets Thursday.',
    citations: [{ sourceType: 'gmail', sourceId: 'seed-th2', snippet: 'We need the updated slides by end of day. The committee meets Thursday...', confidence: 'high' }],
  },
  {
    text: '**Morena co-production** LOI needs signature before Friday.',
    citations: [{ sourceType: 'gmail', sourceId: 'seed-th3', snippet: 'The letter of intent is ready for your signature...', confidence: 'high' }],
  },
  {
    text: 'Q1 closed **8% above projection** — you have leverage for the Andersen call.',
    citations: [{ sourceType: 'gmail', sourceId: 'seed-th5', snippet: 'Q1 summary. Overall revenue was 8% above projection...', confidence: 'high' }],
  },
  {
    text: 'Two required meetings: *10am creative review*, *3pm Andersen call*.',
    citations: [
      { sourceType: 'calendar', sourceId: 'seed-m1', snippet: 'Internal Creative Review — 10:00 AM', confidence: 'high' },
      { sourceType: 'calendar', sourceId: 'seed-m2', snippet: 'Andersen Partnership Call — 3:00 PM', confidence: 'high' },
    ],
  },
]

seeds.brief.oneThing = {
  text: 'Review and annotate the Creel.mx deal memo',
  why: 'Mirna is waiting on your notes before the afternoon call — this unlocks the rest of the day.',
  citations: [{ sourceType: 'gmail', sourceId: 'seed-th1', snippet: 'Please find the updated deal memo attached...', confidence: 'high' }],
}

seeds.brief.longBrief = `Good morning, Billy. The Creel deal memo is the clear priority — Mirna Alvarado is waiting on your notes before the afternoon call. Apple Films followed up on the deck; Tyler Gould wants revisions by EOD. The Morena LOI needs signature before Friday. Q1 closed 8% above projection, giving you leverage for the Andersen call at 3pm.

Morning. Looks like the deals are heating up — Creel and Apple both need responses today. I'd block 90 minutes before the 10am creative review, knock out the Creel notes and get the Apple deck revision done. The Morena LOI is straightforward, schedule 15 minutes before 3pm. You're in a strong position right now — use it.`
