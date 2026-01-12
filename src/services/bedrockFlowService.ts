/**
 * BedrockFlowService - Bedrock Flows를 사용하여 일기 텍스트를 이미지 프롬프트로 변환
 */

import {
  BedrockAgentRuntimeClient,
  InvokeFlowCommand,
  FlowResponseStream,
} from '@aws-sdk/client-bedrock-agent-runtime';

/**
 * Flow 프롬프트 결과
 */
export interface FlowPromptResult {
  positivePrompt: string;
  negativePrompt: string;
  success: boolean;
  error?: string;
}

/**
 * Bedrock Flow 설정
 */
interface BedrockFlowConfig {
  flowId: string;
  flowAliasId: string;
  region: string;
}

let bedrockClient: BedrockAgentRuntimeClient | null = null;

/**
 * Bedrock Agent Runtime Client 초기화
 */
function getBedrockClient(): BedrockAgentRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockAgentRuntimeClient({
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
 * Flow 설정 로드
 */
function getFlowConfig(): BedrockFlowConfig | null {
  const flowId = process.env.BEDROCK_FLOW_ID;
  const flowAliasId = process.env.BEDROCK_FLOW_ALIAS_ID;
  const region = process.env.AWS_REGION || 'us-east-1';

  if (!flowId || !flowAliasId) {
    console.warn('[BedrockFlowService] Flow ID or Alias ID not configured');
    return null;
  }

  return { flowId, flowAliasId, region };
}


/**
 * Flow 응답 스트림을 파싱하여 프롬프트 추출
 * @param responseStream - Bedrock Flow 응답 스트림
 * @returns 파싱된 프롬프트 객체
 */
async function parseFlowResponse(
  responseStream: AsyncIterable<FlowResponseStream>
): Promise<FlowPromptResult> {
  let outputText = '';

  try {
    for await (const event of responseStream) {
      if (event.flowOutputEvent?.content?.document) {
        const doc = event.flowOutputEvent.content.document;
        if (typeof doc === 'string') {
          outputText += doc;
        } else if (typeof doc === 'object' && doc !== null) {
          outputText += JSON.stringify(doc);
        }
      }
    }

    if (!outputText) {
      return {
        positivePrompt: '',
        negativePrompt: '',
        success: false,
        error: 'Empty response from Flow',
      };
    }

    // JSON 파싱 시도
    try {
      const parsed = JSON.parse(outputText);
      return {
        positivePrompt: parsed.positivePrompt || parsed.positive_prompt || '',
        negativePrompt: parsed.negativePrompt || parsed.negative_prompt || '',
        success: true,
      };
    } catch {
      // JSON이 아닌 경우 텍스트 전체를 positive prompt로 사용
      return {
        positivePrompt: outputText.trim(),
        negativePrompt: '',
        success: true,
      };
    }
  } catch (error) {
    return {
      positivePrompt: '',
      negativePrompt: '',
      success: false,
      error: `Failed to parse Flow response: ${error}`,
    };
  }
}

/**
 * Bedrock Flow를 호출하여 일기 텍스트를 이미지 프롬프트로 변환
 * @param journalText - 한글 일기 텍스트
 * @returns FlowPromptResult - 변환된 프롬프트 또는 에러
 */
export async function invokePromptFlow(journalText: string): Promise<FlowPromptResult> {
  const config = getFlowConfig();
  
  if (!config) {
    return {
      positivePrompt: '',
      negativePrompt: '',
      success: false,
      error: 'Bedrock Flow not configured',
    };
  }

  try {
    const client = getBedrockClient();
    
    const command = new InvokeFlowCommand({
      flowIdentifier: config.flowId,
      flowAliasIdentifier: config.flowAliasId,
      inputs: [
        {
          content: {
            document: journalText,
          },
          nodeName: 'FlowInputNode',
          nodeOutputName: 'document',
        },
      ],
    });

    const response = await client.send(command);

    if (!response.responseStream) {
      return {
        positivePrompt: '',
        negativePrompt: '',
        success: false,
        error: 'No response stream from Flow',
      };
    }

    const result = await parseFlowResponse(response.responseStream);
    
    console.log(`[BedrockFlowService] Flow invoked successfully: ${result.success}`);
    return result;
  } catch (error) {
    console.error('[BedrockFlowService] Flow invocation failed:', error);
    return {
      positivePrompt: '',
      negativePrompt: '',
      success: false,
      error: `Flow invocation failed: ${error}`,
    };
  }
}

/**
 * Flow 설정이 유효한지 확인
 */
export function isFlowConfigured(): boolean {
  return getFlowConfig() !== null;
}
