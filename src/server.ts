/**
 * Image Generator API Server
 * 
 * FastAPI Agent 서버 프록시
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_PATH = process.env.BASE_PATH || '/image';

// FastAPI Agent 서버 URL
const AGENT_API_URL = process.env.AGENT_API_URL || 'https://api.aws11.shop/agent/image';

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

// Middleware
app.use(cors());
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
 * 이미지 확정 저장 (S3 업로드)
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
    
    const result = await invokeImageAgent({
      action: 'upload',
      user_id: userId,
      image_base64: imageBase64,
      record_date: recordDate,
    }) as { success: boolean; s3Key?: string; imageUrl?: string; userId?: string; error?: string };

    // 프론트엔드 기대 형식에 맞게 응답 변환
    if (result.success && result.s3Key) {
      res.json({
        success: true,
        data: {
          historyId,
          userId: result.userId,
          s3Key: result.s3Key,
          imageUrl: result.imageUrl,
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
