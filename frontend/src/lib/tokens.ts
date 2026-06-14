// Design tokens — the single source of truth for colors and type.
// Ported from docs/roost-build-brief.md §2. Do NOT redefine these per-component;
// import from here. Applied via inline styles, matching the design prototypes.

export const palette = {
  mist: '#EEF1EE', // page background
  surface: '#FFFFFF', // cards/panels
  ink: '#28342F', // primary text
  inkSoft: '#5C6B65', // secondary text
  line: '#DCE2DD', // borders/dividers
  brand: '#3E6259', // nav active, "today" marker, primary accents
  brandSoft: '#3E62590F', // brand at ~6% — "today" column/row wash
  amber: '#F6B042', // FAB, CTAs, "selected day" outline, highlight chip
} as const

// Per-person marker colors. Authoritative colors come from the API
// (FamilyMember.color); these are the design reference / fallbacks.
export const PEOPLE = {
  alberto: '#4C7EA8', // denim
  hilda: '#D1577A', // raspberry
  marie: '#5C9460', // moss
  guilherme: '#8A6BB8', // violet
} as const

// Gold — family-wide / external people (e.g. "Grandma"). Used for shared events.
export const SHARED_COLOR = '#D99A2B'

export const fonts = {
  display: '"Bricolage Grotesque", sans-serif',
  body: '"Plus Jakarta Sans", sans-serif',
} as const

// Event chip styling helper: 12%-tint background + 3px left border (the
// "marker-pen on a whiteboard" metaphor from the build brief).
export function chipStyle(color: string) {
  return {
    backgroundColor: color + '20',
    borderLeft: `3px solid ${color}`,
  }
}
