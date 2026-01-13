/**
 * PromptBuilder - Journal 텍스트를 이미지 생성 프롬프트로 변환
 */

import { invokePromptFlow, isFlowConfigured } from './bedrockFlowService.js';

export interface PromptResult {
  positivePrompt: string;
  negativePrompt: string;
}

// 고정 Negative Prompt
const NEGATIVE_PROMPT = `anime, cartoon, illustration, painting, sketch, drawing,
3d render, cgi, unreal engine, fantasy, surreal,
low quality, low resolution, blurry, out of focus, noise,
overexposed, underexposed, jpeg artifacts,
deformed body, distorted face, bad anatomy,
extra fingers, missing fingers, fused fingers,
extra limbs, missing limbs,
dramatic lighting, cinematic effect, exaggerated emotion,
overly posed, studio lighting,
text, caption, subtitle, watermark, logo, anime, illustration, 3d render, cinematic, dramatic lighting, text, watermark
`;

// 한글 → 영어 키워드 매핑 (일상 활동)
const KEYWORD_MAP: Record<string, string> = {
  // 시간대
  '아침': 'morning',
  '점심': 'lunch time',
  '저녁': 'evening',
  '밤': 'night',
  '새벽': 'dawn',
  
  // 날씨 ⭐ 추가
  '비': 'rainy weather, rain falling',
  '비가 오': 'rainy day, rain falling from sky',
  '비가 내': 'rain falling, rainy atmosphere',
  '소나기': 'rain shower, sudden rain',
  '장마': 'monsoon rain, heavy rain',
  '폭우': 'heavy rain, downpour',
  '눈': 'snowy weather, snow falling',
  '눈이 오': 'snowy day, snowfall',
  '눈이 내': 'snow falling, winter snow',
  '흐림': 'cloudy sky, overcast',
  '흐린': 'cloudy, overcast weather',
  '구름': 'cloudy sky',
  '맑음': 'clear sky, sunny',
  '맑은': 'clear sunny day',
  '햇살': 'sunshine, sunlight',
  '햇빛': 'sunlight, sunny',
  '더움': 'hot weather, summer heat',
  '더운': 'hot day, warm weather',
  '추움': 'cold weather, chilly',
  '추운': 'cold day, winter cold',
  '쌀쌀': 'chilly weather, cool air',
  '바람': 'windy, wind blowing',
  '안개': 'foggy, misty weather',
  '무더위': 'humid hot weather, summer heat',
  '서늘': 'cool weather, refreshing breeze',
  
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
  '우울': 'melancholic mood',
  '슬픔': 'sad atmosphere',
  '지침': 'tired, exhausted',
  '피곤': 'tired, fatigued',
  
  // 가족/사람
  '가족': 'family',
  '친구': 'friends',
  '동료': 'colleagues',
};

