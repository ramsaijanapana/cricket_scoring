import { useEffect } from 'react';

const APP_NAME = 'CricScore';

export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} | ${APP_NAME}` : APP_NAME;
  }, [title]);
}

export function matchDocumentTitle(
  teams: Array<{ teamName?: string } | null | undefined> | null | undefined,
  fallback: string,
): string {
  const a = teams?.[0]?.teamName;
  const b = teams?.[1]?.teamName;
  return a && b ? `${a} vs ${b}` : fallback;
}
