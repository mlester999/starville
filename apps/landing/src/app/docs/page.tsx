import { RoutePreview } from '../../components/route-preview';

export default function DocsPage() {
  return (
    <RoutePreview
      eyebrow="The village field guide"
      title="Starville docs"
      description="A concise player guide will live here as Starville’s systems become playable. Nothing unfinished is presented as live functionality."
      details={[
        'Wallet access and network requirements.',
        'World, home, farming, cooking, and crafting guides.',
        'Safety, fair-play, and community expectations.',
      ]}
    />
  );
}
