import type { MemoryJourney } from "./memory";

export const GAME_SESSION_KEY = "vrchat-recap/memory-walk/v5";

export type MemoryGameSession = {
  journey: MemoryJourney;
  avatarSpriteUrl: string | null;
};

export function createGameSession(journey: MemoryJourney, avatarSpriteUrl: string | null): MemoryGameSession {
  return {
    avatarSpriteUrl,
    journey: {
      ...journey,
      moments: journey.moments.map((moment) => ({ ...moment, previewUrl: undefined })),
    },
  };
}
