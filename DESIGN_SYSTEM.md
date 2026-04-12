# InfernoStream — Design System & Style Guide

## Theme: Succubus / Demon Aesthetic

A dark, immersive streaming interface inspired by infernal elegance.
Mysterious, sensual, and high-end — with depth through layered shadows,
crimson blood glows, and Cinzel display typography evoking ancient power.

---

## Color Palette

### Core Backgrounds (layered abyss)
| Token             | Value     | Usage                          |
|-------------------|-----------|--------------------------------|
| `--bg`            | `#07060b` | Page background (deepest void) |
| `--bg-card`       | `#0d0b14` | Cards, panels                  |
| `--bg-elevated`   | `#13101e` | Inputs, elevated surfaces      |
| `--bg-hover`      | `#1a1628` | Hover states                   |
| `--bg-glass`      | `rgba(13,11,20,0.72)` | Glassmorphism backgrounds |

### Primary Accent — Crimson Blood
| Token             | Value               | Usage                    |
|-------------------|---------------------|--------------------------|
| `--accent`        | `#c0394d`           | CTAs, active states       |
| `--accent-hover`  | `#d4455a`           | Hover on accent elements  |
| `--accent-soft`   | `rgba(192,57,77,0.18)` | Focus rings            |
| `--accent-glow`   | `rgba(192,57,77,0.32)` | Box shadows, glows     |
| `--accent-dim`    | `rgba(192,57,77,0.08)` | Subtle tinted fills    |
| `--accent-deep`   | `#8b1a28`           | Gradient dark end         |

### Secondary — Amethyst Purple
| Token            | Value                  | Usage                   |
|------------------|------------------------|-------------------------|
| `--purple`       | `#9b59b6`              | Badges, secondary CTAs  |
| `--purple-glow`  | `rgba(155,89,182,0.28)` | Glow on purple elements |

### Tertiary — Bone Gold
| Token      | Value                  | Usage               |
|------------|------------------------|---------------------|
| `--gold`   | `#c9a96e`              | Rank #1–3, scores   |
| `--gold-glow` | `rgba(201,169,110,0.22)` | Gold shadows     |

### Text
| Token       | Value     | Usage                          |
|-------------|-----------|--------------------------------|
| `--text-1`  | `#f0eaf5` | Primary text (bone white)      |
| `--text-2`  | `#9a8faa` | Secondary / muted text         |
| `--text-3`  | `#5a5068` | Tertiary / hints               |
| `--text-4`  | `#352e42` | Disabled / placeholder-level   |

---

## Typography

### Font Stack
```css
--font-display: 'Cinzel', serif;      /* Headings, section titles, logo */
--font-body:    'Inter', sans-serif;  /* UI labels, body, cards */
--font-serif:   'Crimson Pro', serif; /* Descriptions, italic prose */
```

### Pairing Rationale
- **Cinzel** — Roman-inspired serif with architectural weight. Evokes power,
  ancient ritual, and authority. Perfect for titles that need gravitas.
- **Inter** — Neutral, highly legible. Keeps UI functional without competing
  with the display font.
- **Crimson Pro** — Elegant old-style serif for italic descriptions and lore.
  Adds literary depth to anime descriptions and taglines.

### Type Scale
| Role              | Font    | Size       | Weight | Letter-spacing |
|-------------------|---------|------------|--------|----------------|
| Hero title        | Cinzel  | clamp(28–56px) | 700 | -0.01em     |
| Section title     | Cinzel  | 14–16px    | 600    | 0.10–0.14em  |
| Logo main         | Cinzel  | 14px       | 700    | 0.12em       |
| Body / UI         | Inter   | 13–15px    | 400–600 | 0.02–0.05em |
| Descriptions      | Crimson Pro | 14–16px | 400 italic | 0em       |
| Badges / labels   | Inter   | 9–11px     | 700    | 0.06–0.18em  |

---

## Motion System (Framer Motion)

### Easing Functions
```js
// Spring — natural, organic feel for card interactions
{ type: "spring", stiffness: 400, damping: 30 }

// Smooth fast — for entrances, page transitions
ease: [0.16, 1, 0.3, 1]   // custom cubic-bezier (expo out)

// Snappy — for toggles, state changes
ease: "easeOut", duration: 0.18
```

