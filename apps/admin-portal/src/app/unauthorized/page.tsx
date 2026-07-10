import Link from 'next/link';

import { AuthFrame } from '../../components/auth-frame';
import { SubmitButton } from '../../components/submit-button';
import { parseAdminPublicConfig } from '../../lib/public-config';
import { logoutAction } from '../actions/auth';

export default function UnauthorizedPage() {
  const { gameUrl } = parseAdminPublicConfig(process.env);

  return (
    <AuthFrame
      eyebrow="Access unavailable"
      title="You cannot open Admin"
      description="This identity does not currently have authorized Starville administration access. No role or account details are disclosed here."
      footer={
        <p>
          If access was assigned recently, contact your Starville security administrator before
          trying again.
        </p>
      }
    >
      <div className="action-stack">
        <Link className="button button--primary" href={gameUrl}>
          Go to Starville
        </Link>
        <form action={logoutAction}>
          <SubmitButton variant="quiet" pendingLabel="Signing out…">
            Sign out of this identity
          </SubmitButton>
        </form>
      </div>
    </AuthFrame>
  );
}
