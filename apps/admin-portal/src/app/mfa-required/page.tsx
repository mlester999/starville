import { AuthFrame } from '../../components/auth-frame';
import { Notice } from '../../components/notice';
import { SubmitButton } from '../../components/submit-button';
import { loadVerifiedTotpFactors } from '../../lib/auth/mfa';
import { AUTH_MESSAGES } from '../../lib/auth/messages';
import { createAdminServerClient } from '../../lib/supabase/server';
import { logoutAction, verifyMfaAction } from '../actions/auth';

interface MfaRequiredPageProps {
  readonly searchParams: Promise<{ readonly notice?: string }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MfaRequiredPage({ searchParams }: MfaRequiredPageProps) {
  const notice = (await searchParams).notice;
  const factors = await loadVerifiedTotpFactors(await createAdminServerClient());

  return (
    <AuthFrame
      eyebrow="Additional verification"
      title="MFA is required"
      description="Enter a current code from a verified authenticator before this administrator session can continue."
      footer={
        <p>
          Authenticator enrollment and factor recovery use your organization’s approved Supabase
          Auth process. Access remains denied until assurance is verified.
        </p>
      }
    >
      {notice === 'verification-required' ? (
        <Notice tone="warning">{AUTH_MESSAGES.mfaStillRequired}</Notice>
      ) : null}
      {notice === 'unavailable' ? (
        <Notice tone="warning">{AUTH_MESSAGES.serviceUnavailable}</Notice>
      ) : null}
      {notice === 'verification-failed' ? (
        <Notice tone="warning">{AUTH_MESSAGES.mfaVerificationFailed}</Notice>
      ) : null}

      {factors.length > 0 ? (
        <form className="form-stack" action={verifyMfaAction}>
          {factors.length === 1 ? (
            <input type="hidden" name="factorId" value={factors[0]?.id} />
          ) : (
            <div className="field">
              <label htmlFor="factor-id">Authenticator</label>
              <select id="factor-id" name="factorId" required>
                {factors.map((factor) => (
                  <option key={factor.id} value={factor.id}>
                    {factor.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="field">
            <label htmlFor="mfa-code">Authenticator code</label>
            <input
              id="mfa-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              required
            />
          </div>

          <SubmitButton pendingLabel="Verifying code…">Verify and continue</SubmitButton>
        </form>
      ) : (
        <Notice tone="warning">{AUTH_MESSAGES.mfaFactorUnavailable}</Notice>
      )}

      <div className="action-stack action-stack--compact">
        <form action={logoutAction}>
          <SubmitButton variant="quiet" pendingLabel="Signing out…">
            Cancel and sign out
          </SubmitButton>
        </form>
      </div>
    </AuthFrame>
  );
}
