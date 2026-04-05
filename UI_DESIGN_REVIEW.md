# CricScore — UI/UX Design Review

*Generated: 2026-04-05 | Audited: Web (React + Tailwind) + Mobile (Expo + NativeWind)*

## Verdict: Strong Foundation, Critical Gaps in Scoring UX

**Design system maturity: 5/10** — Good color tokens, no component library.
**Scoring UX: 4/10** — Functional but missing critical context that scorers need.
**Accessibility: 1/10** — Zero ARIA labels, zero accessibilityLabel props.
**Mobile parity: 6/10** — Mobile scoring pad is actually better laid out than web.

---

## 1. CRITICAL ISSUES (Must Fix)

### 1.1 Scoring Page Missing Essential Context

The scoring page is the **core product screen** — it's where users spend 95% of their time. Currently missing:

| Missing Element | Why It Matters |
|----------------|---------------|
| **Current batsmen names + stats** | Scorer needs to see who's on strike (runs/balls/SR) |
| **Current bowler name + figures** | Need O-M-R-W visible while scoring |
| **"This Over" ball-by-ball display** | Must see current over progression at a glance |
| **Partnership info** | Runs/balls since last wicket — critical for commentary |
| **Last wicket info** | Who fell, how, at what score |
| **Required run rate** (chases) | CRR exists but RRR is missing |
| **Batsman on strike indicator** | No visual distinction between striker/non-striker |

**The mobile app already has batsmen cards, bowler figures, and "This Over" — the web app doesn't.** Web should match mobile's information density.

### 1.2 Button Layout Problems (Web)

Current web layout is a `grid-cols-4` grid:
```
[ 0 ] [ 1 ] [ 2 ] [ 3 ]
[ 4 ] [ 5 ] [ 6 ] [ W ]
```

**Issues:**
- **320px screens**: 4 columns = ~72px per button after padding. Below the 80px minimum for fast tapping during live scoring
- **5 is rarely used**: Takes prime real estate. In T20 cricket, 5-run deliveries are extremely rare
- **Wicket buried in the grid**: W should be visually distinct and separate — it's a fundamentally different action (destructive)
- **No haptic/visual feedback**: No animation or tactile confirmation on tap

**Recommended layout** (based on CricHeroes/CricClubs research):
```
     [ 0 ]  [ 1 ]  [ 2 ]  [ 3 ]
     [ 4 ]  [ 6 ]  [  WICKET  ]
```
- 3x2 grid for runs (drop 5, it can be extras + runs)
- Wicket gets full-width red button below the grid
- Minimum 88px height per button (Google Material Design touch target)

### 1.3 Extras Mode is Confusing

Current: Toggle strip with 5 buttons (Normal / Wide / No Ball / Bye / Leg Bye) that sets a mode, then you tap a run button.

**Problems:**
- **Two-step process**: Users forget they're in "Wide" mode and accidentally score normal deliveries as wides
- **No visual persistence**: The active extra type isn't prominent enough
- **Mode gets stuck**: If you tap Wide, score the wide, the mode doesn't auto-reset to Normal

**Recommended approach:**
- Extras as **modifier buttons** that visually lock on (like Shift key) with strong color change
- Auto-reset to Normal after each delivery
- Or: dedicated Wide+1 / NB+1 quick buttons (most common extras) alongside the modifier approach

### 1.4 Zero Accessibility

| Platform | Issue |
|----------|-------|
| Web | No `aria-label` on any button, no `role` attributes, no `sr-only` text |
| Web | Wicket modal has no focus trap — keyboard users can't dismiss it |
| Web | Color-only information (ball types distinguished only by color) |
| Mobile | No `accessibilityLabel` on any component |
| Mobile | Run buttons announce only numbers with no context |
| Mobile | FAB "+" button has no label |
| Both | No skip-to-content navigation |

**Minimum fix:** Add `aria-label` / `accessibilityLabel` to every interactive element. Add focus trap to modals. Add text labels alongside color coding.

---

## 2. HIGH PRIORITY ISSUES

### 2.1 No Component Library

Both platforms build everything from raw primitives + Tailwind utilities. This causes:
- **Inconsistent buttons**: 6+ different button patterns across pages
- **No loading states**: Raw `ActivityIndicator` / spinner with no skeleton screens
- **No empty states**: Blank screen when no matches exist
- **Duplicated styles**: Same card pattern reimplemented on every page

