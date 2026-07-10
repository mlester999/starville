const MINIMUM_PASSWORD_LENGTH = 12;
const MAXIMUM_PASSWORD_LENGTH = 128;

export type PasswordValidation =
  { readonly valid: true } | { readonly valid: false; readonly reason: 'mismatch' | 'weak' };

export function validateNewPassword(password: string, confirmation: string): PasswordValidation {
  if (password !== confirmation) {
    return { valid: false, reason: 'mismatch' };
  }

  const characterClasses = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/];
  const meetsComplexity = characterClasses.every((pattern) => pattern.test(password));

  if (
    password.length < MINIMUM_PASSWORD_LENGTH ||
    password.length > MAXIMUM_PASSWORD_LENGTH ||
    !meetsComplexity
  ) {
    return { valid: false, reason: 'weak' };
  }

  return { valid: true };
}
