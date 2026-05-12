import type { AvatarCustomization } from '../../rio/types'

export interface AvatarPreset {
  id: string
  label: string
  icon: string
  custom: AvatarCustomization
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: 'aventurero',
    label: 'Aventurero',
    icon: '🧭',
    custom: {
      skinColor: 0xE8B88A,
      hairColor: 0x4A3728,
      hairStyle: 0,
      shirtColor: 0x3B82F6,
      pantsColor: 0x1E3A5F,
      accessory: null,
    },
  },
  {
    id: 'inventora',
    label: 'Inventora',
    icon: '⚙️',
    custom: {
      skinColor: 0xFFDFC4,
      hairColor: 0xCD5C5C,
      hairStyle: 1,
      shirtColor: 0x8B5CF6,
      pantsColor: 0x374151,
      accessory: null,
    },
  },
  {
    id: 'sabio',
    label: 'Sabio',
    icon: '📚',
    custom: {
      skinColor: 0xC68642,
      hairColor: 0x808080,
      hairStyle: 0,
      shirtColor: 0x10B981,
      pantsColor: 0x1A1A2E,
      accessory: null,
    },
  },
  {
    id: 'artista',
    label: 'Artista',
    icon: '🎨',
    custom: {
      skinColor: 0xE8B88A,
      hairColor: 0x228B22,
      hairStyle: 1,
      shirtColor: 0xEC4899,
      pantsColor: 0x4A3728,
      accessory: null,
    },
  },
  {
    id: 'naturalista',
    label: 'Naturalista',
    icon: '🌿',
    custom: {
      skinColor: 0x8D5524,
      hairColor: 0x1A1A1A,
      hairStyle: 0,
      shirtColor: 0xF59E0B,
      pantsColor: 0x14532D,
      accessory: null,
    },
  },
  {
    id: 'astronauta',
    label: 'Astronauta',
    icon: '🚀',
    custom: {
      skinColor: 0xFFCC99,
      hairColor: 0x4A3728,
      hairStyle: 0,
      shirtColor: 0xEF4444,
      pantsColor: 0x1A1A2E,
      accessory: null,
    },
  },
]
