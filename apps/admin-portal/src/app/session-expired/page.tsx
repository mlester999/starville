import { AuthFrame } from '../../components/auth-frame';
import { SubmitButton } from '../../components/submit-button';
import { logoutAction } from '../actions/auth';

export default function SessionExpiredPage() {
  return (
    <AuthFrame
      eyebrow="Session ended"
      title="Sign in again"
      description="Your administrator session can no longer be used. This may happen after expiration or a security change."
      footer={
        <p>
          For your protection, this page does not reveal whether the session expired or was revoked.
        </p>
      }
    >
      <form className="action-stack" action={logoutAction}>
        <SubmitButton pendingLabel="Clearing session…">Return to secure sign in</SubmitButton>
      </form>
    </AuthFrame>
  );
}
