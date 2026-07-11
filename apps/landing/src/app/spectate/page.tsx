import { RoutePreview } from '../../components/route-preview';

export default function SpectatePage() {
  return (
    <RoutePreview
      eyebrow="The village observatory"
      title="Spectator mode is opening soon"
      description="This entrance will eventually offer a read-only window into the living Starville world without bypassing player access controls."
      details={[
        'Preview public village moments without entering as a player.',
        'No wallet signature or token-gated game session is created here.',
        'Live spectator gameplay has not been implemented in Phase 3.',
      ]}
    />
  );
}
