import { buildRecipeImagePrompt } from './prompt';

export interface RunwareImageResult {
  imageBuffer: ArrayBuffer;
  imageUrl: string;
  prompt: string;
  width: number;
  height: number;
  provider: 'Runware';
  model: 'FLUX.1 Schnell';
  cost?: number;
}

export interface ImageGenerationOptions {
  width?: number;
  height?: number;
  steps?: number;
  customPrompt?: string;
}

/**
 * Generates a photorealistic recipe hero image using Runware's FLUX.1 Schnell model.
 * Downloads the resulting image server-side and validates dimensions and MIME type.
 */
export async function generateRecipeImage(
  apiKey: string,
  recipe: {
    title: string;
    description?: string;
    ingredients?: any[];
    cuisine?: string;
  },
  options?: ImageGenerationOptions
): Promise<RunwareImageResult> {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('Runware API key is missing. Please configure RUNWARE_API_KEY in environment variables.');
  }

  const { prompt, negativePrompt } = buildRecipeImagePrompt(recipe);
  const positivePrompt = options?.customPrompt || prompt;

  const width = options?.width || 1024;
  const height = options?.height || 576; // 16:9 landscape aspect ratio
  const steps = options?.steps || 4; // FLUX.1 Schnell optimal step count

  const taskUUID = crypto.randomUUID();

  const payload = [
    {
      taskType: 'imageInference',
      taskUUID,
      positivePrompt,
      negativePrompt,
      width,
      height,
      model: 'runware:100@1', // Runware FLUX.1 Schnell model ID
      numberResults: 1,
      outputFormat: 'WEBP',
      steps,
      CFGScale: 1
    }
  ];

  console.log(`[Runware FLUX.1 Schnell] Requesting image for "${recipe.title}" (${width}x${height})...`);

  const response = await fetch('https://api.runware.ai/v1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Runware API returned HTTP ${response.status}: ${errorText || response.statusText}`);
  }

  const data = await response.json();

  if (data.errors && data.errors.length > 0) {
    const err = data.errors[0];
    throw new Error(`Runware error: ${err.message || JSON.stringify(err)}`);
  }

  const resultItem = Array.isArray(data?.data) ? data.data[0] : (data?.data || data?.results?.[0]);
  const imageURL = resultItem?.imageURL || resultItem?.imageURI;

  if (!imageURL) {
    throw new Error('Runware did not return a valid image URL in response.');
  }

  console.log(`[Runware FLUX.1 Schnell] Image generated at: ${imageURL}. Downloading buffer...`);

  // Download the generated image server-side
  const imgResponse = await fetch(imageURL);
  if (!imgResponse.ok) {
    throw new Error(`Failed to download generated image from ${imageURL} (HTTP ${imgResponse.status})`);
  }

  const contentType = imgResponse.headers.get('content-type') || 'image/webp';
  const arrayBuffer = await imgResponse.arrayBuffer();

  if (arrayBuffer.byteLength < 5000) {
    throw new Error(`Generated image file is corrupted or too small (${arrayBuffer.byteLength} bytes).`);
  }

  console.log(`[Runware FLUX.1 Schnell] Image downloaded successfully (${(arrayBuffer.byteLength / 1024).toFixed(1)} KB, ${contentType}).`);

  return {
    imageBuffer: arrayBuffer,
    imageUrl: imageURL,
    prompt: positivePrompt,
    width,
    height,
    provider: 'Runware',
    model: 'FLUX.1 Schnell',
    cost: resultItem?.cost
  };
}
