/** "há 3 min", "há 2 h", "agora mesmo" — sempre a partir de recorded_at, nunca received_at (Context.md §6). */
export function timeAgo(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} d`;
}

export function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

export function coords(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}
