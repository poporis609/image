/**
 * HistoryService - History 조회 및 이미지 자동 생성
 */

import { query, queryOne, execute } from './database.js';
import { buildPromptWithFlow } from './promptBuilder.js';
import { generateImage } from './imageGenerator.js';
import { uploadHistoryContent, getKnowledgeBaseS3Url, type SummaryContent } from './s3Service.js';
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
 * History의 s3_key와 text_url 업데이트
 */
export async function updateHistoryS3Keys(
  historyId: number,
  s3Key: string,
  textKey: string
): Promise<void> {
  const sql = `UPDATE history SET s3_key = $1, text_url = $2 WHERE id = $3`;
  await execute(sql, [s3Key, textKey, historyId]);
  console.log(`[HistoryService] Updated s3_key and text_url for history ${historyId}`);
}

/**
 * 단일 History에 대해 이미지 자동 생성 (Flow 기반)
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
      textKey: history.text_url || undefined,
      imageUrl: getKnowledgeBaseS3Url(history.s3_key),
      textUrl: history.text_url ? getKnowledgeBaseS3Url(history.text_url) : undefined,
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
    // 4. Flow 기반 프롬프트 생성
    console.log(`[HistoryService] Building prompt with Flow for history ${historyId}...`);
    const { positivePrompt, negativePrompt } = await buildPromptWithFlow(history.content);
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

    // 6. 요약 텍스트 내용 구성
    const recordDate = new Date(history.record_date);
    const summaryContent: SummaryContent = {
      summary: history.content,
      tags: history.tags || [],
      recordDate: history.record_date,
      createdAt: new Date().toISOString(),
    };

    // 7. S3 업로드 (이미지 + 텍스트, 새 경로 구조)
    console.log(`[HistoryService] Uploading content to S3 for history ${historyId}...`);
    const s3Result = await uploadHistoryContent(
      history.user_id,
      recordDate,
      result.imageBase64,
      summaryContent
    );

    // 8. DB 업데이트
    await updateHistoryS3Keys(historyId, s3Result.imageKey, s3Result.textKey);

    return {
      historyId,
      userId: history.user_id,
      hasImage: true,
      imageGenerated: true,
      s3Key: s3Result.imageKey,
      textKey: s3Result.textKey,
      imageUrl: s3Result.imageUrl,
      textUrl: s3Result.textUrl,
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
