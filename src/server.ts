/**
 * Image Generator API Server
 * 
 * Strands AI Agent (Bedrock Agent Core Runtime) 프록시 서버
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_PATH = process.env.BASE_PATH || '/image';

// Agent Core Runtime 설정
const AGENT_RUNTIME_ARN = process.env.AGENT_RUNTIME_ARN || 
  'arn:aws:bedrock-agentcore:us-east-1:324547056370:runtime/diary_orchestrator_agent-90S9ctAFht';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Bedrock Agent Core 클라이언트
let agentClient: BedrockAgentCoreClient | null = null;

function getAgentClient(): BedrockAgentCoreClient {
  if (!agentClient) {
    agentClient = new BedrockAgentCoreClient({
      region: AWS_REGION,
    });
  }
  return agentClient;
}

/**
 * Agent Core Runtime 호출
 */
async function invokeAgent(payload: Record<string, unknown>): Promise<unknown> {
  const client = getAgentClient();
  
  const command = new InvokeAgentRuntimeCommand({
    agentRuntimeArn: AGENT_RUNTIME_ARN,
    runtimeSessionId: uuidv4(),
    payload: new TextEncoder().encode(JSON.stringify(payload)),
    qualifier: 'DEFAULT',
    contentType: 'application/json',
    accept: 'application/json',
  });

  const response = await client.send(command);
  
  // 스트림 응답 처리
  if (response.response) {
    const bytes = await response.response.transformToByteArray();
    const resultText = new TextDecoder().decode(bytes);
    return JSON.parse(resultText);
  }
  
  return { error: 'No response from agent' };
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
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
 * GET /image/histories/without-image
 * 이미지가 없는 히스토리 목록 조회
 */
app.get(`${BASE_PATH}/histories/without-image`, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    
    const result = await invokeAgent({
      content: `이미지가 없는 히스토리 ${limit}개 조회해줘`,
      request_type: 'image',
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API Error]', message);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /image/histories/:id
 * 특정 히스토리 조회
 */
app.get(`${BASE_PATH}/histories/:id`, async (req: Request, res: Response) => {
  try {
    const historyId = parseInt(req.params.id);
    if (isNaN(historyId)) {
      res.status(400).json({ success: false, error: 'Invalid history ID' });
      return;
    }

    const result = await invokeAgent({
      content: `히스토리 ${historyId}번 정보 조회해줘`,
      request_type: 'image',
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /image/histories/:id/generate-image
 * 히스토리에 이미지 생성
 */
app.post(`${BASE_PATH}/histories/:id/generate-image`, async (req: Request, res: Response) => {
  try {
    const historyId = parseInt(req.params.id);
    if (isNaN(historyId)) {
      res.status(400).json({ success: false, error: 'Invalid history ID' });
      return;
    }

    console.log(`[API] Generating image for history ${historyId}...`);
    
    const result = await invokeAgent({
      content: `히스토리 ${historyId}번 이미지 생성해줘`,
      request_type: 'image',
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /image/histories/:id/preview-image
 * 이미지 미리보기 생성
 */
app.post(`${BASE_PATH}/histories/:id/preview-image`, async (req: Request, res: Response) => {
  try {
    const historyId = parseInt(req.params.id);
    if (isNaN(historyId)) {
      res.status(400).json({ success: false, error: 'Invalid history ID' });
      return;
    }

    console.log(`[API] Generating preview image for history ${historyId}...`);
    
    const result = await invokeAgent({
      content: `히스토리 ${historyId}번 이미지 미리보기 생성해줘`,
      request_type: 'image',
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /image/histories/:id/confirm-image
 * 이미지 확정 저장
 */
app.post(`${BASE_PATH}/histories/:id/confirm-image`, async (req: Request, res: Response) => {
  try {
    const historyId = parseInt(req.params.id);
    const { imageBase64 } = req.body;

    if (isNaN(historyId)) {
      res.status(400).json({ success: false, error: 'Invalid history ID' });
      return;
    }

    if (!imageBase64) {
      res.status(400).json({ success: false, error: 'imageBase64 is required' });
      return;
    }

    console.log(`[API] Confirming image for history ${historyId}...`);
    
    const result = await invokeAgent({
      content: `히스토리 ${historyId}번 이미지 확정 저장해줘`,
      request_type: 'image',
      image_base64: imageBase64,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /image/histories/batch-generate
 * 배치 이미지 생성
 */
app.post(`${BASE_PATH}/histories/batch-generate`, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.body.limit as string) || 5;
    if (limit > 20) {
      res.status(400).json({ success: false, error: 'Limit cannot exceed 20' });
      return;
    }

    console.log(`[API] Batch generating images for up to ${limit} histories...`);
    
    const result = await invokeAgent({
      content: `이미지가 없는 히스토리 ${limit}개에 대해 배치로 이미지 생성해줘`,
      request_type: 'image',
    });

    res.json({
      success: true,
      data: result,
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
    
    const result = await invokeAgent({
      content: positivePrompt 
        ? `다음 프롬프트로 이미지 생성해줘: ${positivePrompt}`
        : `다음 텍스트로 이미지 생성해줘: ${text}`,
      request_type: 'image',
    });

    res.json({
      success: true,
      data: result,
    });
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

    const result = await invokeAgent({
      content: `다음 텍스트를 이미지 프롬프트로 변환해줘 (이미지 생성은 하지 마): ${text}`,
      request_type: 'image',
    });

    res.json({
      success: true,
      data: result,
    });
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
  console.log(`🤖 Agent ARN: ${AGENT_RUNTIME_ARN}`);
  console.log('='.repeat(60));
});

export default app;
