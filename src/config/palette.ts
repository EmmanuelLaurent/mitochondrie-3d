/**
 * Compartment colour code, single source for the 3D shaders and the legend.
 * Colours are conventions (the real compartments are not coloured), and never the
 * only cue: membranes are striped bilayers in section, the intermembrane space is a
 * clear fluid, the matrix is granular — the legend mirrors those textures.
 * IMS steel blue was checked against its neighbours and the H+ vermillion under
 * protan/deutan/tritan simulation (CIEDE2000 >= 17.5).
 */
export const COMPARTMENT_COLORS = {
  // `heads`: lipid head groups at molecular scale (scene 2 onward).
  outerMembrane: { surface: '#e98b6d', section: '#f6b49a', heads: '#e98b6d' },
  intermembraneSpace: { fluid: '#7aa3bd' },
  // IMM heads lifted from #a63a54 so the graphite carbon chain still reads against them.
  innerMembrane: { surface: '#a63a54', section: '#d8667c', heads: '#b84862' },
  matrix: { surface: '#f2c6a6', section: '#f3e6d6' },
} as const

/** UI/instrument accent (selection, focus, cut plane) — never used for biology. */
export const SIGNAL_COLOR = '#5fd0e8'

/**
 * Small molecules at molecular scale. Each also has its own silhouette (see the
 * scene-2 builders and the legend), so colour is never the only cue:
 * carbon chain = zig-zag of beads, CoA = "key" (round head, long arm), carnitine =
 * trefoil head, nucleotides = hexagon (filled when charged, ring when not) + one
 * tetrahedron per phosphate. New hues were picked against the whole legend and the
 * compartment colours under protan/deutan/tritan simulation (worst-case CIEDE2000 ≥ 10).
 */
export const MOLECULE_COLORS = {
  // Graphite: the legend's dark carbon chain, lifted to ~4:1 against the dark backdrop
  // (the original #333 was ~1.5:1, the followed molecule would have been the least visible object).
  carbonChain: '#707884',
  carbonylOxygen: '#e6e2da',
  coa: '#d9b45f', // sand gold: never the acetyl-CoA orange diamond (it would read as acetyl-CoA)
  thiol: '#b8862b', // CoA's -SH tip: darker ochre, not CPK yellow (that is the electron's colour)
  carnitine: '#9678ff', // periwinkle violet
  atp: '#cc79a7', // legend ATP (Okabe-Ito reddish purple)
  adp: '#e3b9d2',
  amp: '#ecc6dd', // paler than ADP: fewer phosphates
  phosphate: '#e8e2d6', // ivory tetrahedra (spheres stay reserved for H+ and O2)
} as const

/** Proteins: one neutral "machinery" colour (matte), so the saturated codes stay with the molecules. */
export const PROTEIN_COLOR = '#a9bba8'
