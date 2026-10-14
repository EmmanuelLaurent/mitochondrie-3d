import fr from '../../content/fr.json'

/**
 * The single source of all user-facing text (CLAUDE.md: "jamais de texte
 * pédagogique en dur dans le code"). `resolveJsonModule` gives this a precise
 * structural type for free — import from here, never read the JSON file directly.
 */
export const content = fr
