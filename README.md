# Image Generator

History 기록에 이미지가 없을 때 Amazon Bedrock Titan Image Generator G1 V2를 사용하여 자동으로 이미지를 생성하는 서비스입니다.

## 기능

- History 텍스트 내용을 분석하여 이미지 생성 프롬프트 자동 생성
- Bedrock Titan Image Generator V2로 1024x1024 이미지 생성
- 생성된 이미지를 S3에 업로드
- History 테이블의 s3_key 자동 업데이트

## 설치

```bash
cd image-generator
npm install
```

## 환경 변수 설정

`.env` 파일을 생성하고 다음 내용을 설정하세요:

```env
# Database Configuration
DB_HOST=your-rds-endpoint.region.rds.amazonaws.com
DB_PORT=5432
DB_NAME=your_db_name
DB_USER=your_db_user
DB_PASSWORD=your_password

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# S3 Configuration
S3_BUCKET=your-s3-bucket

# Bedrock Model
BEDROCK_MODEL_ID=amazon.titan-image-generator-v2:0
```

## 사용법

### 이미지가 없는 History 목록 조회

```bash
npm start list
```

### 특정 History에 이미지 생성

```bash
npm start generate <history_id>
```

### 배치로 여러 History에 이미지 생성

```bash
npm start batch [limit]  # 기본 5개
```

## 테스트

```bash
# PromptBuilder 테스트
npm run test prompt

# Database 연결 테스트
npm run test db

# ImageGenerator 테스트 (실제 API 호출, 비용 발생)
npm run test image

# 전체 테스트 (이미지 생성 제외)
npm run test all
```

## AWS IAM 권한

다음 권한이 필요합니다:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel"],
      "Resource": ["arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-image-generator-v2:0"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": ["arn:aws:s3:::your-s3-bucket/*"]
    }
  ]
}
```

## 프로젝트 구조

```
image-generator/
├── src/
│   ├── services/
│   │   ├── database.ts       # PostgreSQL 연결
│   │   ├── promptBuilder.ts  # 프롬프트 생성
│   │   ├── imageGenerator.ts # Bedrock API 호출
│   │   ├── s3Service.ts      # S3 업로드
│   │   └── historyService.ts # History 처리
│   ├── types/
│   │   └── history.ts        # 타입 정의
│   ├── index.ts              # 메인 실행 파일
│   └── test.ts               # 테스트 스크립트
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## 주의사항

- Bedrock API 호출 시 비용이 발생합니다
- 이미지 생성에는 약 10-30초가 소요됩니다
- Rate limiting 방지를 위해 배치 처리 시 1초 간격으로 호출합니다
