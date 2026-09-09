import type { FactSheet } from '../../normalization/types';

export function buildGuidancePrompt(factSheet: FactSheet, analysis: any): { system: string; user: string } {
  const system = `You are an expert recipe writer. Provide guidance on ingredients and cooking methods.
Rules:
- Only explain genuinely useful things
- Do not invent health claims
- Do NOT alter locked facts
Respond ONLY with a raw JSON object and no markdown.
Output format:
{
  "ingredientGuidance": [{"ingredient": "string", "guidance": "string"}],
  "cookingGuidance": ["string"]
}`;

  const user = JSON.stringify({ facts: factSheet.lockedFacts, analysis }, null, 2);

  return { system, user };
}
