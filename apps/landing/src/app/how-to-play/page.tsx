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
        'Begin building, farming, cooking, and exploring when the first playable slice opens.',
      ]}
    />
  );
}
