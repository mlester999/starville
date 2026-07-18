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

export function Phase11AdminPreview() {
  return (
    <main className="operations-page farming-admin-page" aria-labelledby="farming-title">
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Local read-only responsive fixture</p>
          <h1 id="farming-title">Farming and starter quest</h1>
          <p>
            This fixture renders the production Admin Portal classes with representative local-only
            preview values. Its buttons are disabled and it performs no API or database requests.
          </p>
        </div>
        <span className="state-chip state-chip--active">Revision 3</span>
      </header>

      <section className="detail-card" aria-labelledby="live-ops-title">
        <h2 id="live-ops-title">Live operations</h2>
        <div className="farming-policy-grid">
          <span>Planting: Enabled</span>
          <span>Harvesting: Enabled</span>
          <span>Plot provisioning: Enabled</span>
          <span>Starter quest: Enabled</span>
        </div>
        <form className="farming-live-ops-form">
          <Toggle label="Planting" />
          <Toggle label="Harvesting" />
          <label>
            Maintenance explanation
            <textarea defaultValue="Local preview only." rows={3} />
          </label>
          <label>
            Audit reason
            <textarea defaultValue="Verify the responsive administrator layout locally." rows={3} />
          </label>
          <button disabled type="button">
            Record live-operations update
          </button>
        </form>
      </section>

      <section className="detail-card" aria-labelledby="items-title">
        <h2 id="items-title">Item definitions</h2>
        <div className="farming-management-list">
          <details className="farming-management-card" open>
            <summary>
              <strong>Moonbean Seed</strong>
              <span>seed · v3 · referenced</span>
            </summary>
            <form className="farming-content-form">
              <label>
                Display name
                <input defaultValue="Moonbean Seed" />
              </label>
              <label>
                Maximum stack size
                <input defaultValue="99" type="number" />
              </label>
              <label className="farming-json-field">
                Typed metadata
                <textarea defaultValue={'{\n  "kind": "seed",\n  "cropSlug": "moonbean"\n}'} />
              </label>
              <label className="farming-form-wide">
                Audit reason
                <textarea defaultValue="Preview a safe canonical item revision." rows={3} />
              </label>
              <button disabled type="button">
                Save audited item revision
              </button>
            </form>
          </details>
        </div>
      </section>

      <div className="detail-grid">
        <section className="detail-card" aria-labelledby="plot-title">
          <h2 id="plot-title">Plot template versions</h2>
          <ul className="cozy-definition-list">
            <li>
              <strong>Version 2</strong>
              <span>Active for new plots · valid</span>
            </li>
            <li>
              <strong>Version 1</strong>
              <span>Historical and pinned · 2 plots</span>
            </li>
          </ul>
          <details className="farming-management-card" open>
            <summary>Create validated successor</summary>
            <form className="farming-content-form">
              <label>
                Template name
                <input defaultValue="Starter Cottage Interior v3" />
              </label>
              <label className="farming-json-field">
                Eight farming tiles
                <textarea defaultValue="Eight bounded local tile records" />
              </label>
              <button disabled type="button">
                Validate and activate successor
              </button>
            </form>
          </details>
        </section>

        <section className="detail-card" aria-labelledby="quest-title">
          <h2 id="quest-title">Starter quest versions</h2>
          <ul className="cozy-definition-list">
            <li>
              <strong>Version 2</strong>
              <span>Active for new players · 25 DUST</span>
            </li>
            <li>
              <strong>Version 1</strong>
              <span>Historical and pinned · 2 accepted</span>
            </li>
          </ul>
          <details className="farming-management-card" open>
            <summary>Create immutable successor</summary>
            <form className="farming-content-form">
              <label>
                Quest name
                <input defaultValue="Your First Moonbean Harvest" />
              </label>
              <label>
                DUST reward
                <input defaultValue="25" readOnly type="number" />
              </label>
              <label className="farming-json-field">
                Ordered objectives
                <textarea defaultValue="Nine server-authoritative objective records" />
              </label>
              <button disabled type="button">
                Publish quest successor
              </button>
            </form>
          </details>
        </section>
      </div>
    </main>
  );
}

const root = document.getElementById('root');
if (root === null) throw new Error('Phase 11A admin preview requires a #root element.');
createRoot(root).render(
  <StrictMode>
    <Phase11AdminPreview />
  </StrictMode>,
);
