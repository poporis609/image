/**
 * Image Generator API Server
 * 
 * FastAPI Agent 서버 프록시 + S3 이미지 관리
 */

// OpenTelemetry must be imported first
import './tracing';

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_PATH = process.env.BASE_PATH || '/image';

// FastAPI Agent 서버 URL
const AGENT_API_URL = process.env.AGENT_API_URL || 'https://api.aws11.shop/agent/image';

// S3 설정
const S3_BUCKET = process.env.S3_BUCKET || 'knowledge-base-test-6575574';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

const s3Client = new S3Client({ region: AWS_REGION });
const lambdaClient = new LambdaClient({ region: AWS_REGION });

/**
 * Lambda를 통해 DB 업데이트
 */
async function updateHistoryS3Key(historyId: number, s3Key: string): Promise<boolean> {
  try {
    const query = `UPDATE history SET s3_key = '${s3Key}' WHERE id = ${historyId}`;
    
    const response = await lambdaClient.send(new InvokeCommand({
      FunctionName: 'QueryDatabase',
      Payload: JSON.stringify({ query }),
    }));
    
    const result = JSON.parse(new TextDecoder().decode(response.Payload));
    console.log(`[DB] Updated history ${historyId} with s3_key: ${s3Key}`);
    return result.statusCode === 200;
  } catch (error) {
    console.error(`[DB] Update error:`, error);
    return false;
  }
}

/**
 * FastAPI Agent 서버 호출
 */
async function invokeImageAgent(payload: Record<string, unknown>): Promise<unknown> {
  console.log(`[Agent] ========== Agent 호출 시작 ==========`);
  console.log(`[Agent] URL: ${AGENT_API_URL}`);
  console.log(`[Agent] Payload:`, JSON.stringify(payload, null, 2).substring(0, 500));
  
  try {
    const startTime = Date.now();
    const response = await fetch(AGENT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const duration = Date.now() - startTime;
    
    console.log(`[Agent] 응답 수신 (${duration}ms) - Status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Agent] ❌ 에러 응답:`, errorText);
      throw new Error(`Agent API error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log(`[Agent] 응답 success: ${result.success}`);
    console.log(`[Agent] ========== Agent 호출 완료 ==========`);
    
    return result;
  } catch (error) {
    console.error(`[Agent] ❌ 에러 발생:`, error);
    console.log(`[Agent] ========== Agent 호출 실패 ==========`);
    throw error;
  }
}

/**
 * S3에 이미지 업로드
 */
async function uploadToS3(userId: string, imageBase64: string, recordDate?: string): Promise<{ s3Key: string; imageUrl: string }> {
  const date = recordDate ? new Date(recordDate) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const timestamp = Date.now();
  
  const s3Key = `${userId}/history/${year}/${month}/${day}/image_${timestamp}.png`;
  
  const imageBuffer = Buffer.from(imageBase64, 'base64');
  
  await s3Client.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: s3Key,
    Body: imageBuffer,
    ContentType: 'image/png',
  }));
  
  const imageUrl = `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;
  console.log(`[S3] Uploaded: ${s3Key}`);
  
  return { s3Key, imageUrl };
}

/**
 * S3에서 이미지 삭제
 */
async function deleteFromS3(s3UrlOrKey: string): Promise<boolean> {
  try {
    let s3Key: string;
    
    // URL인지 key인지 판단
    if (s3UrlOrKey.includes('.amazonaws.com/')) {
      // 전체 URL인 경우 key 추출
      const parts = s3UrlOrKey.split('.amazonaws.com/');
      s3Key = parts[1];
    } else {
      // 이미 key인 경우 그대로 사용
      s3Key = s3UrlOrKey;
    }
    
    await s3Client.send(new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    }));
    
    console.log(`[S3] Deleted: ${s3Key}`);
    return true;
  } catch (error) {
    console.error(`[S3] Delete error:`, error);
    return false;
  }
}

/**
 * S3 폴더 내 기존 이미지들 삭제
 */
async function deleteExistingImagesInFolder(userId: string, recordDate?: string): Promise<number> {
  const date = recordDate ? new Date(recordDate) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  const prefix = `${userId}/history/${year}/${month}/${day}/`;
  
  try {
    // 폴더 내 파일 목록 조회
    const listResponse = await s3Client.send(new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: prefix,
    }));
    
    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      console.log(`[S3] No existing images in folder: ${prefix}`);
      return 0;
    }
    
    // 이미지 파일만 필터링 (image_로 시작하는 png 파일)
    const imageFiles = listResponse.Contents.filter(obj => 
      obj.Key && obj.Key.includes('/image_') && obj.Key.endsWith('.png')
    );
    
    // 각 이미지 삭제
    let deletedCount = 0;
    for (const obj of imageFiles) {
      if (obj.Key) {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: S3_BUCKET,
          Key: obj.Key,
        }));
        console.log(`[S3] Deleted existing image: ${obj.Key}`);
        deletedCount++;
      }
    }
    
    console.log(`[S3] Deleted ${deletedCount} existing images from ${prefix}`);
    return deletedCount;
  } catch (error) {
    console.error(`[S3] Error deleting existing images:`, error);
    return 0;
  }
}

