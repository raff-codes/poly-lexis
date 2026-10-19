/**
 * Thrown by a provider when the service rejected its credentials or quota
 * (DeepL 401/403/456, Google 401/403). Every later request would fail the same
 * way, so the runner stops using that provider instead of retrying each key.
 */
export class ProviderAuthError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ProviderAuthError';
    this.status = status;
  }
}

/** HTTP statuses that mean the credentials or account, not the request, are the problem */
export const AUTH_FAILURE_STATUSES = new Set([401, 403, 456]);
