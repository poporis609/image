# Image Generator Proxy

Strands AI Agent (Bedrock Agent Core Runtime)를 호출하는 프록시 서버입니다.

## 아키텍처

```
Client → Image Generator Proxy → Bedrock Agent Core Runtime → Strands AI Agent
                                                                    ↓
                                                              (이미지 생성)
                                                              - Claude Sonnet 4.5 (프롬프트)
                                                              - Nova Canvas (이미지)
                                                              - S3 (저장)
                                                              - PostgreSQL (DB)
```

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| GET | `/image/health` | 헬스체크 |
| GET | `/image/histories/without-image` | 이미지 없는 히스토리 조회 |
| GET | `/image/histories/:id` | 특정 히스토리 조회 |
| POST | `/image/histories/:id/generate-image` | 이미지 생성 + S3 저장 |
| POST | `/image/histories/:id/preview-image` | 이미지 미리보기 |
| POST | `/image/histories/:id/confirm-image` | 미리보기 확정 저장 |
| POST | `/image/histories/batch-generate` | 배치 이미지 생성 |
| POST | `/image/generate` | 텍스트로 직접 이미지 생성 |
| POST | `/image/build-prompt` | 프롬프트만 생성 |

## 환경 변수

```env
PORT=3000
BASE_PATH=/image
AWS_REGION=us-east-1
AGENT_RUNTIME_ARN=arn:aws:bedrock-agentcore:us-east-1:324547056370:runtime/diary_orchestrator_agent-90S9ctAFht
```

## 실행

```bash
npm install
npm run dev    # 개발 모드
npm start      # 프로덕션
```

## IAM 권한

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["bedrock-agentcore:InvokeAgentRuntime"],
      "Resource": "arn:aws:bedrock-agentcore:us-east-1:324547056370:runtime/diary_orchestrator_agent-90S9ctAFht"
    }
  ]
}
```
