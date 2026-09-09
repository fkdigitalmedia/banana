export interface ParsedTime {
  minutes: number | null;
  originalValue: string;
  displayText: string;
}

export function parseISODuration(iso: string): number | null {
  if (!iso || typeof iso !== 'string' || !iso.toUpperCase().startsWith('P')) return null;
  const match = iso.toUpperCase().match(/P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return null;
  
  const days = parseInt(match[1] || '0', 10);
  const hours = parseInt(match[2] || '0', 10);
  const minutes = parseInt(match[3] || '0', 10);
  
  const total = (days * 24 * 60) + (hours * 60) + minutes;
  return total > 0 ? total : null;
}

export function parseHumanTime(text: string): number | null {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase().trim();
  
  let totalMinutes = 0;
  
  const hourMatch = lower.match(/(?:about\s+)?(\d+(?:\.\d+)?)\s*(?:hour|hours|hr|hrs)/);
  if (hourMatch) {
    totalMinutes += parseFloat(hourMatch[1]) * 60;
  }
  
  const minMatch = lower.match(/(?:about\s+)?(\d+)\s*(?:minute|minutes|min|mins)/);
  if (minMatch) {
    totalMinutes += parseInt(minMatch[1], 10);
  }
  
  if (totalMinutes === 0) {
    const rawNumMatch = lower.match(/^(\d+)$/);
    if (rawNumMatch) {
      totalMinutes += parseInt(rawNumMatch[1], 10);
    }
  }
  
  return totalMinutes > 0 ? totalMinutes : null;
}

export function parseTime(value: string | number | undefined): ParsedTime {
  if (value === undefined || value === null || value === '') {
    return { minutes: null, originalValue: '', displayText: '' };
  }
  
  const strValue = String(value);
  let minutes: number | null = null;
  
  if (strValue.toUpperCase().startsWith('P')) {
    minutes = parseISODuration(strValue);
  }
  if (minutes === null) {
    minutes = parseHumanTime(strValue);
  }
  
  return {
    minutes,
    originalValue: strValue,
    displayText: formatMinutes(minutes)
  };
}

export function formatMinutes(minutes: number | null): string {
  if (!minutes || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  
  if (hours > 0 && mins > 0) {
    return `${hours} hr${hours > 1 ? 's' : ''} ${mins} min`;
  } else if (hours > 0) {
    return `${hours} hr${hours > 1 ? 's' : ''}`;
  } else {
    return `${mins} min`;
  }
}
