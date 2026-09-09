export interface ParsedInstruction {
  stepNumber: number;
  text: string;
}

export function parseInstructions(raw: any[]): ParsedInstruction[] {
  const flattened: string[] = [];
  
  function recurse(item: any) {
    if (!item) return;
    if (typeof item === 'string') {
      flattened.push(item);
    } else if (Array.isArray(item)) {
      item.forEach(recurse);
    } else if (typeof item === 'object') {
      if (item['@type'] === 'HowToSection') {
        if (item.itemListElement) recurse(item.itemListElement);
      } else if (item['@type'] === 'HowToStep') {
        if (item.itemListElement) recurse(item.itemListElement);
        else if (item.text) flattened.push(item.text);
        else if (item.name) flattened.push(item.name);
      } else if (item.text) {
        flattened.push(item.text);
      }
    }
  }

  recurse(raw);
  return cleanInstructions(flattened);
}

export function cleanInstructions(texts: string[]): ParsedInstruction[] {
  return texts
    .map(t => {
      let cleaned = t.replace(/<[^>]+>/g, '');
      cleaned = cleaned.replace(/\s+/g, ' ');
      cleaned = cleaned.replace(/^\s*\d+\.?\s*/, '');
      cleaned = cleaned.replace(/^[•\-\*]\s*/, '');
      return cleaned.trim();
    })
    .filter(t => t.length > 0)
    .map((text, idx) => ({
      stepNumber: idx + 1,
      text
    }));
}
