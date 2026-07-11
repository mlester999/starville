import { TokenAccessGate } from '../components/TokenAccessGate';
import { parseGameClientPublicConfig } from './public-config';

export function App() {
  const config = parseGameClientPublicConfig(import.meta.env);

  return <TokenAccessGate apiUrl={config.apiUrl} landingUrl={config.landingUrl} />;
}
