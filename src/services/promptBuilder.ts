/**
 * PromptBuilder - Journal 텍스트를 이미지 생성 프롬프트로 변환
 * 
 * LLM 기반 동적 프롬프트 생성 지원
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
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
text, caption, subtitle, watermark, logo
`;

// LLM 프롬프트 생성용 시스템 프롬프트
const SYSTEM_PROMPT = `You are an expert at converting Korean diary entries into detailed English image generation prompts for realistic photography.

CRITICAL RULES:
1. Read the Korean diary CAREFULLY and extract ALL visual elements
2. Your output must be ONLY the English prompt - no explanations, no Korean text
3. The prompt must accurately reflect what is described in the diary

MUST INCLUDE if mentioned in diary:
- WEATHER: rainy, sunny, cloudy, snowy, foggy, etc. (VERY IMPORTANT - if it says 비/rain, the image MUST show rain)
- TIME OF DAY: morning light, afternoon, sunset, evening, night
- LOCATION: indoor/outdoor, home, cafe, park, street, window view
- ANIMALS: dog, cat, etc. with specific actions they're doing
- MOOD: cozy, peaceful, melancholic, warm, lonely, happy

CRITICAL - TOGETHERNESS:
- If the diary mentions doing something WITH a pet (강아지와 산책, 고양이와 놀았다, etc.), the image MUST show BOTH the person AND the animal TOGETHER in the SAME frame
- Use phrases like "a person walking together with their dog", "owner and dog side by side", "person holding leash walking with dog"
- The person and animal must be INTERACTING or moving in the SAME DIRECTION
- Do NOT show the animal alone or going in opposite direction

CRITICAL - ETHNICITY:
- ALL people in the image MUST be Asian/East Asian
- Always include "Asian" or "East Asian" when describing people
- Example: "an Asian person walking with their dog", "East Asian woman sitting by window"

PROMPT STRUCTURE:
"A realistic photo of [Asian person and animal together doing activity], [weather conditions], [lighting], [specific details], [mood/atmosphere], natural photography style, high quality"

IMPORTANT:
- Do NOT add random people unless the diary implies the writer's presence
- If diary says "나는 강아지와 산책했다" (I walked with my dog), show person walking WITH dog
- Focus on the TOGETHERNESS and INTERACTION between person and pet
- Keep prompt under 500 characters

Examples:
Input: "강아지와 산책을 나갔다"
Output: A realistic photo of an Asian person walking together with their dog on a leash, both moving in the same direction on a peaceful street, natural daylight, warm companionship mood, candid photography style, high quality

Input: "비가 오는 날 강아지와 창가에 앉아 빗방울을 바라봤다"
Output: A realistic photo of an East Asian person sitting by a window with their dog beside them, both looking at raindrops on the glass, rainy day outside, cozy indoor atmosphere, warm lighting, peaceful contemplative mood, high quality`;

let bedrockClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
    });
  }
  return bedrockClient;
}

/**
 * LLM(Claude)을 사용하여 한글 일기를 영어 이미지 프롬프트로 변환
 */
async function generatePromptWithLLM(journalText: string): Promise<PromptResult | null> {
  // Claude 4 Sonnet - cross-region inference profile 사용
  const modelId = process.env.BEDROCK_LLM_MODEL_ID || 'us.anthropic.claude-sonnet-4-20250514-v1:0';
  
  try {
    console.log('[PromptBuilder] Generating prompt with LLM...');
    
    const requestBody = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Convert this Korean diary entry into an English image generation prompt:\n\n${journalText}`
        }
      ]
    };

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    });

    const client = getBedrockClient();
    const response = await client.send(command);
    
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const generatedPrompt = responseBody.content?.[0]?.text?.trim();

    if (!generatedPrompt) {
      console.log('[PromptBuilder] LLM returned empty response');
      return null;
    }

    console.log('[PromptBuilder] === LLM Generated Prompt ===');
    console.log('[PromptBuilder] Full prompt:', generatedPrompt);
    console.log('[PromptBuilder] =============================');
    
    return {
      positivePrompt: truncatePrompt(generatedPrompt),
      negativePrompt: NEGATIVE_PROMPT,
    };
  } catch (error) {
    console.error('[PromptBuilder] LLM prompt generation failed:', error);
    console.error('[PromptBuilder] Error details:', JSON.stringify(error, null, 2));
    return null;
  }
}

/**
 * LLM 사용 가능 여부 확인
 */
function isLLMConfigured(): boolean {
  // AWS 자격증명이 있으면 LLM 사용 가능
  return !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) || 
         !!(process.env.AWS_REGION); // IAM Role 사용 시
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
 * Journal 텍스트를 이미지 생성 프롬프트로 변환 (하위 호환성 유지)
 */
export function buildPrompt(journalText: string): PromptResult {
  // 동기 함수는 간단한 폴백만 제공
  return {
    positivePrompt: `A realistic documentary-style photo representing: ${journalText.substring(0, 200)}`,
    negativePrompt: NEGATIVE_PROMPT,
  };
}

/**
 * 프롬프트 길이 검증
 */
export function validatePromptLength(prompt: string): boolean {
  return prompt.length <= 1024;
}

/**
 * 메인 프롬프트 생성 함수 (LLM 우선 → Flow → 폴백)
 * @param journalText - 한글 일기 텍스트
 * @returns PromptResult
 */
export async function buildPromptWithFlow(journalText: string): Promise<PromptResult> {
  // 1. LLM 사용 시도 (가장 정확)
  if (isLLMConfigured()) {
    const llmResult = await generatePromptWithLLM(journalText);
    if (llmResult) {
      return llmResult;
    }
  }

  // 2. Bedrock Flow 사용 시도
  if (isFlowConfigured()) {
    try {
      console.log('[PromptBuilder] Trying Bedrock Flow...');
      const flowResult = await invokePromptFlow(journalText);

      if (flowResult.success && flowResult.positivePrompt) {
        console.log('[PromptBuilder] Flow succeeded');
        return {
          positivePrompt: truncatePrompt(flowResult.positivePrompt),
          negativePrompt: flowResult.negativePrompt || NEGATIVE_PROMPT,
        };
      }
    } catch (error) {
      console.error('[PromptBuilder] Flow error:', error);
    }
  }

  // 3. 최종 폴백 (간단한 변환)
  console.log('[PromptBuilder] Using simple fallback');
  return buildPrompt(journalText);
}
