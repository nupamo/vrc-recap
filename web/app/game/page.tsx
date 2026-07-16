"use client";

import { useEffect, useState } from "react";
import MemoryGame from "../MemoryGame";
import { GAME_SESSION_KEY, type MemoryGameSession } from "../lib/gameSession";
import { createPublicSampleJourney } from "../lib/personalSample";

export default function GamePage() {
  const [session, setSession] = useState<MemoryGameSession | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    let nextSession: MemoryGameSession | null = null;
    let nextIsDemo = false;
    const saved = sessionStorage.getItem(GAME_SESSION_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as MemoryGameSession;
        if (parsed.journey?.schema === "vrchat-recap/v5" && parsed.journey.moments?.length) {
          nextSession = parsed;
        }
      } catch {
        sessionStorage.removeItem(GAME_SESSION_KEY);
      }
    }
    if (!nextSession) {
      nextIsDemo = true;
      nextSession = { journey: createPublicSampleJourney(), avatarSpriteUrl: null };
    }
    const timer = window.setTimeout(() => {
      setIsDemo(nextIsDemo);
      setSession(nextSession);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!session) {
    return <main className="game-page-loading"><span>MEMORY WALK</span><p>기억의 빛을 불러오는 중…</p></main>;
  }

  return <MemoryGame journey={session.journey} avatarSpriteUrl={session.avatarSpriteUrl} isDemo={isDemo} />;
}
