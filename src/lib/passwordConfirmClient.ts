// Bridges the plain async `fetchJson` helper (module scope, not a hook) to
// the React-rendered PasswordConfirmModal. fetchJson calls
// requestPasswordConfirmation() and awaits it; the modal (mounted once near
// the app root) subscribes to open itself, then resolves/rejects the same
// promise once the user submits or cancels.

type Resolver = { resolve: () => void; reject: (err: Error) => void };

let openModal: (() => void) | null = null;
let pending: Resolver[] = [];

export function subscribeToConfirmRequests(onRequest: () => void): () => void {
  openModal = onRequest;
  return () => {
    if (openModal === onRequest) openModal = null;
  };
}

export function requestPasswordConfirmation(): Promise<void> {
  return new Promise((resolve, reject) => {
    pending.push({ resolve, reject });
    if (openModal) {
      openModal();
    } else {
      reject(new Error("Password confirmation is not available right now."));
    }
  });
}

export function resolvePendingConfirmations(): void {
  const resolvers = pending;
  pending = [];
  resolvers.forEach((r) => r.resolve());
}

export function rejectPendingConfirmations(message: string): void {
  const resolvers = pending;
  pending = [];
  resolvers.forEach((r) => r.reject(new Error(message)));
}
