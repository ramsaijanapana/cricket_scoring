import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config';

const useS3 = !!env.S3_BUCKET;

const s3 = useS3 ? new S3Client({
  region: env.S3_REGION,
  ...(env.S3_ENDPOINT ? {
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: true, // For R2/MinIO compatibility
  } : {}),
}) : null;

export async function uploadFile(key: string, buffer: Buffer, contentType: string): Promise<string> {
  if (s3 && env.S3_BUCKET) {
    await s3.send(new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));

    if (env.S3_CDN_URL) return `${env.S3_CDN_URL}/${key}`;
    return `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com/${key}`;
  }

  // Fallback to local storage (dev mode)
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const uploadsDir = path.resolve(__dirname, '../../uploads');
  const filepath = path.join(uploadsDir, key);

  // Ensure directory exists
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, buffer);

  return `/uploads/${key}`;
}

export async function deleteFile(key: string): Promise<void> {
  if (s3 && env.S3_BUCKET) {
    await s3.send(new DeleteObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }));
    return;
  }

  // Local fallback
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const filepath = path.resolve(__dirname, '../../uploads', key);
  try { fs.unlinkSync(filepath); } catch {}
}
