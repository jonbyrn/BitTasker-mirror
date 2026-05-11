---
name: frontend-design
description: 'Create distinctive, production-grade frontend interfaces. Use when building web components, pages, or applications. Avoids generic AI aesthetics.'
---

# Frontend Design

Create distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

## Design Thinking

Before coding, commit to a BOLD aesthetic direction:

- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme — brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, industrial/utilitarian
- **Constraints**: Technical requirements (framework, performance, accessibility)
- **Differentiation**: What makes this UNFORGETTABLE?

Execute with precision. Bold maximalism and refined minimalism both work — the key is intentionality.

## Guidelines

- **Typography**: Choose distinctive fonts. Avoid Arial, Inter, Roboto. Pair a display font with a refined body font
- **Color & Theme**: Commit to a cohesive palette. Use CSS variables. Dominant colors with sharp accents outperform timid palettes
- **Motion**: Use animations for effects and micro-interactions. Focus on high-impact moments — staggered reveals, scroll-triggering, hover surprises
- **Spatial Composition**: Unexpected layouts, asymmetry, overlap, generous negative space OR controlled density
- **Backgrounds**: Create atmosphere with gradient meshes, noise textures, geometric patterns, layered transparencies

## BitTasker Rules

- **Use daisyUI + Tailwind CSS 4** as the foundation — don't introduce inline styles
- **Match existing patterns** in `src/lib/components/` — consistency over novelty
- **All components are client-only** (Capacitor) — no SSR concerns
- **Every user-visible string must use `$t()`** — see `/bittasker-i18n`
- **Run `npm run storybook`** to browse existing components before designing new ones
