import React from 'react';
import { Composition } from 'remotion';
import { BrewingDemo } from './BrewingDemo';
import { BrewingWalkthrough } from './BrewingWalkthrough';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Original pitch video */}
      <Composition
        id="BrewingDemo"
        component={BrewingDemo}
        durationInFrames={2700} // 90s @ 30fps
        fps={30}
        width={1920}
        height={1080}
      />
      {/* Live app walkthrough — 120s */}
      <Composition
        id="BrewingWalkthrough"
        component={BrewingWalkthrough}
        durationInFrames={3600} // 120s @ 30fps
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
