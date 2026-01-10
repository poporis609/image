/**
 * HistoryService - History 조회 및 이미지 자동 생성
 */

import { query, queryOne, execute } from './database.js';
import { buildPrompt } from './promptBuilder.js';
import { generateImage } from './imageGenerator.js';
import { uploadGeneratedHistoryImage, getS3Url } from './s3Service.js';
import type { HistoryRow, ImageGenerationStatus } from '../types/history.js';

/**
 * 이미지가 없는 History 목록 조회
 */
export async function getHistoriesWithoutImage(limit: number = 10): Promise<HistoryRow[]> {
  const sql = `
    SELECT id, user_id, content, record_date, tags, s3_key, text_url
    FROM history
    WHERE s3_key IS NULL AND content IS NOT NULL AND content != ''
    ORDER BY record_date DESC
    LIMIT $1
  `;
  return query<HistoryRow>(sql, [limit]);
}

/**
 * 특정 History 조회
 */
export async function getHistoryById(historyId: number): Promise<HistoryRow | null> {
  const sql = `
    SELECT id, user_id, content, record_date, tags, s3_key, text_url
    FROM history
    WHERE id = $1
  `;
  return queryOne<HistoryRow>(sql, [historyId]);
}

/**
 * History의 s3_key 업데이트
 */
export async function updateHistoryS3Key(historyId: number, s3Key: string): Promise<void> {
  const sql = `UPDATE history SET s3_key = $1 WHERE id = $2`;
  await execute(sql, [s3Key, historyId]);
  console.log(`[HistoryService] Updated s3_key for history ${historyId}`);
}

/**
 * 단일 History에 대해 이미지 자동 생성
 */
export async function generateImageForHistory(historyId: number): Promise<ImageGenerationStatus> {
  // 1. History 조회
  const history = await getHistoryById(historyId);
  
  if (!history) {
    return {
      historyId,
      userId: '',
      hasImage: false,
      imageGenerated: false,
      error: 'History not found',
    };
  }

  // 2. 이미 이미지가 있는지 확인
  if (history.s3_key) {
    return {
      historyId,
      userId: history.user_id,
      hasImage: true,
      imageGenerated: false,
      s3Key: history.s3_key,
    };
  }

  // 3. 내용이 비어있는지 확인
  if (!history.content || history.content.trim() === '') {
    return {
      historyId,
      userId: history.user_id,
      hasImage: false,
      imageGenerated: false,
      error: 'History content is empty',
    };
  }

  try {
    // 4. 프롬프트 생성
    console.log(`[HistoryService] Building prompt for history ${historyId}...`);
    const { positivePrompt, negativePrompt } = buildPrompt(history.content);
    console.log(`[HistoryService] Positive prompt: ${positivePrompt.substring(0, 100)}...`);

    // 5. 이미지 생성
    console.log(`[HistoryService] Generating image for history ${historyId}...`);
    const result = await generateImage(positivePrompt, negativePrompt);

    if (!result.success || !result.imageBase64) {
      return {
        historyId,
        userId: history.user_id,
        hasImage: false,
        imageGenerated: false,
        error: result.error || 'Image generation failed',
      };
    }

    // 6. S3 업로드
    console.log(`[HistoryService] Uploading image to S3 for history ${historyId}...`);
    const s3Key = await uploadGeneratedHistoryImage(history.user_id, result.imageBase64);

    // 7. DB 업데이트
    await updateHistoryS3Key(historyId, s3Key);

    return {
      historyId,
      userId: history.user_id,
      hasImage: true,
      imageGenerated: true,
      s3Key,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[HistoryService] Error generating image for history ${historyId}:`, errorMessage);

    return {
      historyId,
      userId: history.user_id,
      hasImage: false,
      imageGenerated: false,
      error: errorMessage,
    };
  }
}

/**
 * 이미지가 없는 모든 History에 대해 이미지 생성 (배치)
 */
export async function generateImagesForAllHistories(limit: number = 10): Promise<ImageGenerationStatus[]> {
  const histories = await getHistoriesWithoutImage(limit);
  console.log(`[HistoryService] Found ${histories.length} histories without images`);

  const results: ImageGenerationStatus[] = [];

  for (const history of histories) {
    const result = await generateImageForHistory(history.id);
    results.push(result);

    // API 호출 간 딜레이 (rate limiting 방지)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}
