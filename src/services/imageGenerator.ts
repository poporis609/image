/**
 * ImageGenerator - Bedrock Titan Image Generator G1 V2 호출
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

const DEFAULT_CONFIG: ImageGenerationConfig = {
  width: 1024,
  height: 1024,
  cfgScale: 8,
  seed: 0, // 0 = random
  numberOfImages: 1,
};

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
 * Bedrock Titan Image Generator를 호출하여 이미지 생성
 */
export async function generateImage(
  positivePrompt: string,
  negativePrompt: string,
  config: Partial<ImageGenerationConfig> = {}
): Promise<ImageGenerationResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const modelId = process.env.BEDROCK_MODEL_ID || 'amazon.titan-image-generator-v2:0';

  try {
    console.log('[ImageGenerator] Generating image...');
    console.log('[ImageGenerator] Positive prompt:', positivePrompt.substring(0, 100) + '...');

    const requestBody = {
      taskType: 'TEXT_IMAGE',
      textToImageParams: {
        text: positivePrompt,
        negativeText: negativePrompt,
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
      throw new Error('No images returned from Bedrock');
    }

    const imageBase64 = responseBody.images[0];
    console.log('[ImageGenerator] Image generated successfully');

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
