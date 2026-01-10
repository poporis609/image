# Image Generator API

History 콘텐츠를 기반으로 AI 이미지를 자동 생성하는 API 서비스입니다.

## Base URL

```
https://image.aws11.shop/api/v1
```

> 클러스터 내부에서 호출시: `http://image-generator-service:8002/api/v1`

## Health Check

```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "service": "image-generator",
  "timestamp": "2026-01-09T10:00:00.000Z"
}
```

---

## Endpoints

### 1. 이미지 없는 History 목록 조회

```
GET /api/v1/histories/without-image?limit=10
```

**Query Parameters:**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| limit | number | N | 조회 개수 (기본값: 10) |

**Response:**
```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "id": 123,
      "userId": "cognito-sub-xxx",
      "content": "오늘 아침 강아지와 산책했다...",
      "recordDate": "2026-01-09",
      "tags": ["산책", "강아지"]
    }
  ]
}
```

---

### 2. 특정 History 조회

```
GET /api/v1/histories/:id
```

**Path Parameters:**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| id | number | Y | History ID |

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "userId": "cognito-sub-xxx",
    "content": "오늘 아침 강아지와 산책했다...",
    "recordDate": "2026-01-09",
    "tags": ["산책", "강아지"],
    "s3Key": "cognito-sub-xxx/2026-01/generated_1736409600000.png",
    "imageUrl": "https://library-bucket-youkkk.s3.us-east-1.amazonaws.com/..."
  }
}
```

---

### 3. 특정 History에 이미지 생성

```
POST /api/v1/histories/:id/generate-image
```

**Path Parameters:**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| id | number | Y | History ID |

**Response:**
```json
{
  "success": true,
  "data": {
    "historyId": 123,
    "userId": "cognito-sub-xxx",
    "imageGenerated": true,
    "alreadyHadImage": false,
    "s3Key": "cognito-sub-xxx/2026-01/generated_1736409600000.png",
    "imageUrl": "https://library-bucket-youkkk.s3.us-east-1.amazonaws.com/..."
  }
}
```

**Notes:**
- 이미 이미지가 있는 경우 `imageGenerated: false`, `alreadyHadImage: true` 반환
- 이미지 생성에는 약 5-10초 소요

---

### 4. 배치 이미지 생성

```
POST /api/v1/histories/batch-generate
```

**Request Body:**
```json
{
  "limit": 5
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| limit | number | N | 생성할 최대 개수 (기본값: 5, 최대: 20) |

**Response:**
```json
{
  "success": true,
  "summary": {
    "total": 5,
    "generated": 3,
    "skipped": 1,
    "failed": 1
  },
  "data": [
    {
      "historyId": 123,
      "userId": "cognito-sub-xxx",
      "imageGenerated": true,
      "alreadyHadImage": false,
      "s3Key": "...",
      "imageUrl": "...",
      "error": null
    }
  ]
}
```

**Notes:**
- Rate limiting 방지를 위해 각 이미지 생성 사이에 1초 딜레이
- 전체 처리 시간: limit × (5~10초 + 1초)

---

### 5. 텍스트로 직접 이미지 생성

```
POST /api/v1/generate-image
```

**Request Body (옵션 A - 한글 텍스트):**
```json
{
  "text": "오늘 아침 강아지와 공원에서 산책했다. 날씨가 좋아서 기분이 좋았다."
}
```

**Request Body (옵션 B - 직접 프롬프트):**
```json
{
  "positivePrompt": "A realistic photo of walking with a dog in the park, morning, sunny weather",
  "negativePrompt": "low quality, blurry"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| text | string | 조건부 | 한글 텍스트 (자동 프롬프트 변환) |
| positivePrompt | string | 조건부 | 직접 지정할 positive 프롬프트 |
| negativePrompt | string | N | 직접 지정할 negative 프롬프트 |

**Response:**
```json
{
  "success": true,
  "data": {
    "imageBase64": "/9j/4AAQSkZJRgABAQAAAQABAAD...",
    "prompt": {
      "positive": "A realistic documentary-style photo of taking a walk...",
      "negative": "low quality, blurry..."
    }
  }
}
```

**Notes:**
- `imageBase64`는 PNG 이미지의 base64 인코딩 데이터
- S3에 저장되지 않음 (직접 저장 필요시 별도 처리)

---

### 6. 프롬프트 미리보기

```
POST /api/v1/build-prompt
```

**Request Body:**
```json
{
  "text": "오늘 아침 강아지와 공원에서 산책했다."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "positivePrompt": "A realistic documentary-style photo of taking a walk, dog, park, morning...",
    "negativePrompt": "low quality, blurry, pixelated..."
  }
}
```

**Notes:**
- 이미지 생성 전 프롬프트 확인용
- 실제 이미지 생성 비용 없음

---

## Error Response

모든 에러는 다음 형식으로 반환됩니다:

```json
{
  "success": false,
  "error": "에러 메시지"
}
```

**HTTP Status Codes:**
| 코드 | 설명 |
|------|------|
| 200 | 성공 |
| 400 | 잘못된 요청 (파라미터 오류) |
| 404 | 리소스 없음 |
| 500 | 서버 에러 |

---

## 환경 변수

| 변수 | 필수 | 설명 |
|------|------|------|
| PORT | N | 서버 포트 (기본값: 8002) |
| DATABASE_URL | Y | PostgreSQL 연결 문자열 |
| AWS_REGION | N | AWS 리전 (기본값: us-east-1) |
| AWS_ACCESS_KEY_ID | N | AWS 액세스 키 (IAM Role 사용시 불필요) |
| AWS_SECRET_ACCESS_KEY | N | AWS 시크릿 키 (IAM Role 사용시 불필요) |
| S3_BUCKET | N | S3 버킷명 (기본값: library-bucket-youkkk) |
| BEDROCK_MODEL_ID | N | Bedrock 모델 ID (기본값: amazon.titan-image-generator-v2:0) |
