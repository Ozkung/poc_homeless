// Lets routes that render before the LIFF login/verify handshake finishes
// (see main.tsx's PUBLIC_PATHS) wait for that handshake instead of racing it.
let resolveAuthChecked: (hasToken: boolean) => void;

export const authChecked: Promise<boolean> = new Promise((resolve) => {
  resolveAuthChecked = resolve;
});

export function markAuthChecked(hasToken: boolean): void {
  resolveAuthChecked(hasToken);
}

export async function waitForAuth(timeoutMs = 8000): Promise<boolean> {
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));
  return Promise.race([authChecked, timeout]);
}
