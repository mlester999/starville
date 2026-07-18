import '@starville/design-tokens/styles.css';
import '../../../admin-portal/src/app/globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

export function Toggle({ label }: { readonly label: string }) {
  return (
    <label>
      {label}
      <select defaultValue="true">
        <option value="true">Enabled</option>
        <option value="false">Paused</option>
      </select>
    </label>
  );
}

export function Phase11BCraftingAdminPreview() {
  return (
    <main className="operations-page farming-admin-page" aria-labelledby="crafting-title">
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Local read-only responsive fixture</p>
          <h1 id="crafting-title">Cooking and crafting</h1>
          <p>
            Representative immutable recipes, owner-only queues, recovery, and live operations. This
            fixture performs no API or database requests and every mutation control is disabled.
          </p>
        </div>
        <span className="state-chip state-chip--active">Revision 1</span>
      </header>

      <section className="detail-card" aria-labelledby="telemetry-title">
        <h2 id="telemetry-title">Queue telemetry</h2>
        <div className="farming-policy-grid">
          <span>Running: 3</span>
          <span>Ready: 2</span>
          <span>Collected: 24</span>
          <span>Failed: 1</span>
          <span>Ready over 7 days: 0</span>
          <span>Inventory-full collections: 1</span>
        </div>
      </section>

      <section className="detail-card" aria-labelledby="live-ops-title">
        <h2 id="live-ops-title">Live operations</h2>
        <p className="card-note">
          Pausing starts preserves queued jobs; collection remains an independent control.
        </p>
        <form className="farming-live-ops-form">
          <Toggle label="Cooking starts" />
          <Toggle label="Crafting starts" />
          <Toggle label="Collection" />
          <Toggle label="Tutorial rewards" />
          <label>
            Audit reason
            <textarea defaultValue="Responsive local preview only." rows={3} />
          </label>
          <button disabled type="button">
            Record live-operations update
          </button>
        </form>
      </section>

      <section className="detail-card" aria-labelledby="workstations-title">
        <h2 id="workstations-title">Workstations</h2>
        <div className="farming-management-list">
          {[
            ['Cooking Hearth', 'cooking hearth · 2 active jobs', '2'],
            ['Crafting Workbench', 'crafting workbench · 1 active job', '2'],
          ].map(([name, description, capacity]) => (
            <details
              className="farming-management-card"
              key={name}
              open={name === 'Cooking Hearth'}
            >
              <summary>
                <strong>{name}</strong>
                <span>{description}</span>
              </summary>
              <form className="farming-content-form">
                <label>
                  Queue capacity
                  <input defaultValue={capacity} min={1} max={8} type="number" />
                </label>
                <label>
                  Interaction radius
                  <input defaultValue="1.75" min={1} max={4} step="0.1" type="number" />
                </label>
                <button disabled type="button">
                  Update bounded workstation policy
                </button>
              </form>
            </details>
          ))}
        </div>
      </section>

      <section className="detail-card" aria-labelledby="recipes-title">
        <h2 id="recipes-title">Immutable recipe versions</h2>
        <div className="farming-management-list">
          <details className="farming-management-card" open>
            <summary>
              <strong>Garden Soup</strong>
              <span>v1 · active · 2 pinned jobs</span>
            </summary>
            <p>2 Moonbeans → 1 Garden Soup · 300 seconds · 0 DUST</p>
            <p className="card-note">
              Valid for Cooking Hearth. Existing jobs keep version 1 after a successor is created.
            </p>
            <form className="farming-content-form">
              <label>
                Successor name
                <input defaultValue="Garden Soup" />
              </label>
              <label>
                Production duration
                <input defaultValue="300" min={1} type="number" />
              </label>
              <label>
                Audit reason
                <textarea defaultValue="Responsive local preview only." rows={3} />
              </label>
              <button disabled type="button">
                Create immutable successor
              </button>
            </form>
          </details>
        </div>
      </section>

      <section className="detail-card" aria-labelledby="jobs-title">
        <h2 id="jobs-title">Recent jobs and recovery</h2>
        <div className="farming-policy-grid">
          <span>Garden Soup · Ready · output attached</span>
          <span>Garden Twine · Running · 42s remaining</span>
          <span>Garden Soup · Failed · reconciliation pending</span>
        </div>
        <button disabled type="button">
          Request bounded reconciliation
        </button>
      </section>
    </main>
  );
}

const root = document.getElementById('root');
if (root === null) throw new Error('Phase 11B admin preview requires a #root element.');
createRoot(root).render(
  <StrictMode>
    <Phase11BCraftingAdminPreview />
  </StrictMode>,
);
