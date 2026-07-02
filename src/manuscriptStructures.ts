import type { StructureType } from './db'

/** A built-in story structure: an ordered list of named beats to align scenes to. */
export interface StructureDef {
  type: StructureType
  name: string
  beats: string[]
}

export const STRUCTURES: StructureDef[] = [
  {
    type: 'save-the-cat',
    name: 'Save the Cat',
    beats: [
      'Opening Image', 'Theme Stated', 'Set-Up', 'Catalyst', 'Debate',
      'Break into Two', 'B Story', 'Fun and Games', 'Midpoint',
      'Bad Guys Close In', 'All Is Lost', 'Dark Night of the Soul',
      'Break into Three', 'Finale', 'Final Image',
    ],
  },
  {
    type: 'heros-journey',
    name: "Hero's Journey",
    beats: [
      'Ordinary World', 'Call to Adventure', 'Refusal of the Call',
      'Meeting the Mentor', 'Crossing the Threshold', 'Tests, Allies, Enemies',
      'Approach to the Inmost Cave', 'The Ordeal', 'Reward', 'The Road Back',
      'Resurrection', 'Return with the Elixir',
    ],
  },
  {
    type: 'snowflake',
    name: 'Snowflake',
    beats: [
      'One-Sentence Summary', 'One-Paragraph Summary', 'Setup',
      'First Disaster', 'Second Disaster', 'Third Disaster', 'Ending',
    ],
  },
]

export function structureDef(type: StructureType): StructureDef | undefined {
  return STRUCTURES.find((s) => s.type === type)
}
