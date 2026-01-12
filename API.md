# Image Generator API

History 콘텐츠를 기반으로 AI 이미지를 자동 생성하는 API 서비스입니다.
Bedrock Flow를 사용하여 한글 일기를 영어 이미지 프롬프트로 자동 변환합니다.

## Base URL

```
http://image.aws11.shop:8002/api/v1
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
  "timestamp": "2026-01-12T10:00:00.000Z"
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
      "recordDate": "2026-01-12",
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
    "recordDate": "2026-01-12",
    "tags": ["산책", "강아지"],
    "s3Key": "cognito-sub-xxx/history/2026/01/12/image_1736409600000.png",
    "imageUrl": "https://your-bucket.s3.us-east-1.amazonaws.com/..."
  }
}
```

---

### 3. 특정 History에 이미지 생성 ⭐ 주요 API

```
POST /api/v1/histories/:id/generate-image
```

**Path Parameters:**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| id | number | Y | History ID |

**Response (새로 생성된 경우):**
```json
{
  "success": true,
  "data": {
    "historyId": 123,
    "userId": "cognito-sub-xxx",
    "imageGenerated": true,
    "alreadyHadImage": false,
    "s3Key": "cognito-sub-xxx/history/2026/01/12/image_1736409600000.png",
    "textKey": "cognito-sub-xxx/history/2026/01/12/summary_1736409600000.txt",
    "imageUrl": "https://your-bucket.s3.us-east-1.amazonaws.com/cognito-sub-xxx/history/2026/01/12/image_1736409600000.png",
    "textUrl": "https://your-bucket.s3.us-east-1.amazonaws.com/cognito-sub-xxx/history/2026/01/12/summary_1736409600000.txt"
  }
}
```

**Response (이미 이미지가 있는 경우):**
```json
{
  "success": true,
  "data": {
    "historyId": 123,
    "userId": "cognito-sub-xxx",
    "imageGenerated": false,
    "alreadyHadImage": true,
    "s3Key": "cognito-sub-xxx/history/2026/01/12/image_1736409600000.png",
    "textKey": "cognito-sub-xxx/history/2026/01/12/summary_1736409600000.txt",
    "imageUrl": "https://your-bucket.s3.us-east-1.amazonaws.com/...",
    "textUrl": "https://your-bucket.s3.us-east-1.amazonaws.com/..."
  }
}
```

**Response Fields:**
| 필드 | 타입 | 설명 |
|------|------|------|
| historyId | number | History ID |
| userId | string | Cognito Sub |
| imageGenerated | boolean | 이번 요청에서 이미지가 생성되었는지 |
| alreadyHadImage | boolean | 이미 이미지가 있었는지 |
| s3Key | string | 이미지 S3 키 |
| textKey | string | 요약 텍스트 S3 키 (신규) |
| imageUrl | string | 이미지 전체 URL |
| textUrl | string | 요약 텍스트 전체 URL (신규) |

**Notes:**
- 이미지 생성에는 약 10-30초 소요
- Bedrock Flow가 한글 일기를 자동으로 영어 프롬프트로 변환
- 이미지와 요약 텍스트가 함께 S3에 저장됨
- S3 경로: `{cognito-sub}/history/{YYYY}/{MM}/{DD}/`

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
      "s3Key": "cognito-sub-xxx/history/2026/01/12/image_xxx.png",
      "textKey": "cognito-sub-xxx/history/2026/01/12/summary_xxx.txt",
      "imageUrl": "https://your-bucket.s3.us-east-1.amazonaws.com/...",
      "textUrl": "https://your-bucket.s3.us-east-1.amazonaws.com/...",
      "error": null
    }
  ]
}
```

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

---

## S3 저장 구조

```
your-s3-bucket/
└── {cognito-sub}/
    └── history/
        └── {YYYY}/
            └── {MM}/
                └── {DD}/
                    ├── image_{timestamp}.png    # AI 생성 이미지
                    └── summary_{timestamp}.txt  # 요약 텍스트 (JSON)
```

**summary_{timestamp}.txt 형식:**
```json
{
  "summary": "오늘 아침 강아지와 공원에서 산책했다...",
  "tags": ["산책", "강아지"],
  "recordDate": "2026-01-12",
  "createdAt": "2026-01-12T10:30:00.000Z"
}
```

---

## Error Response

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
| 400 | 잘못된 요청 |
| 404 | 리소스 없음 |
| 500 | 서버 에러 |

---

## 환경 변수

| 변수 | 필수 | 설명 |
|------|------|------|
| PORT | N | 서버 포트 (기본값: 8002) |
| DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD | Y | PostgreSQL 연결 정보 |
| AWS_REGION | N | AWS 리전 (기본값: us-east-1) |
| S3_BUCKET | N | 기존 S3 버킷 |
| KNOWLEDGE_BASE_BUCKET | N | 히스토리 저장 버킷 |
| BEDROCK_MODEL_ID | N | Titan 모델 ID (기본값: amazon.titan-image-generator-v2:0) |
| BEDROCK_FLOW_ID | Y | Bedrock Flow ID |
| BEDROCK_FLOW_ALIAS_ID | Y | Bedrock Flow Alias ID |
