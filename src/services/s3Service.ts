/**
 * S3Service - 생성된 이미지를 S3에 업로드
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const S3_BUCKET = process.env.S3_BUCKET || 'library-bucket-youkkk';

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
 * 현재 날짜를 YYYY-MM 형식으로 반환
 */
function getCurrentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * AI 생성 이미지를 S3에 업로드
 * @param cognitoSub - Cognito 사용자 sub
 * @param imageBase64 - base64 인코딩된 이미지 데이터
 * @returns S3 키 (URL 아님)
 */
export async function uploadGeneratedHistoryImage(
  cognitoSub: string,
  imageBase64: string
): Promise<string> {
  const timestamp = Date.now();
  const yearMonth = getCurrentYearMonth();
  const s3Key = `${cognitoSub}/${yearMonth}/generated_${timestamp}.png`;

  // base64를 Buffer로 변환
  const imageBuffer = Buffer.from(imageBase64, 'base64');

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: s3Key,
    Body: imageBuffer,
    ContentType: 'image/png',
  });

  const client = getS3Client();
  await client.send(command);

  console.log(`[S3Service] Generated image uploaded: ${s3Key}`);
  return s3Key;
}

/**
 * S3 키로부터 전체 URL 생성
 */
export function getS3Url(s3Key: string): string {
  return `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;
}
