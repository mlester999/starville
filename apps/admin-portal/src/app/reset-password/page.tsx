import { redirect } from 'next/navigation';

import { AuthFrame } from '../../components/auth-frame';
import { Notice } from '../../components/notice';
import { SubmitButton } from '../../components/submit-button';
import { resetNoticeMessage } from '../../lib/auth/messages';
import { hasVerifiedRecoverySession } from '../../lib/auth/recovery';
import { resetPasswordAction } from '../actions/auth';

interface ResetPasswordPageProps {
  readonly searchParams: Promise<{ readonly notice?: string }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  if (!(await hasVerifiedRecoverySession())) {
    redirect('/session-expired');
  }

  const notice = resetNoticeMessage((await searchParams).notice);

  return (
    <AuthFrame
      eyebrow="Verified recovery"
      title="Choose a new password"
      description="Your recovery session is temporary. Set a strong password, then sign in again."
    >
      {notice ? <Notice tone="warning">{notice}</Notice> : null}

      <form className="form-stack" action={resetPasswordAction}>
        <div className="field">
          <label htmlFor="password">New password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            aria-describedby="password-guidance"
            required
          />
          <p className="field__guidance" id="password-guidance">
            12–128 characters with uppercase, lowercase, a number, and a symbol.
          </p>
        </div>

        <div className="field">
          <label htmlFor="password-confirmation">Confirm new password</label>
          <input
            id="password-confirmation"
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </div>

        <SubmitButton pendingLabel="Updating securely…">Update password</SubmitButton>
      </form>
    </AuthFrame>
  );
}
