'use client';
import { useSearchParams } from 'next/navigation';

export function useIsLiffEmbed(): boolean {
  const searchParams = useSearchParams();
  return searchParams.get('liff') === '1';
}
