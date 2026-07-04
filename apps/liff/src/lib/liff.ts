import liff from '@line/liff';

const LIFF_ID = import.meta.env.VITE_LIFF_ID as string;

export function liffLogin(): void {
  const redirectUri = `${window.location.origin}/liff/`;
  liff.login({ redirectUri });
}

export async function initLiff(): Promise<void> {
  await liff.init({ liffId: LIFF_ID });
  if (!liff.isLoggedIn() || !liff.getIDToken()) {
    liffLogin();
  }
}