**Recommendation:** Create a shared component kit:
- `Button` (primary, secondary, danger, ghost — with loading state)
- `Card` (with header, body, footer slots)
- `Modal` (with focus trap, backdrop, animation)
- `Badge` (live, completed, scheduled)
- `BallBubble` (dot, 1-3, four, six, wicket, wide, noball, bye, legbye)
- `ScoreDisplay` (large score with wickets)
- `EmptyState` (illustration + message + CTA)
- `Skeleton` (loading placeholder)

### 2.2 Undo Isn't Prominent Enough

"Undo Last Ball" is at the bottom of the page, same visual weight as other buttons. In live scoring, **undo is the panic button** — it needs to be:
- Always visible (sticky/fixed position)
- Visually distinct (outline style, not filled)
- Confirmable (tap once to reveal, tap again to confirm — prevents accidental undo)

### 2.3 No Score Confirmation

When you tap a run button, the delivery is immediately submitted. No confirmation step means:
- Fat-finger errors go straight to the database
- No chance to add extras before submitting
- No visual feedback that the action succeeded

**Recommendation:** After tapping a run button, show a brief (1.5s) toast/snackbar: "4 runs scored" with an inline undo link. This provides both confirmation and quick undo.

### 2.4 Wicket Flow is Incomplete

Current wicket modal shows 11 dismissal types in a 2-column grid. Missing:
- **Fielder selection** (caught: who caught it?)
- **New batsman selection** (who's coming in?)
- **Runs scored on wicket delivery** (run out on second run = 1 run + wicket)
- **Crossing detection** (did batsmen cross before catch? Affects strike)

### 2.5 Match Creation UX

The create match form is a single long form. Cricket match setup is complex — it should be a **multi-step wizard**:
1. **Format** — T20, ODI, Test, Custom (with over limits, powerplay config)
2. **Teams** — Select/create teams, set playing XI
3. **Toss** — Who won, chose to bat/bowl
4. **Venue** — Ground name, city (affects stats filtering)
5. **Review** — Summary before starting

### 2.6 Dark Theme Only

The app is dark-mode only (surface-900 backgrounds). For **outdoor cricket scoring in sunlight**, dark mode is nearly invisible. Need:
- Light theme as default (or auto-detect)
- High contrast mode for outdoor use
- Theme toggle in settings

---

## 3. DESIGN SYSTEM ANALYSIS

### 3.1 What Exists (Good)

| Token | Web | Mobile | Consistent? |
|-------|-----|--------|-------------|
| Cricket colors (green/gold/red/blue/purple) | tailwind.config.js | lib/theme.ts + tailwind.config.js | YES |
| Surface scale (50-900) | tailwind.config.js | lib/theme.ts + tailwind.config.js | YES |
| Ball bubble styles | globals.css @layer | Inline className | Visually similar |
| Typography (Inter + monospace) | tailwind.config.js | System default | NO — mobile uses system font |
| Spacing scale | Tailwind default | lib/theme.ts custom | PARTIAL overlap |
| Animations | 6 custom keyframes | None | NO |

### 3.2 What's Missing

- **No design tokens package**: Colors are duplicated between web config and mobile theme
- **No typography scale**: Font sizes are ad-hoc across both platforms
- **No elevation/shadow system on mobile**: Web has glow-green/glow-gold/card shadows, mobile has none
- **No motion design language**: Web has animations, mobile has none — should both use subtle transitions
- **No iconography standard**: Web uses no icons, mobile uses Ionicons — should unify

### 3.3 Cricket Visual Language

The ball bubble system is well-designed:
- Dot = dim gray, Four = green, Six = purple, Wicket = red, Wide = gold, No-ball = orange
- This follows cricket broadcast conventions (viewers will recognize these colors)
- **Missing**: Maiden over indicator, powerplay indicator, death overs visual change

---

## 4. COMPETITIVE ANALYSIS (Key Differentiators to Target)

Based on research of CricHeroes, CricClubs, PlayCricket, and Stumps:

| Feature | CricHeroes | CricClubs | CricScore (Current) | CricScore (Target) |
|---------|-----------|-----------|--------------------|--------------------|
| Quick Match (start scoring in <30s) | YES | NO | NO | **YES** |
| Offline scoring | Partial | NO | YES (PWA) | **YES (PWA + native)** |
| Ball-by-ball with undo | YES | YES | YES | YES |
| Batsmen/bowler on screen | YES | YES | **NO (web)** | YES |
| Partnership tracking | YES | NO | Schema only | YES |
| Wagon wheel | CricHeroes Pro | NO | NO | Phase 4 |
| Live commentary | Auto-gen | Manual | Template engine | **Auto-gen** |
| Fantasy integration | NO | NO | Schema only | **YES (unique)** |

**CricScore's differentiators should be:**
1. **Offline-first** (PWA + native) — works at grounds with no signal
2. **Fantasy + local scoring** — no competitor does both
3. **Auto-generated commentary** — ML-powered, not just templates
4. **Public-by-default matches** — social/viral potential

---

## 5. STRATEGIC QUESTIONS FOR RAMSAI

Before implementing UI changes, these decisions shape everything:

### Q1: Quick Match Flow?
Should users be able to start scoring in under 30 seconds? (Skip team selection, just "Team A vs Team B", set overs, go.) CricHeroes' #1 feature is this. Gully cricket users won't fill out a full form. (that could a possibility if they want to fast track and update the names while scoring but the team selection should be recommended)

### Q2: Outdoor/Sunlight Mode?
Dark theme is unusable in direct sunlight. Do we build a light theme now, or ship dark-only for MVP? (Light theme is ~2 days of work if design tokens are properly set up.) Both themese

### Q3: Scoring Confirmation?
After tapping a run button: (a) submit immediately (fastest), (b) show confirm dialog (safest), or (c) submit immediately + show undo toast (balanced)? submit immediately and undo toast

### Q4: Component Library Approach?
(a) Build custom components from scratch (full control, more work), (b) Use headless UI (Radix/Ark for web, reusable hooks for mobile) + style with Tailwind, or (c) Use a pre-built kit (shadcn/ui for web)? Which is efficient, fast and performant. But UI should also be fuild, smooth and extremely beautiful and responsive

### Q5: Shared Design Tokens Package?
Should we create `packages/ui` with shared colors, spacing, typography that both web and mobile import? This is ~1 day of setup but ensures permanent consistency. Yes

### Q6: Animation/Motion Priority?
Should v1 have polished animations (ball submission feedback, score counter animation, page transitions) or ship functional-only and add polish in v1.1? Yes very fluid animations and transitions ideally matching the refreshrate of the screen

---

## 6. RECOMMENDED IMPLEMENTATION ORDER

### Phase A: Scoring Page Overhaul (Highest Impact)
1. Add batsmen cards (striker/non-striker with runs/balls/SR)
2. Add bowler card (name + O-M-R-W)
3. Add "This Over" ball progression display
4. Restructure run buttons (drop 5, separate Wicket)
5. Add partnership + last wicket info
6. Make Undo sticky/fixed
7. Add delivery confirmation toast

### Phase B: Design System Foundation
1. Create `packages/ui` with shared design tokens
2. Build core component kit (Button, Card, Modal, Badge, EmptyState)
3. Add light theme support
4. Unify typography and spacing scales

### Phase C: Match Creation Wizard
1. Multi-step form (Format -> Teams -> Toss -> Venue -> Review)
2. "Quick Match" shortcut (minimal fields, start in <30s)
3. Recent teams/players for fast selection

### Phase D: Accessibility Pass
1. Add aria-label / accessibilityLabel to all interactive elements
2. Add focus trap to modals
3. Add text alongside color coding (colorblind support)
4. Add keyboard navigation for web
5. Test with VoiceOver (iOS) and TalkBack (Android)

### Phase E: Polish
1. Scoring animations (ball submission, score increment, wicket shake)
2. Skeleton loading states
3. Empty states with illustrations
4. Haptic feedback on mobile (expo-haptics)

---

## 7. SCORECARD

| Dimension | Score | Key Issue |
|-----------|-------|-----------|
| **Color System** | 8/10 | Cricket-native colors, well-mapped to ball types |
| **Layout (Scoring)** | 4/10 | Missing batsmen/bowler context, button sizing |
| **Layout (Other Pages)** | 6/10 | Functional but sparse, no empty states |
| **Component Reuse** | 3/10 | No library, everything inline |
| **Accessibility** | 1/10 | Zero labels, zero focus management |
| **Mobile Parity** | 6/10 | Mobile actually ahead on scoring layout |
| **Typography** | 5/10 | Score display good, rest is ad-hoc |
| **Motion/Feedback** | 2/10 | No animations, no confirmation |
| **Outdoor Usability** | 2/10 | Dark-only, unreadable in sunlight |
| **Overall** | **4.1/10** | Good bones, needs scoring UX overhaul + accessibility |
