# Image Generator 배포 가이드

이 문서는 Image Generator API를 EKS 클러스터에 배포하고 기존 서비스와 연동하는 전체 과정을 설명합니다.

## 목차

1. [아키텍처 개요](#아키텍처-개요)
2. [사전 준비](#사전-준비)
3. [프로젝트 구조](#프로젝트-구조)
4. [배포 과정](#배포-과정)
5. [CI/CD 파이프라인](#cicd-파이프라인)
6. [인프라 연결](#인프라-연결)
7. [API 연동 가이드](#api-연동-가이드)

---

## 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Route 53 (DNS)                                │
│                  image.aws11.shop                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NLB (Network Load Balancer)                   │
│         a3c22a2b065a64df888bad01f3cffa1a.elb.us-east-1          │
│                        Port: 8002                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Target Group (image-api-tg)                   │
│                      NodePort: 32002                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EKS Cluster (fproject-dev-eks)                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Namespace: default                      │  │
│  │  ┌─────────────────┐    ┌─────────────────────────────┐   │  │
│  │  │ Service         │    │ Deployment                   │   │  │
│  │  │ image-generator │───▶│ image-generator              │   │  │
│  │  │ :8002           │    │ (Pod: 8002)                  │   │  │
│  │  └─────────────────┘    └─────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   RDS           │ │   S3            │ │ Bedrock         │
│   PostgreSQL    │ │   Bucket        │ │ Titan Image     │
│   (your_db)     │ │ (your-bucket)   │ │ Generator       │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### 기존 서비스와의 관계

| 서비스 | 포트 | 도메인 | 설명 |
|--------|------|--------|------|
| fproject-backend | 3001 | - | 메인 백엔드 |
| journal-api | 8000 | journal.aws11.shop | 저널 API |
| library-backend | 8001 | library.aws11.shop | 라이브러리 API |
| **image-generator** | **8002** | **image.aws11.shop** | **이미지 생성 API** |
| stt-api | 8003 | stt.aws11.shop | STT API |

---

## 사전 준비

### 필수 도구

- AWS CLI (configured)
- kubectl (EKS 클러스터 연결됨)
- Docker
- Git
- Node.js 20+

### AWS 리소스

- EKS 클러스터: `your-eks-cluster`
- ECR 레포지토리: `image-generator`
- RDS: `your-rds-instance`
- S3 버킷: `your-s3-bucket`
- Secrets Manager: `library-api/db-password`

### 권한

- ServiceAccount `library-service-account`에 다음 권한 필요:
  - S3 읽기/쓰기
  - Bedrock InvokeModel
  - Secrets Manager GetSecretValue

---

## 프로젝트 구조

```
image-generator/
├── src/
│   ├── server.ts              # Express API 서버
│   ├── services/
│   │   ├── database.ts        # PostgreSQL + Secrets Manager 연동
│   │   ├── historyService.ts  # History CRUD 및 이미지 생성
│   │   ├── imageGenerator.ts  # Bedrock Titan 이미지 생성
│   │   ├── promptBuilder.ts   # 한글→영어 프롬프트 변환
│   │   └── s3Service.ts       # S3 업로드
│   └── types/
│       └── history.ts         # 타입 정의
├── k8s/
│   ├── deployment.yaml        # Pod 배포 설정
│   ├── service.yaml           # NodePort 서비스
│   ├── ingress.yaml           # ALB Ingress (선택)
│   └── kustomization.yaml     # Kustomize 설정
├── .github/
│   └── workflows/
│       └── deploy.yaml        # GitHub Actions CI/CD
├── Dockerfile                 # 컨테이너 이미지
├── API.md                     # API 문서
└── package.json
```

---

## 배포 과정

### 1단계: GitHub 레포지토리 생성

```bash
# 레포지토리 초기화
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<username>/image.git
git push -u origin main
```

### 2단계: ECR 레포지토리 생성

```bash
aws ecr create-repository --repository-name image-generator --region us-east-1
```

### 3단계: GitHub Secrets 설정

GitHub 레포 → Settings → Secrets and variables → Actions

| Secret Name | 값 |
|-------------|-----|
| `AWS_ACCESS_KEY_ID` | AWS 액세스 키 |
| `AWS_SECRET_ACCESS_KEY` | AWS 시크릿 키 |

### 4단계: ArgoCD Application 등록

ArgoCD UI에서 새 Application 생성:

| 항목 | 값 |
|------|-----|
| Application Name | image-generator |
| Project | default |
| Repository URL | https://github.com/<username>/image.git |
| Revision | main |
| Path | k8s |
| Cluster URL | https://kubernetes.default.svc |
| Namespace | default |
| Sync Policy | Automatic (Prune, Self Heal) |

### 5단계: NLB 타겟그룹 생성

AWS 콘솔에서 타겟그룹 생성:

- 이름: `image-api-tg`
- 타겟 타입: Instance
- 프로토콜: TCP
- 포트: 32002 (NodePort)
- VPC: EKS 클러스터 VPC
- 헬스체크 경로: `/api/v1/health`

### 6단계: NLB 리스너 추가

기존 NLB에 리스너 추가:

- 포트: 8002
- 프로토콜: TCP
- 타겟그룹: image-api-tg

### 7단계: Route 53 DNS 등록

```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id <HOSTED_ZONE_ID> \
  --change-batch file://route53-record.json
```

route53-record.json:
```json
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "image.aws11.shop",
      "Type": "A",
      "AliasTarget": {
        "HostedZoneId": "Z26RNL4JYFTOTI",
        "DNSName": "<NLB_DNS_NAME>",
        "EvaluateTargetHealth": true
      }
    }
  }]
}
```

### 8단계: 보안그룹 설정

EKS 노드 보안그룹에 인바운드 규칙 추가:

- 포트: 32002
- 프로토콜: TCP
- 소스: 0.0.0.0/0

---

## CI/CD 파이프라인

### GitHub Actions 워크플로우

`.github/workflows/deploy.yaml`:

```yaml
name: Build and Push to ECR

on:
  push:
    branches:
      - main

permissions:
  contents: write

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build, tag, and push image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/image-generator:$IMAGE_TAG .
          docker push $ECR_REGISTRY/image-generator:$IMAGE_TAG
          docker push $ECR_REGISTRY/image-generator:latest

      - name: Update deployment image tag
        run: |
          sed -i "s|image:.*|image: $ECR_REGISTRY/image-generator:$IMAGE_TAG|" k8s/deployment.yaml
          git config user.name "github-actions"
          git config user.email "github-actions@github.com"
          git add k8s/deployment.yaml
          git diff --staged --quiet || git commit -m "[skip ci] Update image tag"
          git push
```

### 배포 흐름

```
1. main 브랜치 푸시
       │
       ▼
2. GitHub Actions 트리거
       │
       ▼
3. Docker 이미지 빌드 & ECR 푸시
       │
       ▼
4. deployment.yaml 이미지 태그 업데이트 & 커밋
       │
       ▼
5. ArgoCD 자동 감지 & Sync
       │
       ▼
6. EKS Pod 롤링 업데이트
```

---

## 인프라 연결

### Kubernetes 리소스

**Deployment (k8s/deployment.yaml):**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: image-generator
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: image-generator
  template:
    spec:
      serviceAccountName: library-service-account
      containers:
        - name: image-generator
          image: ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/image-generator:latest
          ports:
            - containerPort: 8002
          env:
            - name: PORT
              value: "8002"
            - name: DB_HOST
              value: "${DB_HOST}"
            - name: DB_PORT
              value: "5432"
            - name: DB_NAME
              value: "fproject_db"
            - name: DB_USER
              value: "fproject_user"
            - name: USE_SECRETS_MANAGER
              value: "true"
            - name: DB_SECRET_NAME
              value: "library-api/db-password"
            - name: AWS_REGION
              value: "us-east-1"
            - name: S3_BUCKET
              value: "${S3_BUCKET}"
```

**Service (k8s/service.yaml):**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: image-generator-service
spec:
  type: NodePort
  selector:
    app: image-generator
  ports:
    - port: 8002
      targetPort: 8002
      nodePort: 32002
```

### AWS Secrets Manager 연동

DB 비밀번호는 코드에 하드코딩하지 않고 AWS Secrets Manager에서 런타임에 가져옵니다:

```typescript
// src/services/database.ts
async function getDbPassword(): Promise<string> {
  if (process.env.USE_SECRETS_MANAGER === 'true') {
    const client = new SecretsManagerClient({ region: 'us-east-1' });
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_NAME })
    );
    return response.SecretString;
  }
  return process.env.DB_PASSWORD;
}
```

---

## API 연동 가이드

### Base URL

```
http://image.aws11.shop:8002/api/v1
```

클러스터 내부에서 호출시:
```
http://image-generator-service:8002/api/v1
```

### 주요 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/health` | 헬스체크 |
| GET | `/histories/without-image` | 이미지 없는 History 목록 |
| GET | `/histories/:id` | 특정 History 조회 |
| POST | `/histories/:id/generate-image` | History에 이미지 생성 |
| POST | `/histories/batch-generate` | 배치 이미지 생성 |
| POST | `/generate-image` | 텍스트로 직접 이미지 생성 |
| POST | `/build-prompt` | 프롬프트 미리보기 |

### 연동 예시

#### Python (FastAPI 서비스에서 호출)

```python
import httpx

IMAGE_API_URL = "http://image-generator-service:8002/api/v1"

async def generate_image_for_history(history_id: int):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{IMAGE_API_URL}/histories/{history_id}/generate-image",
            timeout=60.0  # 이미지 생성은 시간이 걸림
        )
        return response.json()

async def generate_image_from_text(text: str):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{IMAGE_API_URL}/generate-image",
            json={"text": text},
            timeout=60.0
        )
        return response.json()
```

#### JavaScript/TypeScript

```typescript
const IMAGE_API_URL = "http://image-generator-service:8002/api/v1";

async function generateImageForHistory(historyId: number) {
  const response = await fetch(
    `${IMAGE_API_URL}/histories/${historyId}/generate-image`,
    { method: "POST" }
  );
  return response.json();
}

async function generateImageFromText(text: string) {
  const response = await fetch(`${IMAGE_API_URL}/generate-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return response.json();
}
```

#### cURL

```bash
# 헬스체크
curl http://image.aws11.shop:8002/api/v1/health

# History에 이미지 생성
curl -X POST http://image.aws11.shop:8002/api/v1/histories/123/generate-image

# 텍스트로 직접 이미지 생성
curl -X POST http://image.aws11.shop:8002/api/v1/generate-image \
  -H "Content-Type: application/json" \
  -d '{"text": "오늘 아침 강아지와 공원에서 산책했다"}'
```

### 응답 예시

**이미지 생성 성공:**
```json
{
  "success": true,
  "data": {
    "historyId": 123,
    "userId": "cognito-sub-xxx",
    "imageGenerated": true,
    "alreadyHadImage": false,
    "s3Key": "cognito-sub-xxx/2026-01/generated_1736409600000.png",
    "imageUrl": "https://your-bucket.s3.us-east-1.amazonaws.com/..."
  }
}
```

**에러 응답:**
```json
{
  "success": false,
  "error": "History not found"
}
```

### 주의사항

1. **타임아웃 설정**: 이미지 생성은 5-10초 소요되므로 클라이언트 타임아웃을 60초 이상으로 설정
2. **Rate Limiting**: 배치 생성시 각 요청 사이에 1초 딜레이 적용됨
3. **이미지 크기**: 생성되는 이미지는 1024x1024 PNG
4. **S3 URL**: 반환되는 imageUrl은 퍼블릭 URL (버킷 정책에 따라 접근 가능)

---

## 트러블슈팅

### Pod가 Pending 상태

```bash
kubectl describe pod <pod-name>
```

- CPU/메모리 부족: deployment.yaml의 resources 줄이기
- 노드 스케줄링 문제: 노드 상태 확인

### 헬스체크 실패

1. Pod 로그 확인: `kubectl logs <pod-name>`
2. 타겟그룹 헬스체크 경로 확인 (`/health` 또는 `/api/v1/health`)
3. 보안그룹에서 NodePort 열려있는지 확인

### DB 연결 실패

1. Secrets Manager 권한 확인
2. Secret 이름 확인 (`library-api/db-password`)
3. RDS 보안그룹에서 EKS 노드 접근 허용 확인

### 이미지 생성 실패

1. Bedrock 권한 확인 (ServiceAccount IAM Role)
2. Bedrock 모델 리전 확인 (us-east-1)
3. 프롬프트 길이 확인 (512자 제한)
