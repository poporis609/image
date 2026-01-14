# 일기 이미지 자동 생성 서비스 - Hands-On Guide

한글 일기를 입력하면 AI가 내용을 분석하여 맞춤형 이미지를 생성하는 서비스입니다.

## 📋 목차

1. [아키텍처 개요](#아키텍처-개요)
2. [사전 준비사항](#사전-준비사항)
3. [AWS 리소스 설정](#aws-리소스-설정)
4. [로컬 개발 환경 설정](#로컬-개발-환경-설정)
5. [Kubernetes 배포](#kubernetes-배포)
6. [API 사용법](#api-사용법)
7. [프롬프트 엔지니어링 상세 가이드](#프롬프트-엔지니어링-상세-가이드)
8. [핵심 코드 설명](#핵심-코드-설명)
9. [트러블슈팅](#트러블슈팅)

---

## 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                        클라이언트 (Frontend)                      │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Image Generator API Server                    │
│                         (Express.js + TypeScript)                │
└─────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
            │   Claude 4   │ │ Nova Canvas │ │     S3      │
            │   Sonnet     │ │  (이미지)    │ │  (저장소)   │
            │ (프롬프트)    │ │             │ │             │
            └─────────────┘ └─────────────┘ └─────────────┘
                    │               │               │
                    └───────────────┼───────────────┘
                                    ▼
                            ┌─────────────┐
                            │  PostgreSQL │
                            │    (RDS)    │
                            └─────────────┘
```

### 처리 흐름

1. **프롬프트 생성**: 한글 일기 → Claude 4 Sonnet → 영어 이미지 프롬프트
2. **이미지 생성**: 영어 프롬프트 → Nova Canvas → Base64 이미지
3. **저장**: Base64 이미지 → S3 업로드 → DB 업데이트

### 이미지 생성 모델 비교: Titan Image Generator G1 vs Nova Canvas

초기에는 **Titan Image Generator G1**을 사용했으나, 여러 테스트 후 **Nova Canvas**로 전환했습니다.

#### 모델 스펙 비교

| 항목 | Titan Image Generator G1 | Nova Canvas | 비고 |
|------|-------------------------|-------------|------|
| 모델 ID | `amazon.titan-image-generator-v1` | `amazon.nova-canvas-v1:0` | - |
| 최대 해상도 | 1024 × 1024 | 2048 × 2048 | Nova 2배 |
| 지원 비율 | 1:1 고정 | 1:1, 4:5, 16:9 등 다양 | Nova 유연 |
| 프롬프트 최대 길이 | 512자 | 1024자 | Nova 2배 |
| 평균 생성 시간 | 8-12초 | 5-10초 | Nova 더 빠름 |
| 가격 (1024×1024) | $0.01/장 | $0.04/장 | Titan 저렴 |
| 사실적 인물 표현 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Nova 우수 |
| 한글 프롬프트 이해 | ❌ 불가 | ❌ 불가 | 둘 다 영어만 |
| Negative Prompt | ✅ 지원 | ✅ 지원 | 동일 |

#### 품질 비교 (동일 프롬프트 테스트)

테스트 프롬프트: `"A realistic photo of an Asian person walking with their dog in a park, sunny day, natural lighting"`

| 평가 항목 | Titan G1 | Nova Canvas | 설명 |
|----------|----------|-------------|------|
| 인물 사실감 | 6/10 | 9/10 | Nova가 피부, 표정, 자세 더 자연스러움 |
| 동물 표현 | 5/10 | 8/10 | Titan은 강아지 형태 왜곡 빈번 |
| 배경 디테일 | 7/10 | 9/10 | Nova가 배경 요소 더 풍부 |
| 조명/그림자 | 6/10 | 9/10 | Nova가 자연광 표현 우수 |
| 프롬프트 충실도 | 6/10 | 8/10 | Nova가 세부 지시 더 잘 반영 |
| **종합 점수** | **6/10** | **8.6/10** | - |

#### 실제 문제 사례

**Titan Image Generator G1 문제점:**

1. **손가락 왜곡**: 6개 손가락, 뒤틀린 손 빈번
2. **얼굴 왜곡**: 비대칭 얼굴, 눈 위치 이상
3. **동물 형태 오류**: 다리 개수 오류, 비정상적 자세
4. **프롬프트 무시**: "rainy day"라고 해도 맑은 날씨 출력
5. **1:1 비율 제한**: 모바일 UI에 맞지 않음

**Nova Canvas 개선점:**

1. **자연스러운 인물**: 손, 얼굴, 자세 모두 자연스러움
2. **정확한 동물 표현**: 강아지 품종까지 구분 가능
3. **프롬프트 충실도**: 날씨, 시간대, 분위기 정확히 반영
4. **다양한 비율**: 4:5 비율로 모바일 최적화 가능
5. **더 긴 프롬프트**: 1024자까지 세부 지시 가능

#### 비용 vs 품질 트레이드오프

```
월 1,000장 생성 기준:
- Titan G1: $10/월 (저품질, 재생성 필요 → 실제 $15-20)
- Nova Canvas: $40/월 (고품질, 재생성 적음 → 실제 $40-45)

결론: Nova Canvas가 4배 비싸지만, 재생성 비용과 사용자 만족도 고려 시 더 경제적
```

#### 전환 결정 이유

| 요소 | 가중치 | Titan G1 | Nova Canvas |
|------|--------|----------|-------------|
| 이미지 품질 | 40% | 6점 | 9점 |
| 프롬프트 충실도 | 25% | 6점 | 8점 |
| 생성 속도 | 15% | 7점 | 8점 |
| 비용 효율 | 10% | 9점 | 6점 |
| 해상도/비율 유연성 | 10% | 5점 | 9점 |
| **가중 평균** | 100% | **6.25점** | **8.35점** |

**최종 결정: Nova Canvas 채택** - 비용이 높지만 품질 차이가 압도적

---

## 사전 준비사항

### 필수 도구

- Node.js 18+
- Docker
- kubectl
- AWS CLI (설정 완료)
- Git

### AWS 서비스

- Amazon Bedrock (Claude 4 Sonnet, Nova Canvas 모델 활성화)
- Amazon S3
- Amazon RDS (PostgreSQL)
- Amazon EKS (또는 다른 Kubernetes 클러스터)

---

## AWS 리소스 설정

### 1. Bedrock 모델 활성화

AWS 콘솔 → Bedrock → Model access에서 다음 모델 활성화:

- `anthropic.claude-sonnet-4-20250514-v1:0` (프롬프트 생성용)
- `amazon.nova-canvas-v1:0` (이미지 생성용)

### 2. IAM Role 정책 설정

EKS Pod가 사용할 IAM Role에 다음 정책 추가:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "BedrockAccess",
            "Effect": "Allow",
            "Action": [
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithResponseStream"
            ],
            "Resource": [
                "arn:aws:bedrock:*::foundation-model/*",
                "arn:aws:bedrock:*:*:inference-profile/*"
            ]
        }
    ]
}
```

**CLI로 추가하는 방법:**

```powershell
$policy = @'
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "BedrockAccess",
            "Effect": "Allow",
            "Action": [
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithResponseStream"
            ],
            "Resource": [
                "arn:aws:bedrock:*::foundation-model/*",
                "arn:aws:bedrock:*:*:inference-profile/*"
            ]
        }
    ]
}
'@
aws iam put-role-policy --role-name <YOUR_ROLE_NAME> --policy-name Bedrock-allow --policy-document $policy
```

### 3. S3 버킷 생성

```bash
aws s3 mb s3://<YOUR_BUCKET_NAME> --region us-east-1
```

### 4. RDS PostgreSQL 설정

History 테이블 스키마:

```sql
CREATE TABLE history (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    content TEXT,
    record_date DATE NOT NULL,
    tags TEXT[],
    s3_key VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 로컬 개발 환경 설정

### 1. 프로젝트 클론

```bash
git clone <YOUR_REPO_URL>
cd image-generator
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 환경 변수 설정

`.env` 파일 생성:

```env
# Database Configuration
DB_HOST=your-rds-endpoint.region.rds.amazonaws.com
DB_PORT=5432
DB_NAME=your_db_name
DB_USER=your_db_user
DB_PASSWORD=your_password_here

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# S3 Configuration
KNOWLEDGE_BASE_BUCKET=your-s3-bucket

# Bedrock Model (Nova Canvas)
BEDROCK_MODEL_ID=amazon.nova-canvas-v1:0

# Bedrock LLM for Prompt Generation (Claude 4 Sonnet)
# Cross-region inference profile 사용 (us. 접두사)
BEDROCK_LLM_MODEL_ID=us.anthropic.claude-sonnet-4-20250514-v1:0
```

### 4. 로컬 실행

```bash
npm run dev
```

서버가 `http://localhost:8002`에서 실행됩니다.

---

## Kubernetes 배포

### 1. Docker 이미지 빌드 및 푸시

```bash
docker build -t <YOUR_ECR_REPO>/image-generator:latest .
docker push <YOUR_ECR_REPO>/image-generator:latest
```

### 2. Kubernetes 매니페스트

**k8s/deployment.yaml:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: image-generator
spec:
  replicas: 1
  selector:
    matchLabels:
      app: image-generator
  template:
    metadata:
      labels:
        app: image-generator
    spec:
      serviceAccountName: <YOUR_SERVICE_ACCOUNT>
      containers:
      - name: image-generator
        image: <YOUR_ECR_REPO>/image-generator:latest
        ports:
        - containerPort: 8002
        env:
        - name: PORT
          value: "8002"
        - name: AWS_REGION
          value: "us-east-1"
        - name: KNOWLEDGE_BASE_BUCKET
          value: "<YOUR_BUCKET_NAME>"
        # DB 환경변수는 Secret에서 가져오기
        envFrom:
        - secretRef:
            name: image-generator-secrets
```

**k8s/service.yaml:**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: image-generator
spec:
  selector:
    app: image-generator
  ports:
  - port: 80
    targetPort: 8002
  type: ClusterIP
```

### 3. 배포

```bash
kubectl apply -f k8s/
```

### 4. 배포 확인

```bash
kubectl get pods -l app=image-generator
kubectl logs -l app=image-generator --tail=50
```

---

## API 사용법

### 기본 URL

- 로컬: `http://localhost:8002`
- 프로덕션: `https://your-domain.com`

### 1. 헬스 체크

```bash
GET /health
GET /api/v1/health
```

**응답:**
```json
{
  "status": "ok",
  "service": "image-generator",
  "timestamp": "2026-01-13T12:00:00.000Z"
}
```

### 2. 이미지 미리보기 생성

이미지를 생성하지만 S3/DB에 저장하지 않습니다.

```bash
POST /api/v1/histories/:id/preview-image
```

**응답:**
```json
{
  "success": true,
  "data": {
    "historyId": 123,
    "userId": "cognito-sub-xxx",
    "imageBase64": "/9j/4AAQSkZJRgABAQAAAQABAAD...",
    "prompt": {
      "positive": "A realistic photo of an Asian person walking together with their dog...",
      "negative": "anime, cartoon, illustration..."
    }
  }
}
```

### 3. 이미지 확정 저장

미리보기에서 받은 이미지를 S3에 저장하고 DB를 업데이트합니다.

```bash
POST /api/v1/histories/:id/confirm-image
Content-Type: application/json

{
  "imageBase64": "/9j/4AAQSkZJRgABAQAAAQABAAD..."
}
```

**응답:**
```json
{
  "success": true,
  "data": {
    "historyId": 123,
    "userId": "cognito-sub-xxx",
    "s3Key": "cognito-sub-xxx/history/2026/01/13/image_1736409600000.png",
    "imageUrl": "https://your-bucket.s3.us-east-1.amazonaws.com/..."
  }
}
```

### 4. 직접 이미지 생성 (History 없이)

```bash
POST /api/v1/generate-image
Content-Type: application/json

{
  "text": "오늘 비가 와서 강아지와 집에서 창밖을 바라봤다"
}
```

---

## 프롬프트 엔지니어링 상세 가이드

이 서비스의 핵심은 **한글 일기를 정확하게 이해하고, 이미지 생성에 최적화된 영어 프롬프트로 변환**하는 것입니다. 여러 번의 시행착오를 거쳐 완성된 프롬프트 전략을 상세히 설명합니다.

### 왜 LLM을 사용하는가?

초기에는 **키워드 매핑 방식**을 사용했습니다:

```typescript
// ❌ 초기 방식 - 하드코딩된 키워드 매핑
const KEYWORD_MAP = {
  '비': 'rainy weather',
  '강아지': 'dog',
  '산책': 'walking',
  // ... 수백 개의 매핑 필요
};
```

**문제점:**
- 새로운 단어가 나올 때마다 코드 수정 필요
- 문맥을 이해하지 못함 ("비가 그쳤다" vs "비가 온다" 구분 불가)
- 복합적인 상황 표현 불가

**해결책:** Claude 4 Sonnet LLM을 사용하여 **동적으로 프롬프트 생성**

### 시스템 프롬프트 전체 구조

```typescript
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
```

### 프롬프트 설계 원칙 상세 설명

#### 1. CRITICAL RULES - 기본 규칙

```
CRITICAL RULES:
1. Read the Korean diary CAREFULLY and extract ALL visual elements
2. Your output must be ONLY the English prompt - no explanations, no Korean text
3. The prompt must accurately reflect what is described in the diary
```

**왜 이렇게 했나:**
- LLM이 설명을 덧붙이거나 한글을 섞어 출력하는 경우가 있었음
- "ONLY the English prompt"를 명시하여 순수 프롬프트만 출력하도록 강제
- Nova Canvas는 영어 프롬프트만 이해하므로 한글이 섞이면 품질 저하

#### 2. MUST INCLUDE - 필수 포함 요소

```
MUST INCLUDE if mentioned in diary:
- WEATHER: rainy, sunny, cloudy, snowy, foggy, etc. (VERY IMPORTANT - if it says 비/rain, the image MUST show rain)
- TIME OF DAY: morning light, afternoon, sunset, evening, night
- LOCATION: indoor/outdoor, home, cafe, park, street, window view
- ANIMALS: dog, cat, etc. with specific actions they're doing
- MOOD: cozy, peaceful, melancholic, warm, lonely, happy
```

**왜 이렇게 했나:**
- 초기에 "비가 오는 날"이라고 써도 맑은 날씨 이미지가 나오는 문제 발생
- **VERY IMPORTANT** 강조를 추가하여 날씨 반영 우선순위 높임
- 시간대, 장소, 동물, 분위기 등 시각적 요소를 명시적으로 나열

#### 3. CRITICAL - TOGETHERNESS - 함께하는 장면

```
CRITICAL - TOGETHERNESS:
- If the diary mentions doing something WITH a pet (강아지와 산책, 고양이와 놀았다, etc.), the image MUST show BOTH the person AND the animal TOGETHER in the SAME frame
- Use phrases like "a person walking together with their dog", "owner and dog side by side", "person holding leash walking with dog"
- The person and animal must be INTERACTING or moving in the SAME DIRECTION
- Do NOT show the animal alone or going in opposite direction
```

**왜 이렇게 했나:**
- "강아지와 산책했다"라고 해도 강아지만 나오거나, 사람과 강아지가 반대 방향으로 가는 이미지 생성됨
- **SAME frame**, **TOGETHER**, **SAME DIRECTION** 등 구체적인 지시 추가
- "walking together with", "side by side" 같은 구체적인 표현 예시 제공

#### 4. CRITICAL - ETHNICITY - 인종 지정

```
CRITICAL - ETHNICITY:
- ALL people in the image MUST be Asian/East Asian
- Always include "Asian" or "East Asian" when describing people
- Example: "an Asian person walking with their dog", "East Asian woman sitting by window"
```

**왜 이렇게 했나:**
- 한국어 일기 서비스이므로 동양인 이미지가 더 자연스러움
- 명시하지 않으면 다양한 인종이 랜덤하게 나옴
- 프롬프트에 "Asian" 또는 "East Asian"을 항상 포함하도록 지시

#### 5. PROMPT STRUCTURE - 출력 구조

```
PROMPT STRUCTURE:
"A realistic photo of [Asian person and animal together doing activity], [weather conditions], [lighting], [specific details], [mood/atmosphere], natural photography style, high quality"
```

**왜 이렇게 했나:**
- 일관된 프롬프트 구조로 Nova Canvas가 더 잘 이해
- 순서: 주체 → 날씨 → 조명 → 세부사항 → 분위기 → 스타일
- "realistic photo", "natural photography style", "high quality"로 사실적인 사진 스타일 유도

#### 6. IMPORTANT - 주의사항

```
IMPORTANT:
- Do NOT add random people unless the diary implies the writer's presence
- If diary says "나는 강아지와 산책했다" (I walked with my dog), show person walking WITH dog
- Focus on the TOGETHERNESS and INTERACTION between person and pet
- Keep prompt under 500 characters
```

**왜 이렇게 했나:**
- LLM이 임의로 사람을 추가하는 경우가 있었음 (특히 여성)
- "나는"이 있으면 화자가 있다는 의미이므로 사람 포함
- 500자 제한으로 프롬프트가 너무 길어지는 것 방지

### Negative Prompt 설계

```typescript
const NEGATIVE_PROMPT = `anime, cartoon, illustration, painting, sketch, drawing,
3d render, cgi, unreal engine, fantasy, surreal,
low quality, low resolution, blurry, out of focus, noise,
overexposed, underexposed, jpeg artifacts,
deformed body, distorted face, bad anatomy,
extra fingers, missing fingers, fused fingers,
extra limbs, missing limbs,
dramatic lighting, cinematic effect, exaggerated emotion,
overly posed, studio lighting,
text, caption, subtitle, watermark, logo`;
```

**카테고리별 설명:**

| 카테고리 | 키워드 | 이유 |
|---------|--------|------|
| 스타일 제외 | anime, cartoon, illustration, painting, sketch | 사실적인 사진 스타일 유지 |
| 3D/CG 제외 | 3d render, cgi, unreal engine | 실사 느낌 유지 |
| 품질 문제 | low quality, blurry, noise, jpeg artifacts | 고품질 이미지 보장 |
| 신체 왜곡 | deformed body, extra fingers, missing limbs | AI 이미지의 흔한 오류 방지 |
| 과장 제외 | dramatic lighting, cinematic effect, exaggerated emotion | 자연스러운 일상 느낌 유지 |
| 워터마크 | text, watermark, logo | 깨끗한 이미지 출력 |

### 이미지 생성 설정 (Nova Canvas)

```typescript
const DEFAULT_CONFIG = {
  width: 1024,
  height: 1280,  // 4:5 비율 (모바일 최적화)
  cfgScale: 6.5, // 프롬프트 충실도 (높을수록 프롬프트에 충실)
  seed: -1,      // -1 = 매번 랜덤 시드
  numberOfImages: 1,
};
```

**설정 설명:**

| 설정 | 값 | 이유 |
|-----|-----|------|
| width × height | 1024 × 1280 | 4:5 비율, 모바일 화면에 최적화 |
| cfgScale | 6.5 | 프롬프트 반영도. 너무 높으면 부자연스러움, 너무 낮으면 프롬프트 무시 |
| seed | -1 | 매번 다른 이미지 생성. 고정하면 같은 이미지 반복 |

### 프롬프트 변환 예시

**입력 (한글 일기):**
```
오늘은 종일 빗소리가 그쳤다 켜졌다를 반복하는 우중충한 날씨였다. 
나는 집 안에서 시간을 보내야 했는데, 다행히 강아지가 있어서 심심하지 않았다. 
우리는 창가에 나란히 앉아 빗방울이 유리창을 타고 내려가는 모습을 함께 바라봤다.
```

**출력 (영어 프롬프트):**
```
A realistic photo of an East Asian person sitting by a large window with their dog beside them, 
both looking at raindrops running down the glass, gray overcast sky outside with intermittent rain, 
cozy indoor atmosphere with warm lighting, peaceful contemplative mood, 
the person and dog sitting close together in companionship, 
natural candid photography style, high quality
```

**생성된 이미지 특징:**
- ✅ 동양인 등장
- ✅ 강아지와 함께 창가에 앉아있음
- ✅ 비 오는 날씨 반영
- ✅ 따뜻한 실내 분위기
- ✅ 사람과 강아지가 같은 방향(창밖)을 바라봄

### 프롬프트 튜닝 팁

1. **구체적인 예시 제공**: LLM에게 원하는 출력 형태의 예시를 보여주면 더 정확한 결과
2. **CRITICAL/IMPORTANT 강조**: 중요한 규칙은 대문자로 강조
3. **부정형 지시**: "Do NOT"으로 원하지 않는 것 명시
4. **구조화된 출력**: 프롬프트 구조를 템플릿으로 제공
5. **500자 제한**: 너무 긴 프롬프트는 Nova Canvas가 일부만 반영

---

## 핵심 코드 설명

### 프롬프트 생성 (promptBuilder.ts)

Claude 4 Sonnet을 사용하여 한글 일기를 영어 이미지 프롬프트로 변환:

```typescript
const SYSTEM_PROMPT = `You are an expert at converting Korean diary entries into detailed English image generation prompts...

CRITICAL - ETHNICITY:
- ALL people in the image MUST be Asian/East Asian
- Always include "Asian" or "East Asian" when describing people

CRITICAL - TOGETHERNESS:
- If the diary mentions doing something WITH a pet, the image MUST show BOTH the person AND the animal TOGETHER
...`;

async function generatePromptWithLLM(journalText: string): Promise<PromptResult | null> {
  const modelId = 'us.anthropic.claude-sonnet-4-20250514-v1:0';
  
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
  // ... Bedrock 호출
}
```

### 이미지 생성 (imageGenerator.ts)

Nova Canvas를 사용하여 이미지 생성:

```typescript
const DEFAULT_CONFIG = {
  width: 1024,
  height: 1280,  // 4:5 비율
  cfgScale: 6.5,
  seed: -1,      // -1 = 매번 랜덤 시드
  numberOfImages: 1,
};

async function generateImage(positivePrompt: string, negativePrompt?: string) {
  // seed가 -1이면 랜덤 시드 생성
  const actualSeed = finalConfig.seed < 0 
    ? Math.floor(Math.random() * 2147483647) 
    : finalConfig.seed;

  const requestBody = {
    taskType: 'TEXT_IMAGE',
    textToImageParams: {
      text: positivePrompt,
      negativeText: negativePrompt,
    },
    imageGenerationConfig: {
      cfgScale: finalConfig.cfgScale,
      seed: actualSeed,
      width: finalConfig.width,
      height: finalConfig.height,
      numberOfImages: 1,
    },
  };
  // ... Bedrock 호출
}
```

### S3 업로드 (s3Service.ts)

이미지 저장 및 이전 파일 삭제:

```typescript
// 이미지 업로드
async function uploadHistoryContent(cognitoSub: string, recordDate: Date, imageBase64: string) {
  const imageKey = `${cognitoSub}/history/${year}/${month}/${day}/image_${timestamp}.png`;
  
  await s3Client.send(new PutObjectCommand({
    Bucket: KNOWLEDGE_BASE_BUCKET,
    Key: imageKey,
    Body: Buffer.from(imageBase64, 'base64'),
    ContentType: 'image/png',
  }));
  
  return { imageKey, imageUrl: getKnowledgeBaseS3Url(imageKey) };
}

// 이전 파일 삭제
async function deleteOldHistoryFiles(oldImageKey?: string) {
  if (oldImageKey) {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: KNOWLEDGE_BASE_BUCKET,
      Key: oldImageKey,
    }));
  }
}
```

---

## 트러블슈팅

### 1. AccessDeniedException: bedrock:InvokeModel

**원인:** IAM Role에 Bedrock 권한이 없음

**해결:**
```bash
aws iam put-role-policy --role-name <ROLE_NAME> --policy-name Bedrock-allow --policy-document file://bedrock-policy.json
```

### 2. ValidationException: Invocation with on-demand throughput isn't supported

**원인:** Claude 4 Sonnet은 cross-region inference profile 필요

**해결:** 모델 ID를 `us.anthropic.claude-sonnet-4-20250514-v1:0`로 변경 (us. 접두사 추가)

### 3. request entity too large

**원인:** Express body 크기 제한 초과

**해결:** `server.ts`에서 body 크기 제한 증가
```typescript
app.use(express.json({ limit: '50mb' }));
```

### 4. 이미지에 랜덤 인물이 나옴

**원인:** 프롬프트가 명확하지 않음

**해결:** 시스템 프롬프트에 다음 추가
- "Do NOT add random people unless the diary mentions them"
- "ALL people MUST be Asian/East Asian"

### 5. 매번 같은 이미지가 생성됨

**원인:** seed 값이 고정됨

**해결:** `imageGenerator.ts`에서 seed를 -1로 설정하고 랜덤 생성
```typescript
const actualSeed = finalConfig.seed < 0 
  ? Math.floor(Math.random() * 2147483647) 
  : finalConfig.seed;
```

---

## 로그 확인

```bash
# Pod 로그 확인
kubectl logs -l app=image-generator --tail=100

# 실시간 로그 스트리밍
kubectl logs -l app=image-generator -f

# 특정 패턴 검색
kubectl logs -l app=image-generator | Select-String "PromptBuilder|Error"
```

---

## 참고 자료

- [Amazon Bedrock 문서](https://docs.aws.amazon.com/bedrock/)
- [Nova Canvas 모델 가이드](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-titan-image.html)
- [Claude API 문서](https://docs.anthropic.com/claude/reference/messages_post)
