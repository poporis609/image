/**
 * ImageGenerator - Amazon Nova Canvas 이미지 생성
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

export interface ImageGenerationResult {
  success: boolean;
  imageBase64?: string;
  error?: string;
}

export interface ImageGenerationConfig {
  width: number;
  height: number;
  cfgScale: number;
  seed: number;
  numberOfImages: number;
}

// Nova Canvas 기본 설정 (4:5 비율)
const DEFAULT_CONFIG: ImageGenerationConfig = {
  width: 1024,
  height: 1280,  // 4:5 비율
  cfgScale: 6.5,
  seed: 0, // 0 = random
  numberOfImages: 1,
};

// Nova Canvas 모델 ID
const NOVA_CANVAS_MODEL_ID = 'amazon.nova-canvas-v1:0';

// 고정 Negative Prompt (Nova Canvas 최적화 - 감정 표현 허용)
const NEGATIVE_PROMPT = `anime, cartoon, illustration, painting, sketch, drawing, 3d render, cgi, unreal engine, fantasy, surreal, low quality, low resolution, blurry, out of focus, noise, overexposed, underexposed, jpeg artifacts, deformed body, distorted face, bad anatomy, extra fingers, missing fingers, fused fingers, extra limbs, missing limbs, overly posed, studio lighting, text, caption, subtitle, watermark, logo, wrong food, wrong animal, substituted items, inaccurate details`;

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
 * 현재 사용 중인 모델 ID 반환
 */
export function getModelId(): string {
  return process.env.BEDROCK_MODEL_ID || NOVA_CANVAS_MODEL_ID;
}

/**
 * 기본 이미지 설정 반환
 */
export function getDefaultConfig(): ImageGenerationConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * 고정 Negative Prompt 반환
 */
export function getNegativePrompt(): string {
  return NEGATIVE_PROMPT;
}

/**
 * Amazon Nova Canvas를 호출하여 이미지 생성
 */
export async function generateImage(
  positivePrompt: string,
  negativePrompt?: string,
  config: Partial<ImageGenerationConfig> = {}
): Promise<ImageGenerationResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const modelId = getModelId();
  const finalNegativePrompt = negativePrompt || NEGATIVE_PROMPT;

  try {
    console.log('[ImageGenerator] Generating image with Nova Canvas...');
    console.log('[ImageGenerator] Model ID:', modelId);
    console.log('[ImageGenerator] Image size:', `${finalConfig.width}x${finalConfig.height}`);
    console.log('[ImageGenerator] Positive prompt:', positivePrompt.substring(0, 100) + '...');

    const requestBody = {
      taskType: 'TEXT_IMAGE',
      textToImageParams: {
        text: positivePrompt,
        negativeText: finalNegativePrompt,
      },
      imageGenerationConfig: {
        cfgScale: finalConfig.cfgScale,
        seed: finalConfig.seed,
        width: finalConfig.width,
        height: finalConfig.height,
        numberOfImages: finalConfig.numberOfImages,
      },
    };

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: '*/*',
      body: JSON.stringify(requestBody),
    });

    const client = getBedrockClient();
    const response = await client.send(command);

    if (response.$metadata.httpStatusCode !== 200) {
      throw new Error(`Bedrock API returned status ${response.$metadata.httpStatusCode}`);
    }

    // 응답 파싱
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    if (!responseBody.images || responseBody.images.length === 0) {
      throw new Error('No images returned from Nova Canvas');
    }

    const imageBase64 = responseBody.images[0];
    console.log('[ImageGenerator] Image generated successfully with Nova Canvas');

    return {
      success: true,
      imageBase64,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ImageGenerator] Error generating image:', errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}
