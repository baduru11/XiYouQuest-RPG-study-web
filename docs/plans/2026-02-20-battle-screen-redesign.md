# Battle Screen Redesign — Side-View RPG Layout

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the main quest battle screen from a flat quiz overlay into a classic side-view JRPG battle layout with visible character sprites, boss sprites, attack animations, and visual feedback effects.

**Branch:** `feat/main-quest-rpg` (existing)

---

## Design Overview

The battle screen splits into two zones:
- **Battle Arena (top ~60%):** Stage background, party sprites on left, boss sprite on right, HP indicators floating above each side.
- **Action Panel (bottom ~40%):** Semi-transparent dark panel containing MCQ or recording UI.

The current top-bar HUD (`BattleHUD`) is replaced by in-arena floating HP indicators.

---

## Battle Arena Layout

```
┌──────────────────────────────────────────────┐
│              [Stage Background]               │
│                                               │
│    ♥♥♥♥♥                    Boss Name         │
│    (hearts)               [Boss HP bar ████░] │
│                                               │
│  🧑 Party     ←  gap  →        👹 Boss       │
│  (bottom-left)              (bottom-right)    │
│                                               │
│  ═══ "YOUR TURN — ATTACK!" banner ═══        │
├───────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────┐  │
│  │  Action Panel (MCQ or Recording UI)     │  │
│  │  pixel-border top edge                  │  │
│  │  bg-black/80 backdrop-blur-md           │  │
│  └─────────────────────────────────────────┘  │
└───────────────────────────────────────────────┘
```

### Arena Details
- Background: full stage image, edge-to-edge, with a subtle dark gradient at the bottom (`linear-gradient(transparent 50%, rgba(0,0,0,0.6))`) to create a ground/shadow feel.
- No overlay darkening on the background itself (unlike current `rgba(0,0,0,0.5)` overlay) — let the art breathe.

---

## Party Sprites (Left Side)

### Son Wukong (Main Fighter)
- **Size:** ~180-200px tall (desktop), ~120px (mobile)
- **Position:** Bottom-left of the arena, front-center
- **Idle:** `son wukong/1.webp` with subtle CSS breathing/bob animation (`translateY` oscillation, 2s loop, `ease-in-out`)
- **Attack frames:** `공격1.webp` → `공격2.webp` → `공격3.webp` at 333ms each (3fps)

### Unlocked Party Members (Behind Wukong)
- **Size:** ~100-120px (desktop), ~80px (mobile)
- **Position:** Staggered behind Wukong, cascading up-left (classic JRPG formation)
- **Images used:**
  - Sam Jang: `삼장 전방주시.webp`
  - Sha Wujing: `1.webp`
  - Zhu Baijie: `저팔계 전방주시.webp`
- **Idle:** Same bob animation as Wukong but with offset timing (~0.3s stagger per character) for natural movement
- **No attack animation** — they stay idle during Wukong's attack sequence

### Player HP
- Hearts float above the party formation
- Current style (filled red / empty gray) remains

---

## Boss Sprite (Right Side)

- **Size:** ~200-220px (desktop), ~140px (mobile)
- **Position:** Bottom-right of the arena
- **Idle:** Gentle floating animation (`translateY` + slight scale pulse, ~3s loop)
- **Boss HP bar:** Floats above the boss sprite, includes boss name/chinese name, colored bar (green → yellow → red)
- **Round counter:** Shown next to or below the boss HP bar

### Boss Visual Reactions
- **Takes damage (player attack lands):** Horizontal shake + brief white flash overlay
- **Attack blocked (correct MCQ):** Recoil (`translateX` away from player) + white flash
- **HP reaches 0:** Shake + fade-out dissolve before victory screen transition

---

## Attack Animation Sequence

Triggered after pronunciation recording assessment returns a score:

1. **Wukong slides forward** — `translateX` toward center (~300ms, `ease-out`)
2. **3-frame attack animation** — cycles once: `공격1` → `공격2` → `공격3` at 333ms each (~1s total)
3. **Impact** — white flash overlay on boss + horizontal shake + floating damage text (score or "HIT!") pops up and fades
4. **Boss HP bar** — animates down smoothly (`transition-all duration-500`)
5. **Wukong slides back** — returns to original position (~300ms, `ease-in`)
6. **Total sequence:** ~2s

### Implementation
- Use a state machine: `idle` → `dashing` → `attacking` → `impact` → `returning` → `idle`
- Attack frames are simple image swaps on an interval timer (not CSS sprite sheet)
- Floating damage number: absolute-positioned text that animates up + fades out (`translateY(-30px)` + `opacity: 0` over ~800ms)

---

## Boss Attack Phase (MCQ)

