import type { OpenAI } from 'openai';
import type { LockedFacts, GeneratedContent, FactSheet } from '../normalization/types';
import type { QualityReport, QualityIssue } from './types';
import { evaluateRecipeQuality } from './engine';
import { regenerateSection } from '../deepseek/generate';

const MAX_REPAIR_PASSES = 3;

/**
 * Automatically repairs safe editorial issues (removes duplicate sentences, strips clichés)
 * and regenerates problematic sections with strict locked facts constraints.
 */
export async function repairRecipeContent(
  aiClient: OpenAI | null,
  factSheet: FactSheet,
  initialContent: GeneratedContent,
  initialReport: QualityReport
): Promise<{ repairedContent: GeneratedContent; finalReport: QualityReport; passesRun: number }> {
  let currentContent: GeneratedContent = JSON.parse(JSON.stringify(initialContent));

  // Normalize string fields in currentContent
  if (currentContent.introduction && typeof currentContent.introduction !== 'string') {
    currentContent.introduction = typeof (currentContent.introduction as any).introduction === 'string'
      ? (currentContent.introduction as any).introduction
      : String(currentContent.introduction);
  }
  if (currentContent.whyThisRecipe && typeof currentContent.whyThisRecipe !== 'string') {
    currentContent.whyThisRecipe = typeof (currentContent.whyThisRecipe as any).whyThisRecipe === 'string'
      ? (currentContent.whyThisRecipe as any).whyThisRecipe
      : String(currentContent.whyThisRecipe);
  }
  if (currentContent.servingSuggestions && typeof currentContent.servingSuggestions !== 'string') {
    currentContent.servingSuggestions = typeof (currentContent.servingSuggestions as any).servingSuggestions === 'string'
      ? (currentContent.servingSuggestions as any).servingSuggestions
      : String(currentContent.servingSuggestions);
  }
  if (currentContent.storage && typeof currentContent.storage !== 'string') {
    currentContent.storage = typeof (currentContent.storage as any).storage === 'string'
      ? (currentContent.storage as any).storage
      : String(currentContent.storage);
  }

  let currentReport: QualityReport = initialReport;
  let passes = 0;

  while (currentReport.status !== 'PASS' && passes < MAX_REPAIR_PASSES) {
    passes++;
    console.log(`[Quality Repair] Starting repair pass ${passes}/${MAX_REPAIR_PASSES} (Score: ${currentReport.score}, Issues: ${currentReport.issues.length})`);

    // 1. Safe deterministic text repairs (remove duplicated sentences)
    const repetitionIssues = currentReport.issues.filter(i => i.type === 'REPETITION' && i.found);
    for (const issue of repetitionIssues) {
      if (issue.found) {
        if (issue.section === 'Why You\'ll Love It' && currentContent.whyThisRecipe) {
          currentContent.whyThisRecipe = String(currentContent.whyThisRecipe).replace(issue.found, '').trim();
        } else if (issue.section === 'Serving Suggestions' && currentContent.servingSuggestions) {
          currentContent.servingSuggestions = String(currentContent.servingSuggestions).replace(issue.found, '').trim();
        } else if (issue.section === 'Tips' && Array.isArray(currentContent.tips)) {
          currentContent.tips = currentContent.tips.filter(t => !String(t).includes(issue.found!));
        }
      }
    }

    // 2. Deterministic temperature contradiction repairs
    const tempIssues = currentReport.issues.filter(i => i.type === 'TEMPERATURE_CONSISTENCY' && i.found);
    for (const issue of tempIssues) {
      if (issue.found && factSheet.lockedFacts.temperature) {
        const correctTemp = factSheet.lockedFacts.temperature;
        console.log(`[Quality Repair] Auto-fixing temperature contradiction: replacing "${issue.found}" with locked "${correctTemp}"`);
        if (currentContent.introduction) currentContent.introduction = String(currentContent.introduction).replaceAll(issue.found, correctTemp);
        if (currentContent.whyThisRecipe) currentContent.whyThisRecipe = String(currentContent.whyThisRecipe).replaceAll(issue.found, correctTemp);
        if (Array.isArray(currentContent.cookingGuidance)) {
          currentContent.cookingGuidance = currentContent.cookingGuidance.map(t => String(t).replaceAll(issue.found!, correctTemp));
        }
        if (Array.isArray(currentContent.tips)) {
          currentContent.tips = currentContent.tips.map(t => String(t).replaceAll(issue.found!, correctTemp));
        }
        if (currentContent.fullArticle) currentContent.fullArticle = String(currentContent.fullArticle).replaceAll(issue.found, correctTemp);
      }
    }

    // 3. Deterministic cook time contradiction repairs
    const timeIssues = currentReport.issues.filter(i => i.type === 'TIME_CONSISTENCY' && i.found);
    for (const issue of timeIssues) {
      const correctTime = `${factSheet.lockedFacts.cookTimeMinutes || factSheet.lockedFacts.cookTime || 30} minutes`;
      if (issue.found) {
        console.log(`[Quality Repair] Auto-fixing cook time: replacing "${issue.found}" with "${correctTime}"`);
        if (Array.isArray(currentContent.cookingGuidance)) {
          currentContent.cookingGuidance = currentContent.cookingGuidance.map(t => String(t).replaceAll(issue.found!, correctTime));
        }
        if (Array.isArray(currentContent.tips)) {
          currentContent.tips = currentContent.tips.map(t => String(t).replaceAll(issue.found!, correctTime));
        }
      }
    }

    // 4. Deterministic cliché removal
    const clicheIssues = currentReport.issues.filter(i => i.type === 'CLICHE' && i.found);
    for (const issue of clicheIssues) {
      if (issue.found) {
        console.log(`[Quality Repair] Removing detected cliché: "${issue.found}"`);
        if (currentContent.introduction) {
          currentContent.introduction = String(currentContent.introduction).replaceAll(issue.found, '').replace(/\s{2,}/g, ' ').trim();
        }
        if (currentContent.whyThisRecipe) {
          currentContent.whyThisRecipe = String(currentContent.whyThisRecipe).replaceAll(issue.found, '').replace(/\s{2,}/g, ' ').trim();
        }
      }
    }

    // 5. Deterministic method contradiction repairs (e.g. "one-bowl" on multi-bowl recipe)
    const methodIssues = currentReport.issues.filter(i => i.type === 'METHOD_CONTRADICTION' && i.found);
    for (const issue of methodIssues) {
      if (issue.found && !factSheet.lockedFacts.isOneBowl) {
        console.log(`[Quality Repair] Auto-fixing method contradiction: replacing "${issue.found}"`);
        const replaceMethod = (text: any) => {
          return String(text || '')
            .replace(/one[\s\-]bowl\s+(?:prep|method|cleanup)/gi, 'simple preparation')
            .replace(/one[\s\-]bowl\s+recipe/gi, 'classic recipe')
            .replace(/one[\s\-]bowl/gi, 'straightforward')
            .replace(/single[\s\-]bowl/gi, 'straightforward');
        };
        if (currentContent.introduction) currentContent.introduction = replaceMethod(currentContent.introduction);
        if (currentContent.whyThisRecipe) currentContent.whyThisRecipe = replaceMethod(currentContent.whyThisRecipe);
        if (Array.isArray(currentContent.tips)) currentContent.tips = currentContent.tips.map(replaceMethod);
        if (Array.isArray(currentContent.cookingGuidance)) currentContent.cookingGuidance = currentContent.cookingGuidance.map(replaceMethod);
        if (currentContent.fullArticle) currentContent.fullArticle = replaceMethod(currentContent.fullArticle);
      }
    }

    // 6. Deterministic forbidden author & social proof claim removal
    const socialIssues = currentReport.issues.filter(i => i.type === 'SOURCE_CLAIM_TRANSFER' && i.found);
    for (const issue of socialIssues) {
      if (issue.found) {
        console.log(`[Quality Repair] Removing forbidden author/social claim: "${issue.found}"`);
        const stripClaim = (text: any) => String(text || '').replaceAll(issue.found!, '').replace(/\s{2,}/g, ' ').trim();
        if (currentContent.introduction) currentContent.introduction = stripClaim(currentContent.introduction);
        if (currentContent.whyThisRecipe) currentContent.whyThisRecipe = stripClaim(currentContent.whyThisRecipe);
        if (Array.isArray(currentContent.tips)) currentContent.tips = currentContent.tips.map(stripClaim);
        if (currentContent.fullArticle) currentContent.fullArticle = stripClaim(currentContent.fullArticle);
      }
    }

    // 7. Deterministic storage duration consistency repairs
    const storageIssues = currentReport.issues.filter(i => i.type === 'STORAGE_INCONSISTENCY' && i.found);
    for (const issue of storageIssues) {
      if (issue.found && factSheet.lockedFacts.storageFacts) {
        const canonicalDays = factSheet.lockedFacts.storageFacts.roomTempDays;
        console.log(`[Quality Repair] Auto-fixing storage duration: aligning "${issue.found}" to "${canonicalDays}"`);
        if (currentContent.storage) currentContent.storage = String(currentContent.storage).replaceAll(issue.found, canonicalDays);
        if (Array.isArray(currentContent.tips)) currentContent.tips = currentContent.tips.map(t => String(t).replaceAll(issue.found!, canonicalDays));
      }
    }

    // 8. Section-specific regeneration for factual contradictions
    const factIssues = currentReport.issues.filter(i => i.severity === 'HIGH' && i.section && !['METHOD_CONTRADICTION', 'SOURCE_CLAIM_TRANSFER'].includes(i.type));
    if (aiClient && factIssues.length > 0) {
      // Find distinct affected sections
      const sectionsToRegen = [...new Set(factIssues.map(i => i.section?.toLowerCase()))];

      for (const sec of sectionsToRegen) {
        if (!sec) continue;
        console.log(`[Quality Repair] Regenerating affected section "${sec}" to resolve fact contradiction...`);

        try {
          let sectionKey: any = 'introduction';
          if (sec.includes('cook') || sec.includes('technique')) sectionKey = 'cookingGuidance';
          else if (sec.includes('tip')) sectionKey = 'tips';
          else if (sec.includes('serving')) sectionKey = 'servingSuggestions';
          else if (sec.includes('storage')) sectionKey = 'storage';
          else if (sec.includes('ingredient')) sectionKey = 'ingredientGuidance';
          else if (sec.includes('variation')) sectionKey = 'variations';
          else if (sec.includes('faq')) sectionKey = 'faq';
          else if (sec.includes('why') || sec.includes('love')) sectionKey = 'whyThisRecipe';

          const regenerated = await regenerateSection(aiClient, sectionKey, factSheet, currentContent);
          if (regenerated) {
            if (sectionKey === 'introduction') {
              currentContent.introduction = typeof regenerated === 'string' ? regenerated : (regenerated.introduction || String(regenerated));
              if (regenerated.whyThisRecipe) currentContent.whyThisRecipe = String(regenerated.whyThisRecipe);
            } else if (sectionKey === 'whyThisRecipe') {
              currentContent.whyThisRecipe = typeof regenerated === 'string' ? regenerated : (regenerated.whyThisRecipe || String(regenerated));
            } else if (sectionKey === 'cookingGuidance') {
              currentContent.cookingGuidance = Array.isArray(regenerated) ? regenerated : (Array.isArray(regenerated.cookingGuidance) ? regenerated.cookingGuidance : [String(regenerated)]);
            } else if (sectionKey === 'tips') {
              currentContent.tips = Array.isArray(regenerated) ? regenerated : (Array.isArray(regenerated.tips) ? regenerated.tips : [String(regenerated)]);
            } else if (sectionKey === 'ingredientGuidance') {
              currentContent.ingredientGuidance = Array.isArray(regenerated) ? regenerated : (Array.isArray(regenerated.ingredientGuidance) ? regenerated.ingredientGuidance : []);
            } else if (sectionKey === 'variations') {
              currentContent.variations = Array.isArray(regenerated) ? regenerated : (Array.isArray(regenerated.variations) ? regenerated.variations : []);
            } else if (sectionKey === 'servingSuggestions') {
              currentContent.servingSuggestions = typeof regenerated === 'string' ? regenerated : (regenerated.servingSuggestions || regenerated.serving || String(regenerated));
            } else if (sectionKey === 'storage') {
              currentContent.storage = typeof regenerated === 'string' ? regenerated : (regenerated.storage || String(regenerated));
            } else if (sectionKey === 'faq') {
              currentContent.faq = Array.isArray(regenerated) ? regenerated : (Array.isArray(regenerated.faq) ? regenerated.faq : []);
            } else {
              (currentContent as any)[sectionKey] = regenerated;
            }
          }
        } catch (err) {
          console.warn(`[Quality Repair] Failed to regenerate section "${sec}":`, err);
        }
      }
    }

    // Re-evaluate quality after this pass
    currentReport = evaluateRecipeQuality(factSheet.lockedFacts, currentContent, {
      repairAttempts: passes
    });

    console.log(`[Quality Repair] Pass ${passes} outcome: Status = ${currentReport.status}, Score = ${currentReport.score}`);
    
    // If passed or no further automated repairs possible, exit loop
    if (currentReport.status === 'PASS' || factIssues.length === 0 && repetitionIssues.length === 0) {
      break;
    }
  }

  return {
    repairedContent: currentContent,
    finalReport: currentReport,
    passesRun: passes
  };
}
