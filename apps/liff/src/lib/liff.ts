import liff from '@line/liff';

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string;

// Always redirect back to the LIFF root — sub-paths (/register, /profile) may not be
// whitelisted in LINE Developer Console, but the root endpoint URL always is.
export function liffLogin(): void {
  const redirectUri = `${window.location.origin}/liff/`;
  liff.login({ redirectUri });
}

export async function initLiff(): Promise<void> {
  await liff.init({ liffId: LIFF_ID });
  // Re-login if not logged in OR if the ID token has expired (getIDToken returns null)
  if (!liff.isLoggedIn() || !liff.getIDToken()) {
    liffLogin();
  }
}

export async function getLiffAccessToken(): Promise<string | null> {
  return liff.getAccessToken();
}

export function getUrlParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}
