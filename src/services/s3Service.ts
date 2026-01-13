/**
 * S3Service - 생성된 이미지를 S3에 업로드
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const KNOWLEDGE_BASE_BUCKET = process.env.KNOWLEDGE_BASE_BUCKET || 'your-knowledge-base-bucket';

/**
 * 히스토리 S3 업로드 결과
 */
export interface HistoryS3Result {
  imageKey: string;
  imageUrl: string;
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
    });
  }
  return s3Client;
}

/**
 * Knowledge Base 버킷의 S3 키로부터 전체 URL 생성
 */
export function getKnowledgeBaseS3Url(s3Key: string): string {
  return `https://${KNOWLEDGE_BASE_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;
}

/**
 * 날짜 기반 S3 경로 생성
 * 형식: {bucket}/{cognito-sub}/history/{YYYY}/{MM}/{DD}/
 * @param cognitoSub - Cognito 사용자 sub
 * @param recordDate - 히스토리 기록 날짜
 * @returns S3 경로 (버킷명 제외)
 */
export function buildHistoryPath(cognitoSub: string, recordDate: Date): string {
  const year = recordDate.getFullYear().toString();
  const month = String(recordDate.getMonth() + 1).padStart(2, '0');
  const day = String(recordDate.getDate()).padStart(2, '0');
  
  return `${cognitoSub}/history/${year}/${month}/${day}/`;
}

/**
 * 이미지 파일명 생성
 * 형식: image_{timestamp}.png
 */
export function buildImageFileName(timestamp: number): string {
  return `image_${timestamp}.png`;
}

/**
 * 히스토리 이미지를 S3에 업로드 (이미지만)
 * @param cognitoSub - 사용자 Cognito Sub
 * @param recordDate - 히스토리 기록 날짜
 * @param imageBase64 - base64 인코딩된 이미지
 * @returns HistoryS3Result
 */
export async function uploadHistoryContent(
  cognitoSub: string,
  recordDate: Date,
  imageBase64: string
): Promise<HistoryS3Result> {
  const client = getS3Client();
  const timestamp = Date.now();
  const basePath = buildHistoryPath(cognitoSub, recordDate);
  
  // 이미지 업로드
  const imageFileName = buildImageFileName(timestamp);
  const imageKey = `${basePath}${imageFileName}`;
  const imageBuffer = Buffer.from(imageBase64, 'base64');
  
  await client.send(new PutObjectCommand({
    Bucket: KNOWLEDGE_BASE_BUCKET,
    Key: imageKey,
    Body: imageBuffer,
    ContentType: 'image/png',
  }));
  
  console.log(`[S3Service] Image uploaded: ${imageKey}`);
  
  return {
    imageKey,
    imageUrl: getKnowledgeBaseS3Url(imageKey),
  };
}


/**
 * S3에서 파일 삭제
 * @param s3Key - 삭제할 S3 키
 */
export async function deleteS3Object(s3Key: string): Promise<void> {
  if (!s3Key) return;
  
  try {
    const client = getS3Client();
    await client.send(new DeleteObjectCommand({
      Bucket: KNOWLEDGE_BASE_BUCKET,
      Key: s3Key,
    }));
    console.log(`[S3Service] Deleted: ${s3Key}`);
  } catch (error) {
    console.error(`[S3Service] Failed to delete ${s3Key}:`, error);
  }
}

/**
 * 이전 히스토리 이미지 삭제
 * @param oldImageKey - 이전 이미지 S3 키
 */
export async function deleteOldHistoryFiles(oldImageKey?: string): Promise<void> {
  if (oldImageKey) {
    await deleteS3Object(oldImageKey);
  }
}
