import liff from '@line/liff';

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string;

export async function initLiff(): Promise<void> {
  await liff.init({ liffId: LIFF_ID });
  // Re-login if not logged in OR if the ID token has expired (getIDToken returns null)
  if (!liff.isLoggedIn() || !liff.getIDToken()) {
    liff.login({ redirectUri: window.location.href });
  }
}

export async function getLiffAccessToken(): Promise<string | null> {
  return liff.getAccessToken();
}

export function getUrlParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}
