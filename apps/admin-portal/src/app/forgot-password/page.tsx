import Link from 'next/link';

import { AuthFrame } from '../../components/auth-frame';
import { Notice } from '../../components/notice';
import { SubmitButton } from '../../components/submit-button';
import { AUTH_MESSAGES } from '../../lib/auth/messages';
import { forgotPasswordAction } from '../actions/auth';

interface ForgotPasswordPageProps {
  readonly searchParams: Promise<{ readonly sent?: string }>;
}

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const sent = (await searchParams).sent === '1';

  return (
    <AuthFrame
      eyebrow="Account recovery"
      title="Reset your password"
      description="Enter your staff email. For privacy, the response is the same whether or not an account exists."
      footer={
        <p>
          Remembered it? <Link href="/login">Return to sign in</Link>
        </p>
      }
    >
      {sent ? <Notice tone="success">{AUTH_MESSAGES.resetRequested}</Notice> : null}

      <form className="form-stack" action={forgotPasswordAction}>
        <div className="field">
          <label htmlFor="email">Staff email</label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            required
          />
        </div>
        <SubmitButton pendingLabel="Requesting securely…">Send reset instructions</SubmitButton>
      </form>
    </AuthFrame>
  );
}
