/**
 * Image Generator API Server
 * 
 * History 이미지 자동 생성 REST API
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { initPool, closePool } from './services/database.js';
import {
  getHistoriesWithoutImage,
  getHistoryById,
  generateImageForHistory,
  generateImagesForAllHistories,
  previewImageForHistory,
  confirmImageForHistory
} from './services/historyService.js';
import { generateImage } from './services/imageGenerator.js';
import { buildPrompt } from './services/promptBuilder.js';
import { getKnowledgeBaseS3Url } from './services/s3Service.js';

const app = express();
const PORT = process.env.PORT || 8002;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'image-generator', timestamp: new Date().toISOString() });
});

app.get('/api/v1/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'image-generator', timestamp: new Date().toISOString() });
});

/**
 * GET /api/v1/histories/without-image
 * 이미지가 없는 History 목록 조회
 */
app.get('/api/v1/histories/without-image', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const histories = await getHistoriesWithoutImage(limit);
    
    res.json({
      success: true,
      count: histories.length,
      data: histories.map(h => ({
        id: h.id,
        userId: h.user_id,
        content: h.content,
        recordDate: h.record_date,
        tags: h.tags,
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});


/**
 * GET /api/v1/histories/:id
 * 특정 History 조회
 */
app.get('/api/v1/histories/:id', async (req: Request, res: Response) => {
  try {
    const historyId = parseInt(req.params.id);
    if (isNaN(historyId)) {
      res.status(400).json({ success: false, error: 'Invalid history ID' });
      return;
    }

    const history = await getHistoryById(historyId);
    if (!history) {
      res.status(404).json({ success: false, error: 'History not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        id: history.id,
        userId: history.user_id,
        content: history.content,
        recordDate: history.record_date,
        tags: history.tags,
        s3Key: history.s3_key,
        imageUrl: history.s3_key ? getKnowledgeBaseS3Url(history.s3_key) : null,
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/v1/histories/:id/generate-image
 * 특정 History에 대해 이미지 생성 (기존 - 바로 저장)
 */
app.post('/api/v1/histories/:id/generate-image', async (req: Request, res: Response) => {
  try {
    const historyId = parseInt(req.params.id);
    if (isNaN(historyId)) {
      res.status(400).json({ success: false, error: 'Invalid history ID' });
      return;
    }

    console.log(`[API] Generating image for history ${historyId}...`);
    const result = await generateImageForHistory(historyId);

    if (result.error) {
      res.status(result.error === 'History not found' ? 404 : 500).json({
        success: false,
        error: result.error
      });
      return;
    }

    res.json({
      success: true,
      data: {
        historyId: result.historyId,
        userId: result.userId,
        imageGenerated: result.imageGenerated,
        alreadyHadImage: result.hasImage && !result.imageGenerated,
        s3Key: result.s3Key,
        textKey: result.textKey,
        imageUrl: result.imageUrl || (result.s3Key ? getKnowledgeBaseS3Url(result.s3Key) : null),
        textUrl: result.textUrl || (result.textKey ? getKnowledgeBaseS3Url(result.textKey) : null),
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/v1/histories/:id/preview-image
 * 이미지 미리보기 생성 (S3/DB 저장 안 함)
 */
app.post('/api/v1/histories/:id/preview-image', async (req: Request, res: Response) => {
  try {
    const historyId = parseInt(req.params.id);
    if (isNaN(historyId)) {
      res.status(400).json({ success: false, error: 'Invalid history ID' });
      return;
    }

    console.log(`[API] Generating preview image for history ${historyId}...`);
    const result = await previewImageForHistory(historyId);

    if (!result.success) {
      res.status(result.error === 'History not found' ? 404 : 500).json({
        success: false,
        error: result.error
      });
      return;
    }

    res.json({
      success: true,
      data: {
        historyId: result.historyId,
        userId: result.userId,
        imageBase64: result.imageBase64,
        prompt: {
          positive: result.positivePrompt,
          negative: result.negativePrompt,
        }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/v1/histories/:id/confirm-image
 * 이미지 확정 저장 (S3 + DB)
 */
app.post('/api/v1/histories/:id/confirm-image', async (req: Request, res: Response) => {
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
    const result = await confirmImageForHistory(historyId, imageBase64);

    if (result.error) {
      res.status(result.error === 'History not found' ? 404 : 500).json({
        success: false,
        error: result.error
      });
      return;
    }

    res.json({
      success: true,
      data: {
        historyId: result.historyId,
        userId: result.userId,
        s3Key: result.s3Key,
        textKey: result.textKey,
        imageUrl: result.imageUrl,
        textUrl: result.textUrl,
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});


/**
 * POST /api/v1/histories/batch-generate
 * 배치로 여러 History에 이미지 생성
 */
app.post('/api/v1/histories/batch-generate', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.body.limit as string) || 5;
    if (limit > 20) {
      res.status(400).json({ success: false, error: 'Limit cannot exceed 20' });
      return;
    }

    console.log(`[API] Batch generating images for up to ${limit} histories...`);
    const results = await generateImagesForAllHistories(limit);

    const summary = {
      total: results.length,
      generated: results.filter(r => r.imageGenerated).length,
      skipped: results.filter(r => r.hasImage && !r.imageGenerated).length,
      failed: results.filter(r => !r.hasImage && !r.imageGenerated).length,
    };

    res.json({
      success: true,
      summary,
      data: results.map(r => ({
        historyId: r.historyId,
        userId: r.userId,
        imageGenerated: r.imageGenerated,
        alreadyHadImage: r.hasImage && !r.imageGenerated,
        s3Key: r.s3Key,
        textKey: r.textKey,
        imageUrl: r.imageUrl || (r.s3Key ? getKnowledgeBaseS3Url(r.s3Key) : null),
        textUrl: r.textUrl || (r.textKey ? getKnowledgeBaseS3Url(r.textKey) : null),
        error: r.error,
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/v1/generate-image
 * 텍스트로 직접 이미지 생성 (History 없이)
 */
app.post('/api/v1/generate-image', async (req: Request, res: Response) => {
  try {
    const { text, positivePrompt, negativePrompt } = req.body;

    if (!text && !positivePrompt) {
      res.status(400).json({ success: false, error: 'Either text or positivePrompt is required' });
      return;
    }

    let finalPositive: string;
    let finalNegative: string;

    if (positivePrompt) {
      finalPositive = positivePrompt;
      finalNegative = negativePrompt || '';
    } else {
      const prompt = buildPrompt(text);
      finalPositive = prompt.positivePrompt;
      finalNegative = prompt.negativePrompt;
    }

    console.log(`[API] Generating image from text...`);
    const result = await generateImage(finalPositive, finalNegative);

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error });
      return;
    }

    res.json({
      success: true,
      data: {
        imageBase64: result.imageBase64,
        prompt: {
          positive: finalPositive,
          negative: finalNegative,
        }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});


/**
 * POST /api/v1/build-prompt
 * 텍스트를 이미지 생성 프롬프트로 변환 (미리보기용)
 */
app.post('/api/v1/build-prompt', (req: Request, res: Response) => {
  try {
    const { text } = req.body;

    if (!text) {
      res.status(400).json({ success: false, error: 'text is required' });
      return;
    }

    const prompt = buildPrompt(text);

    res.json({
      success: true,
      data: {
        positivePrompt: prompt.positivePrompt,
        negativePrompt: prompt.negativePrompt,
      }
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
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  await closePool();
  process.exit(0);
});

// Start server
async function start() {
  try {
    await initPool();
    console.log('[Server] Database connected');
    
    app.listen(PORT, () => {
      console.log('='.repeat(60));
      console.log('🚀 Image Generator API Server');
      console.log('='.repeat(60));
      console.log(`📡 Server running on port ${PORT}`);
      console.log(`📖 Health check: http://localhost:${PORT}/health`);
      console.log(`🎨 API Base: http://localhost:${PORT}/api/v1`);
      console.log('='.repeat(60));
    });
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

start();

export default app;
