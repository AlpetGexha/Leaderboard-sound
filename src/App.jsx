import React, { useCallback, useLayoutEffect, useState } from 'react';
import { EMPTY_STATE } from './domain/snapshot.js';
import { isBigAnnouncement } from './guards/announcementGuards.js';
import { useAnnouncementQueue } from './hooks/useAnnouncementQueue.js';
import { useArenaSnapshot } from './hooks/useArenaSnapshot.js';
import { useFlipAnimation } from './hooks/useFlipAnimation.js';
import { useScoreFlash } from './hooks/useScoreFlash.js';
import { Header } from './components/Header.jsx';
import { Leaderboard } from './components/Leaderboard.jsx';
import { KillFeed } from './components/KillFeed.jsx';
import { UnlockGate } from './components/UnlockGate.jsx';
import { AnnouncementOverlay } from './components/AnnouncementOverlay.jsx';
import { MiniBanner } from './components/MiniBanner.jsx';
import { TestPanel } from './components/TestPanel/TestPanel.jsx';

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const { announcer, current, ingestFrame } = useAnnouncementQueue();
  const { rowRefs, captureOldTops, applyFlip } = useFlipAnimation();
  const { scoredAgents, clearScored, resetScores, syncSolved } = useScoreFlash();

  const onBeforeApply = useCallback(next => {
    if (next.dayRolled) resetScores();
    if (next?.config?.announcer) announcer.configure(next.config.announcer);
    captureOldTops();
  }, [announcer, captureOldTops, resetScores]);

  const onAfterApply = useCallback(next => {
    ingestFrame(next);
  }, [ingestFrame]);

  const { snapshot, live } = useArenaSnapshot({ onBeforeApply, onAfterApply });

  useLayoutEffect(() => {
    if (!snapshot) return;
    applyFlip();
    syncSolved(snapshot.state.leaderboard);
  }, [snapshot, applyFlip, syncSolved]);

  const state = snapshot?.state || EMPTY_STATE;

  function unlock() {
    announcer.unlock();
    setUnlocked(true);
  }

  return (
    <>
      <UnlockGate unlocked={unlocked} onUnlock={unlock} />
      <Header snapshot={snapshot} live={live} />
      <main>
        <Leaderboard
          rows={state.leaderboard}
          rowRefs={rowRefs}
          scoredAgents={scoredAgents}
          onScoreAnimationEnd={clearScored}
        />
        <KillFeed feed={state.feed} />
      </main>
      {current && (isBigAnnouncement(current)
        ? <AnnouncementOverlay announcement={current} />
        : <MiniBanner announcement={current} />)}
      <TestPanel snapshot={snapshot} />
    </>
  );
}