During boss attack (MCQ questions):
- Boss has idle float animation
- **Wrong answer / timeout:** Screen flashes red briefly, player sprites flinch (quick `translateX` shake), one heart empties with a shatter animation (scale down + fade + brief red pulse)
- **Correct answer (blocked):** Green shield icon flashes over party, boss recoils, "BLOCKED!" pixel text pops up and fades
- MCQ UI renders inside the bottom action panel (same styling as current, just repositioned)

---

## Action Panel (Bottom ~40%)

- Background: `bg-black/80 backdrop-blur-md`
- Top edge: `pixel-border` (only top side) for visual separation from arena
- Internal padding, scrollable if content overflows (passages)

### Boss Attack Phase Content
- Timer bar at the top of the panel
- Question counter (`Q2/5`)
- MCQ card: context, prompt, options grid (same styling as current `BossAttack`)

### Player Attack Phase Content
- "YOUR TURN — Attack!" banner at top
- Word display grid or passage text
- AudioRecorder centered below
- Retry hint controls (pinyin toggle, TTS) if applicable

---

## Turn Transition

Between phases, a brief centered banner slides in over the arena divider:
- **Player turn:** "YOUR TURN — ATTACK!" in green with `pixel-glow-green`
- **Boss turn:** "ENEMY TURN — DEFEND!" in red with `pixel-glow`
- Banner fades in, holds ~0.5s, fades out as action panel content swaps

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/quest/battle-screen.tsx` | Complete rewrite: split into arena + action panel layout, add sprite rendering, attack animation state machine, visual effects |
| `src/components/quest/battle-hud.tsx` | **Delete** — replaced by in-arena floating HP indicators |
| `src/components/quest/boss-attack.tsx` | Adjust styling for action panel context (remove outer padding/bg, it inherits from panel) |
| `src/components/quest/player-attack.tsx` | Adjust styling for action panel context (same) |
| `src/lib/quest/stage-config.ts` | Add `attackFrames` array to `QUEST_CHARACTERS["Son Wukong"]` for the 3 animation frame paths |
| `src/lib/quest/types.ts` | Add `attackFrames?: string[]` to character config type if needed |

### New Components (extracted from battle-screen)
| File | Purpose |
|------|---------|
| `src/components/quest/battle-arena.tsx` | Arena zone: background, party sprites, boss sprite, floating HP |
| `src/components/quest/party-sprites.tsx` | Party formation rendering with idle bob animations |
| `src/components/quest/boss-sprite.tsx` | Boss sprite with idle float + damage reactions |
| `src/components/quest/attack-animation.tsx` | Wukong attack sequence state machine + frame cycling |
| `src/components/quest/floating-damage.tsx` | Floating damage number/text pop-up |
| `src/components/quest/turn-banner.tsx` | Turn transition banner overlay |

---

## CSS Animations Needed

```css
/* Idle breathing bob for party sprites */
@keyframes idle-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

/* Boss idle float */
@keyframes boss-float {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-8px) scale(1.02); }
}

/* Attack dash forward */
@keyframes dash-forward {
  from { transform: translateX(0); }
  to { transform: translateX(120px); }
}

/* Attack dash back */
@keyframes dash-back {
  from { transform: translateX(120px); }
  to { transform: translateX(0); }
}

/* Sprite flinch */
@keyframes flinch {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-8px); }
  75% { transform: translateX(8px); }
}

/* Boss recoil */
@keyframes recoil {
  0% { transform: translateX(0); }
  30% { transform: translateX(20px); }
  100% { transform: translateX(0); }
}

/* Floating damage text */
@keyframes float-damage {
  0% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-40px); }
}

/* Heart shatter on HP loss */
@keyframes heart-shatter {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.8; color: #ef4444; }
  100% { transform: scale(0.5); opacity: 0; }
}

/* Turn banner slide in/out */
@keyframes banner-in {
  from { opacity: 0; transform: translateY(-10px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
```

---

## Implementation Order

1. **Add attack frame paths** to `stage-config.ts` (`QUEST_CHARACTERS`)
2. **Create `party-sprites.tsx`** — party formation with idle bob
3. **Create `boss-sprite.tsx`** — boss with idle float + damage reactions
4. **Create `attack-animation.tsx`** — Wukong dash + 3-frame cycle
5. **Create `floating-damage.tsx`** — floating score/text popup
6. **Create `turn-banner.tsx`** — phase transition banner
7. **Create `battle-arena.tsx`** — compose arena with sprites, floating HP, effects
8. **Rewrite `battle-screen.tsx`** — arena + action panel layout, wire up animation triggers
9. **Adjust `boss-attack.tsx`** — strip outer wrapper (panel provides it now)
10. **Adjust `player-attack.tsx`** — strip outer wrapper
11. **Delete `battle-hud.tsx`** — no longer used
12. **Add CSS animations** to `globals.css` or inline styles
