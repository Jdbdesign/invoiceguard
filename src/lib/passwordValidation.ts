export const MIN_PASSWORD_LENGTH = 8;

export function passwordValidationError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}