### Entrance Animations
```jsx
// Page sections: stagger children
const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } }
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } }
};

// Usage:
<motion.div variants={containerVariants} initial="hidden" whileInView="show" viewport={{ once: true }}>
  {items.map(item => <motion.div variants={itemVariants}>{...}</motion.div>)}
</motion.div>
```

### Hover Micro-interactions
```jsx
// Card lift
whileHover={{ y: -5, scale: 1.01 }}

// Button press
whileHover={{ scale: 1.04, y: -1 }}
whileTap={{ scale: 0.97 }}

// Sidebar link slide
whileHover={{ x: 3 }}

// Nav link with shared layout
<motion.span layoutId="navline" /> // animated underline
```

### Page Transitions
```jsx
// Navbar entrance
initial={{ y: -10, opacity: 0 }}
animate={{ y: 0, opacity: 1 }}
transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}

// Content slides (search query change, tab switch)
initial={{ opacity: 0, y: 12 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0, y: -8 }}
transition={{ duration: 0.25 }}
```

---

## Component Patterns

### Glass Card
```css
.glass {
  background: rgba(13,11,20,0.72);
  backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid rgba(180,60,90,0.16);
}
```

### Blood Glow Button
```css
.btn-primary {
  background: linear-gradient(135deg, #c0394d 0%, #8b1a28 100%);
  box-shadow: 0 4px 20px rgba(192,57,77,0.32), 0 0 60px rgba(192,57,77,0.12);
}
.btn-primary::before {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 60%);
}
```

### Active accent line pattern
```css
/* Vertical bar before section titles */
.titleAccent {
  width: 3px; height: 18–20px;
  background: linear-gradient(to bottom, #c0394d, #9b59b6);
  border-radius: 99px;
  box-shadow: 0 0 8px rgba(192,57,77,0.32);
}
```

---

## Unique Micro-interactions

### 1. Ember Particle System (SpotlightBanner)
Floating glowing particles that rise from the bottom of the hero — like embers
from a demonic flame. Each particle uses independent Framer Motion `animate`
cycles with varied durations and delays. Zero JS overhead when offscreen.

### 2. Shared Layout Nav Indicator (`layoutId="navline"`)
The active route underline slides smoothly between nav items using Framer
Motion's shared layout animation — a single element morphing position rather
than fading in/out. Feels incredibly polished with zero extra state.

### 3. Blood Glow Card Reveal
On `AnimeCard` hover, a crimson gradient overlay fades up from the poster
bottom while the play button rises with a scale + translate entrance.
The card border simultaneously animates to a blood-red glow — three
coordinated micro-animations via `variants` mode.

### 4. Staggered Grid Entrance
Using `whileInView` + `staggerChildren: 0.04s` on `Section` and `BrowseClient`
grids. Cards cascade into view as the user scrolls, triggered once
(`viewport={{ once: true }}`). Creates the feeling of the abyss being revealed
as you descend.

### 5. Cinematic Hero Crossfade
Banner background images crossfade with `AnimatePresence` + `mode="sync"`,
scale from 1.04 → 1.0 during entrance to simulate a slow camera push, and
fade out when changing. The content slides in from the direction of navigation
(left/right based on `dir` state).

### 6. Tab Content Motion
Detail page tabs use `AnimatePresence mode="wait"` — the old content fades
and drops out before new content rises in. Clean, cinematic, never jarring.

---

## UX Improvements

| Area | Change | Impact |
|---|---|---|
| Hero layout | Thumbnail strip moves to side, freeing full-width for title | More immersive, less cluttered |
| Nav | Animated shared layout indicator | Feels engineered, not just styled |
| Card grid | `whileInView` stagger | Pages feel alive as user scrolls |
| Detail page | Tab system (Episodes/Characters/Details) | Removes wall of content |
| Browse | Sidebar genre grid + mobile collapse toggle | Filters accessible without leaving page |
| Search | Quick suggestion pills + empty state illustration | Guides confused users |
| Typography | Cinzel for all section headings | Coherent, distinctive brand voice |
| Footer | Crysoline direct ping (no Vercel function) | Saves invocations, still shows live status |

---

## package.json additions required

```json
{
  "dependencies": {
    "framer-motion": "^11.0.0"
  }
}
```

Install: `npm install framer-motion`

All animations use Framer Motion v11 API (`motion.div`, `AnimatePresence`,
`useMotionValue`, `layoutId`). No other animation library is needed.