// 날씨 키워드 (우선순위 높게 처리)
const WEATHER_KEYWORDS: Record<string, string> = {
  '비가 오': 'rainy day with rain falling from the sky',
  '비가 내': 'rain falling, wet atmosphere',
  '비': 'rainy weather, raindrops',
  '소나기': 'rain shower',
  '장마': 'monsoon season, heavy rain',
  '눈이 오': 'snowy day with snowflakes falling',
  '눈이 내': 'snow falling gently',
  '눈': 'snowy weather, snow covered',
  '흐린': 'overcast cloudy sky',
  '흐림': 'cloudy gray sky',
  '맑은': 'clear blue sky, sunny',
  '맑음': 'bright sunny day',
  '더운': 'hot summer day',
  '추운': 'cold winter day',
  '바람': 'windy day, wind blowing',
  '안개': 'foggy misty atmosphere',
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
 * 날씨 키워드 추출 (우선순위 높음)
 */
function extractWeather(text: string): string | null {
  // 긴 키워드부터 매칭 (예: "비가 오" > "비")
  const sortedKeys = Object.keys(WEATHER_KEYWORDS).sort((a, b) => b.length - a.length);
  
  for (const korean of sortedKeys) {
    if (text.includes(korean)) {
      return WEATHER_KEYWORDS[korean];
    }
  }
  return null;
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
 * Journal 텍스트를 이미지 생성 프롬프트로 변환 (폴백용 - 기존 하드코딩 로직)
 */
export function buildPromptFallback(journalText: string): PromptResult {
  // 키워드 추출
  const keywords = extractKeywords(journalText);
  const activities = extractActivities(journalText);
  const weather = extractWeather(journalText);
  
  // 기본 스타일 디스크립터
  const styleDescriptors = [
    'realistic photo',
    'natural lighting',
    'high quality',
    'authentic everyday life'
  ];
  
  // 프롬프트 구성
  let promptParts: string[] = [];
  
  // 1. 날씨가 있으면 최우선으로 반영
  if (weather) {
    if (activities.length > 0) {
      promptParts.push(`A realistic documentary-style photo of ${activities.join(', ')} on a ${weather}`);
    } else {
      promptParts.push(`A realistic documentary-style photo of daily life scene with ${weather}`);
    }
  } else if (activities.length > 0) {
    promptParts.push(`A realistic documentary-style photo of ${activities.join(', ')}`);
  } else if (keywords.length > 0) {
    promptParts.push(`A realistic documentary-style photo representing daily life with ${keywords.slice(0, 5).join(', ')}`);
  } else {
    promptParts.push('A realistic documentary-style photo of peaceful daily life');
  }
  
  // 2. 추가 키워드 (날씨 제외)
  const additionalKeywords = keywords.filter(k => !weather || !k.includes('rain') && !k.includes('snow') && !k.includes('cloud') && !k.includes('sunny')).slice(0, 5);
  if (additionalKeywords.length > 0) {
    promptParts.push(additionalKeywords.join(', '));
  }
  
  // 3. 스타일 디스크립터
  promptParts.push(styleDescriptors.join(', '));
  
  // 프롬프트 조합
  let positivePrompt = promptParts.join(', ');
  
  // 512자 제한
  positivePrompt = truncatePrompt(positivePrompt);
  
  return {
    positivePrompt,
    negativePrompt: NEGATIVE_PROMPT,
  };
}

/**
 * Journal 텍스트를 이미지 생성 프롬프트로 변환 (하위 호환성 유지)
 */
export function buildPrompt(journalText: string): PromptResult {
  return buildPromptFallback(journalText);
}

/**
 * 프롬프트 길이 검증
 */
export function validatePromptLength(prompt: string): boolean {
  return prompt.length <= 1024;
}

/**
 * 프롬프트 1024자 제한 적용
 */
function truncatePrompt(prompt: string): string {
  if (prompt.length > 1024) {
    return prompt.substring(0, 1021) + '...';
  }
  return prompt;
}

/**
 * Flow 우선 호출하여 프롬프트 생성 (실패 시 폴백)
 * @param journalText - 한글 일기 텍스트
 * @param useFlow - Flow 사용 여부 (기본값: true)
 * @returns PromptResult
 */
export async function buildPromptWithFlow(
  journalText: string,
  useFlow: boolean = true
): Promise<PromptResult> {
  // Flow 사용하지 않거나 설정되지 않은 경우 폴백
  if (!useFlow || !isFlowConfigured()) {
    console.log('[PromptBuilder] Using fallback logic (Flow disabled or not configured)');
    return buildPromptFallback(journalText);
  }

  try {
    console.log('[PromptBuilder] Invoking Bedrock Flow...');
    const flowResult = await invokePromptFlow(journalText);

    if (flowResult.success && flowResult.positivePrompt) {
      console.log('[PromptBuilder] Flow succeeded, using Flow-generated prompt');
      return {
        positivePrompt: truncatePrompt(flowResult.positivePrompt),
        negativePrompt: flowResult.negativePrompt || NEGATIVE_PROMPT,
      };
    }

    // Flow 실패 시 폴백
    console.log(`[PromptBuilder] Flow failed (${flowResult.error}), using fallback`);
    return buildPromptFallback(journalText);
  } catch (error) {
    console.error('[PromptBuilder] Flow error, using fallback:', error);
    return buildPromptFallback(journalText);
  }
}
