import { RoutePreview } from '../../components/route-preview';

export default function HowToPlayPage() {
  return (
    <RoutePreview
      eyebrow="Your first evening"
      title="How to play"
      description="Starville is a gentle life-simulation world built around creativity, friendship, and restoring a village together."
      details={[
        'Connect and prove wallet ownership with one message signature.',
        'Meet the configured token requirement to enter during the gated launch.',
        'Move through Lantern Square with WASD, hold either Shift key to jog, and press E near the village notice to interact.',
        'Open Settings to adjust the available master audio controls, return home safely, or end the trusted Starville session.',
      ]}
    />
  );
}