// Middleware
app.use(cors({
  origin: ['https://api.aws11.shop', 'https://www.aws11.shop', 'https://web.aws11.shop'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  console.log(`[Request] ➡️  ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    const bodyLog = { ...req.body };
    if (bodyLog.imageBase64) {
      bodyLog.imageBase64 = `[base64 image, ${bodyLog.imageBase64.length} chars]`;
    }
    if (bodyLog.image_base64) {
      bodyLog.image_base64 = `[base64 image, ${bodyLog.image_base64.length} chars]`;
    }
    console.log(`[Request] Body:`, JSON.stringify(bodyLog));
  }
  
  const originalSend = res.send.bind(res);
  res.send = (body: unknown) => {
    const duration = Date.now() - startTime;
    console.log(`[Response] ⬅️  ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    return originalSend(body);
  };
  
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'image-generator-proxy', timestamp: new Date().toISOString() });
});

app.get(`${BASE_PATH}/health`, (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'image-generator-proxy', timestamp: new Date().toISOString() });
});

/**
 * POST /image/histories/:id/preview-image
 * 이미지 미리보기 생성
 */
app.post(`${BASE_PATH}/histories/:id/preview-image`, async (req: Request, res: Response) => {
  try {
    const historyId = parseInt(req.params.id);
    const { text } = req.body;
    
    if (isNaN(historyId)) {
      res.status(400).json({ success: false, error: 'Invalid history ID' });
      return;
    }

    if (!text) {
      res.status(400).json({ 
        success: false, 
        error: 'text is required. 프론트에서 일기 내용(description)을 전달해주세요.' 
      });
      return;
    }

    console.log(`[API] Generating preview image for history ${historyId}...`);
    
    const result = await invokeImageAgent({
      action: 'generate',
      text: text,
    }) as { success: boolean; imageBase64?: string; prompt?: object; error?: string };

    // 프론트엔드 기대 형식에 맞게 응답 변환
    if (result.success && result.imageBase64) {
      res.json({
        success: true,
        data: {
          historyId,
          imageBase64: result.imageBase64,
          prompt: result.prompt,
        }
      });
    } else {
      res.json(result);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /image/histories/:id/confirm-image
 * 이미지 확정 저장 (S3 업로드 + 기존 이미지 삭제)
 */
app.post(`${BASE_PATH}/histories/:id/confirm-image`, async (req: Request, res: Response) => {
  try {
    const historyId = parseInt(req.params.id);
    const { imageBase64, userId, recordDate } = req.body;

    if (isNaN(historyId)) {
      res.status(400).json({ success: false, error: 'Invalid history ID' });
      return;
    }

    if (!imageBase64) {
      res.status(400).json({ success: false, error: 'imageBase64 is required' });
      return;
    }

    if (!userId) {
      res.status(400).json({ 
        success: false, 
        error: 'userId is required. 프론트에서 cognito_sub을 전달해주세요.' 
      });
      return;
    }

    console.log(`[API] Confirming image for history ${historyId}...`);
    
    // 1. 해당 날짜 폴더의 기존 이미지들 삭제
    const deletedCount = await deleteExistingImagesInFolder(userId, recordDate);
    console.log(`[API] Deleted ${deletedCount} existing images`);
    
    // 2. 새 이미지 S3 업로드
    const { s3Key, imageUrl } = await uploadToS3(userId, imageBase64, recordDate);

    // 3. DB에 s3_key 업데이트
    const dbUpdated = await updateHistoryS3Key(historyId, s3Key);
    console.log(`[API] DB updated: ${dbUpdated}`);

    res.json({
      success: true,
      data: {
        historyId,
        userId,
        s3Key,
        imageUrl,
        deletedCount,
        dbUpdated,
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /image/generate
 * 텍스트로 직접 이미지 생성
 */
app.post(`${BASE_PATH}/generate`, async (req: Request, res: Response) => {
  try {
    const { text, positivePrompt } = req.body;

    if (!text && !positivePrompt) {
      res.status(400).json({ success: false, error: 'Either text or positivePrompt is required' });
      return;
    }

    console.log(`[API] Generating image from text...`);
    
    const result = await invokeImageAgent({
      action: 'generate',
      text: text || positivePrompt,
    });

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /image/build-prompt
 * 프롬프트만 생성
 */
app.post(`${BASE_PATH}/build-prompt`, async (req: Request, res: Response) => {
  try {
    const { text } = req.body;

    if (!text) {
      res.status(400).json({ success: false, error: 'text is required' });
      return;
    }

    const result = await invokeImageAgent({
      action: 'prompt',
      text: text,
    });

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[API Error]', err);
  res.status(500).json({ success: false, error: err.message });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 Image Generator Proxy Server');
  console.log('='.repeat(60));
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`📖 Health check: http://localhost:${PORT}${BASE_PATH}/health`);
  console.log(`🎨 API Base: http://localhost:${PORT}${BASE_PATH}`);
  console.log(`🤖 Agent API: ${AGENT_API_URL}`);
  console.log('='.repeat(60));
});

export default app;
