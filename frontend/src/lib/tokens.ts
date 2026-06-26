// Design tokens — thin JS compatibility layer over the CSS variable system.
// The canonical token definitions live in index.css (--t-* vars, Salvia system).
// Components that still use inline styles read from `palette`; new code prefers
// CSS variables directly.

export const palette = {
  mist: '#F1EBDE',       // --t-bg (sand page background)
  surface: '#FBF7EF',    // --t-surface (cream cards)
  shell: '#FEFCF7',      // --t-shell (lightest surface)
  ink: '#26302B',        // --t-text
  inkSoft: '#5E6B64',    // --t-text-soft
  line: '#E2DCCD',       // --t-line
  brand: '#3E6259',      // --t-brand (salvia)
  brandSoft: 'rgba(62, 98, 89, 0.05)', // --t-today-wash
  amber: '#D2982E',      // --t-accent (ochre)
} as const

// ── generated marker color system ────────────────────────────────
// Slots 0–3: curated originals. Slots 4+: oklch(66% 0.097 H) stepping
// through MARKER_HUES, intentionally skipping brand hues so any family
// size stays harmonious. Family (ochre) is reserved — never a person.
export const MARKER_CURATED = ['#4F7E91', '#BC6678', '#7D9A55', '#8B6F97'] as const
export const MARKER_HUES = [255, 350, 132, 300, 25, 200, 282, 112, 332, 232] as const
export const FAMILY_COLOR = '#D2982E'

export function markerColor(i: number | null | undefined): string {
  if (i == null) return FAMILY_COLOR
  return i < MARKER_CURATED.length
    ? MARKER_CURATED[i]
    : `oklch(66% 0.097 ${MARKER_HUES[i % MARKER_HUES.length]})`
}

// Per-person marker colors (index-matched to API FamilyMember order).
export const PEOPLE = {
  alberto:   MARKER_CURATED[0],  // azulejo teal-blue
  hilda:     MARKER_CURATED[1],  // dusty rose
  marie:     MARKER_CURATED[2],  // olive-leaf
  guilherme: MARKER_CURATED[3],  // muted plum
} as const

export const SHARED_COLOR = FAMILY_COLOR
// A muted slate for events with no owner/attendee — visually distinct from the
// gold "family" color so an unassigned event doesn't read as a family event.
export const UNASSIGNED_COLOR = '#8A9199'

export const fonts = {
  display: 'Spectral, Georgia, serif',
  body: 'Figtree, system-ui, sans-serif',
} as const

// Legacy chip helper — superseded by color-mix() in the new EventChip,
// but kept for any inline usages that haven't been ported yet.
export function chipStyle(color: string) {
  return {
    backgroundColor: color + '20',
    borderLeft: `3px solid ${color}`,
  }
}
