# Image Generator 배포 스크립트

$ErrorActionPreference = "Stop"

# AWS 계정 ID는 환경변수나 AWS CLI에서 가져오기
$AWS_ACCOUNT_ID = aws sts get-caller-identity --query Account --output text
$AWS_REGION = "us-east-1"
$ECR_REPO = "image-generator"
$IMAGE_TAG = git rev-parse --short HEAD

Write-Host "=== Image Generator 배포 ===" -ForegroundColor Cyan

# 1. ECR 로그인
Write-Host "`n[1/5] ECR 로그인..." -ForegroundColor Yellow
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

# 2. ECR 레포지토리 생성 (없으면)
Write-Host "`n[2/5] ECR 레포지토리 확인..." -ForegroundColor Yellow
$repoExists = aws ecr describe-repositories --repository-names $ECR_REPO 2>$null
if (-not $repoExists) {
    Write-Host "ECR 레포지토리 생성 중..."
    aws ecr create-repository --repository-name $ECR_REPO --region $AWS_REGION
}

# 3. Docker 이미지 빌드
Write-Host "`n[3/5] Docker 이미지 빌드..." -ForegroundColor Yellow
docker build -t "${ECR_REPO}:${IMAGE_TAG}" .
docker tag "${ECR_REPO}:${IMAGE_TAG}" "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}"
docker tag "${ECR_REPO}:${IMAGE_TAG}" "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/${ECR_REPO}:latest"

# 4. ECR에 푸시
Write-Host "`n[4/5] ECR에 이미지 푸시..." -ForegroundColor Yellow
docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}"
docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/${ECR_REPO}:latest"

# 5. K8s 배포
Write-Host "`n[5/5] Kubernetes 배포..." -ForegroundColor Yellow
kubectl apply -f k8s/

Write-Host "`n=== 배포 완료 ===" -ForegroundColor Green
Write-Host "이미지: $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}"
kubectl get pods -l app=image-generator
