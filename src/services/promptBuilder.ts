/**
 * PromptBuilder - Journal 텍스트를 이미지 생성 프롬프트로 변환
 */

export interface PromptResult {
  positivePrompt: string;
  negativePrompt: string;
}

// 고정 Negative Prompt
const NEGATIVE_PROMPT = `low quality, blurry, pixelated, noisy, out of focus,
distorted face, deformed body, extra fingers, missing fingers, extra limbs, unnatural pose,
deformed dog, extra legs, distorted animal, unrealistic proportions,
uncanny, artificial looking, plastic skin, waxy skin,
cartoon, anime, illustration, 3d render, CGI,
text, caption, watermark, logo, signature`;

// 한글 → 영어 키워드 매핑 (일상 활동)
const KEYWORD_MAP: Record<string, string> = {
  // 시간대
  '아침': 'morning',
  '점심': 'lunch time',
  '저녁': 'evening',
  '밤': 'night',
  '새벽': 'dawn',
  
  // 활동
  '산책': 'walking',
  '운동': 'exercising',
  '공부': 'studying',
  '일': 'working',
  '회의': 'meeting',
  '수업': 'class',
  '강의': 'lecture',
  '멘토링': 'mentoring session',
  '스터디': 'study group',
  
  // 음식
  '밥': 'rice meal',
  '빵': 'bread',
  '커피': 'coffee',
  '치킨': 'fried chicken',
  '비빔밥': 'bibimbap',
  '라면': 'ramen',
  '식사': 'meal',
  '점심식사': 'lunch',
  '저녁식사': 'dinner',
  
  // 장소
  '집': 'home',
  '학교': 'school',
  '학원': 'academy',
  '회사': 'office',
  '카페': 'cafe',
  '공원': 'park',
  '지하철': 'subway',
  '버스': 'bus',
  
  // 동물
  '강아지': 'dog',
  '고양이': 'cat',
  '닥스훈트': 'dachshund dog',
  
  // 감정/분위기
  '행복': 'happy',
  '평화': 'peaceful',
  '따뜻': 'warm',
  '편안': 'comfortable',
  '즐거운': 'joyful',
  '기쁜': 'happy',
  '상쾌': 'refreshing',
  
  // 가족/사람
  '가족': 'family',
  '친구': 'friends',
  '동료': 'colleagues',
};

/**
 * 한글 텍스트에서 키워드 추출 및 영어 변환
 */
function extractKeywords(text: string): string[] {
  const keywords: string[] = [];
  
  for (const [korean, english] of Object.entries(KEYWORD_MAP)) {
    if (text.includes(korean)) {
      keywords.push(english);
    }
  }
  
  return [...new Set(keywords)]; // 중복 제거
}

/**
 * 텍스트에서 주요 활동 추출
 */
function extractActivities(text: string): string[] {
  const activities: string[] = [];
  
  // 시간 + 활동 패턴 감지
  if (text.includes('산책') || text.includes('걷')) activities.push('taking a walk');
  if (text.includes('먹') || text.includes('식사')) activities.push('having a meal');
  if (text.includes('공부') || text.includes('학습')) activities.push('studying');
  if (text.includes('회의') || text.includes('미팅')) activities.push('in a meeting');
  if (text.includes('운동') || text.includes('헬스')) activities.push('exercising');
  if (text.includes('출근') || text.includes('퇴근')) activities.push('commuting');
  
  return activities;
}

/**
 * Journal 텍스트를 이미지 생성 프롬프트로 변환
 */
export function buildPrompt(journalText: string): PromptResult {
  // 키워드 추출
  const keywords = extractKeywords(journalText);
  const activities = extractActivities(journalText);
  
  // 기본 스타일 디스크립터
  const styleDescriptors = [
    'realistic photo',
    'natural lighting',
    'high quality',
    'warm and comforting mood',
    'authentic everyday life'
  ];
  
  // 프롬프트 구성
  let promptParts: string[] = [];
  
  // 1. 주제/활동 (Subject)
  if (activities.length > 0) {
    promptParts.push(`A realistic documentary-style photo of ${activities.join(', ')}`);
  } else if (keywords.length > 0) {
    promptParts.push(`A realistic documentary-style photo representing daily life with ${keywords.slice(0, 5).join(', ')}`);
  } else {
    promptParts.push('A realistic documentary-style photo of peaceful daily life');
  }
  
  // 2. 추가 키워드
  if (keywords.length > 0) {
    const additionalKeywords = keywords.filter(k => !promptParts[0].includes(k)).slice(0, 5);
    if (additionalKeywords.length > 0) {
      promptParts.push(additionalKeywords.join(', '));
    }
  }
  
  // 3. 스타일 디스크립터
  promptParts.push(styleDescriptors.join(', '));
  
  // 프롬프트 조합
  let positivePrompt = promptParts.join(', ');
  
  // 512자 제한
  if (positivePrompt.length > 512) {
    positivePrompt = positivePrompt.substring(0, 509) + '...';
  }
  
  return {
    positivePrompt,
    negativePrompt: NEGATIVE_PROMPT,
  };
}

/**
 * 프롬프트 길이 검증
 */
export function validatePromptLength(prompt: string): boolean {
  return prompt.length <= 512;
}
