/**
 * Compartment colour code, single source for the 3D shaders and the legend.
 * Colours are conventions (the real compartments are not coloured), and never the
 * only cue: membranes are striped bilayers in section, the intermembrane space is a
 * clear fluid, the matrix is granular — the legend mirrors those textures.
 * IMS steel blue was checked against its neighbours and the H+ vermillion under
 * protan/deutan/tritan simulation (CIEDE2000 >= 17.5).
 */
export const COMPARTMENT_COLORS = {
  outerMembrane: { surface: '#e98b6d', section: '#f6b49a' },
  intermembraneSpace: { fluid: '#7aa3bd' },
  innerMembrane: { surface: '#a63a54', section: '#d8667c' },
  matrix: { surface: '#f2c6a6', section: '#f3e6d6' },
} as const

/** UI/instrument accent (selection, focus, cut plane) — never used for biology. */
export const SIGNAL_COLOR = '#5fd0e8'
