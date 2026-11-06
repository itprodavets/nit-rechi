const paths = {
  today: 'M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  map: 'M9 9 5 5m10 4 4-4m-7 9v5M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0M3 4a1 1 0 1 0 2 0 1 1 0 0 0-2 0m16 0a1 1 0 1 0 2 0 1 1 0 0 0-2 0m-8 16a1 1 0 1 0 2 0 1 1 0 0 0-2 0',
  materials: 'M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1v14',
  progress: 'M4 4v16h16M8 15v-4m5 4V7m5 8V4',
  account: 'M5 21v-2a7 7 0 0 1 14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  practice: 'm9 5 11 7-11 7V5M4 5v14',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  check: 'm5 12 4 4L19 6',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  words: 'M4 4h13v16H4V4m4 4h5m-5 4h5m-5 4h3m6-9h3v16H7v-3',
  mic: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5m-3 6v1a6 6 0 0 0 12 0v-1m-6 7v4m-3 0h6',
  close: 'm6 6 12 12M6 18 18 6'
};
export function Icon({ name, className = '' }: { name: keyof typeof paths; className?: string }) {
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
