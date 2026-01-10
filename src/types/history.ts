/**
 * History 타입 정의
 */

export interface History {
  id: number;
  user_id: string;        // Cognito sub
  content: string;        // 요약 내용
  record_date: Date;      // 기록 날짜
  tags: string[] | null;  // 태그
  s3_key: string | null;  // 이미지 S3 키
  text_url: string | null; // 텍스트 파일 URL
}

export interface HistoryRow {
  id: number;
  user_id: string;
  content: string;
  record_date: string;
  tags: string[] | null;
  s3_key: string | null;
  text_url: string | null;
}

export interface CreateHistoryRequest {
  userId: string;
  content: string;
  recordDate: string;     // YYYY-MM-DD
  tags?: string[];
}

export interface HistoryResponse {
  success: boolean;
  history?: History;
  error?: string;
}

export interface ImageGenerationStatus {
  historyId: number;
  userId: string;
  hasImage: boolean;
  imageGenerated: boolean;
  s3Key?: string;
  error?: string;
}
