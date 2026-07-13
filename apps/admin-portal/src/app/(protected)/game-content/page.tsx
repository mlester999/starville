import { requireAuthorizedAdmin } from '../../../lib/auth/authorization';
import { loadAdminGameplayContent } from '../../../lib/cozy-gameplay/api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function readiness(value: string) {
  return value === 'approved'
    ? 'Approved'
    : value === 'development_marker'
      ? 'Development marker'
      : 'Missing';
}

export default async function GameContentPage() {
  await requireAuthorizedAdmin('items.read');
  const content = await loadAdminGameplayContent();
  return (
    <main className="operations-page game-content-page" aria-labelledby="game-content-title">
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Read-only catalog</p>
          <h1 id="game-content-title">Game content</h1>
          <p>
            Inspect the active Phase 7 definitions used by trusted gameplay transactions. This page
            cannot change items, prices, recipes, crops, DUST, inventory, or housing state.
          </p>
        </div>
        <span className="state-chip state-chip--active">Content v{content.contentVersion}</span>
      </header>

      <section className="detail-card" aria-labelledby="items-title">
        <h2 id="items-title">Items ({content.items.length})</h2>
        <div className="cozy-admin-table-wrap">
          <table className="cozy-admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Stack</th>
                <th>Buy / sell</th>
                <th>Art</th>
              </tr>
            </thead>
            <tbody>
              {content.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    <small>{item.slug}</small>
                  </td>
                  <td>{item.category.replaceAll('_', ' ')}</td>
                  <td>{item.stackable ? `Up to ${item.maxStackSize}` : 'Unique'}</td>
                  <td>
                    {item.defaultBuyPrice === null ? '—' : `${item.defaultBuyPrice} DUST`} /{' '}
                    {item.defaultSellPrice === null ? '—' : `${item.defaultSellPrice} DUST`}
                  </td>
                  <td>{readiness(item.assetReadiness)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="detail-grid">
        <section className="detail-card">
          <h2>Crops</h2>
          <ul className="cozy-definition-list">
            {content.crops.map((crop) => (
              <li key={crop.id}>
                <strong>{crop.name}</strong>
                <span>
                  {crop.deterministicYield} yield · {crop.growthDurationSeconds}s ·{' '}
                  {readiness(crop.assetReadiness)}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="detail-card">
          <h2>Recipes</h2>
          <ul className="cozy-definition-list">
            {content.recipes.map((recipe) => (
              <li key={recipe.id}>
                <strong>{recipe.name}</strong>
                <span>
                  {recipe.kind} · {recipe.ingredients.length} ingredients → {recipe.outputQuantity}{' '}
                  {recipe.outputItemSlug}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="detail-card">
          <h2>Shop offers</h2>
          <ul className="cozy-definition-list">
            {content.offers.map((offer) => (
              <li key={offer.id}>
                <strong>{offer.itemSlug}</strong>
                <span>
                  Buy {offer.buyPrice ?? '—'} · Sell {offer.sellPrice ?? '—'} DUST · max{' '}
                  {offer.maximumQuantity}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="detail-card">
          <h2>Furniture</h2>
          <ul className="cozy-definition-list">
            {content.furniture.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong>
                <span>
                  {item.footprintWidth}×{item.footprintHeight} · {readiness(item.assetReadiness)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="detail-card">
        <h2>Private home templates</h2>
        {content.homeTemplates.map((home) => (
          <div className="cozy-home-template" key={home.id}>
            <strong>{home.name}</strong>
            <span>
              {home.bounds.maxX - home.bounds.minX}×{home.bounds.maxY - home.bounds.minY} grid ·
              template v{home.templateVersion}
            </span>
            {home.developmentArt ? (
              <span className="state-chip state-chip--warning">Development art</span>
            ) : null}
          </div>
        ))}
      </section>
    </main>
  );
}
