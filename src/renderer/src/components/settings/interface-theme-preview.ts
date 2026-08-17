import { interfaceThemeDefinitions } from '../../../../shared/interface-theme'

const interfaceThemeDescriptions = {
  default: 'Orca neutral and focused',
  'blue-fantasy': 'Celestial blue glass',
  'dragon-heir': 'Ink, parchment, and gold',
  miku: 'Cyan-magenta studio',
  minecraft: 'Voxel landscape and wood',
  qq98: 'Glossy crystal desktop',
  ths: 'Chinese market terminal',
  trading: 'Live ticker workstation',
  'whale-song': 'Ocean glass and gold',
  xp: 'Classic Luna desktop'
} as const

export const interfaceThemePreviewEntries = interfaceThemeDefinitions.map(({ id, name }) => ({
  theme: id,
  name,
  description: interfaceThemeDescriptions[id]
}))
