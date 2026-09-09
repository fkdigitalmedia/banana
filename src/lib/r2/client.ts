export async function uploadImage(bucket: R2Bucket, key: string, data: ArrayBuffer, contentType: string): Promise<void> {
  await bucket.put(key, data, {
    httpMetadata: {
      contentType,
    },
  });
}

export async function deleteImage(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key);
}

export async function getObjectMetadata(bucket: R2Bucket, key: string): Promise<R2Object | null> {
  return await bucket.head(key);
}

export function getPublicUrl(key: string, baseUrl: string): string {
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const cleanKey = key.startsWith('/') ? key.slice(1) : key;
  return `${cleanBase}/${cleanKey}`;
}

export function generateRecipeImageKey(slug: string, filename: string): string {
  return `recipes/${slug}/${filename}`;
}
