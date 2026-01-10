/**
 * 테스트 스크립트 - 각 서비스 개별 테스트
 */

import 'dotenv/config';
import { buildPrompt, validatePromptLength } from './services/promptBuilder.js';
import { generateImage } from './services/imageGenerator.js';
import { closePool } from './services/database.js';
import { getHistoriesWithoutImage } from './services/historyService.js';

async function testPromptBuilder() {
  console.log('\n=== PromptBuilder 테스트 ===\n');

  const testTexts = [
    '오늘 아침 7시에 일어나서 강아지와 산책을 했다. 날씨가 좋아서 기분이 상쾌했다.',
    '점심에 친구들과 치킨을 먹었다. 맛있었다.',
    '저녁에 가족과 함께 비빔밥을 먹으며 대화를 나눴다.',
    '오늘은 멘토링과 스터디가 있는 의미 있는 하루였다.',
  ];

  for (const text of testTexts) {
    console.log(`입력: ${text.substring(0, 50)}...`);
    const result = buildPrompt(text);
    console.log(`Positive: ${result.positivePrompt}`);
    console.log(`길이: ${result.positivePrompt.length}/512`);
    console.log(`유효: ${validatePromptLength(result.positivePrompt)}`);
    console.log('');
  }
}

async function testDatabaseConnection() {
  console.log('\n=== Database 연결 테스트 ===\n');

  try {
    const histories = await getHistoriesWithoutImage(5);
    console.log(`이미지 없는 History ${histories.length}개 조회 성공`);
    
    for (const h of histories) {
      console.log(`  [${h.id}] ${h.user_id.substring(0, 8)}... | ${h.record_date}`);
    }
  } catch (error) {
    console.error('Database 연결 실패:', error);
  }
}

async function testImageGeneration() {
  console.log('\n=== ImageGenerator 테스트 (실제 API 호출) ===\n');

  const testPrompt = 'A realistic documentary-style photo of morning walk with a dog, peaceful daily life, natural lighting, high quality';
  const negativePrompt = 'low quality, blurry, cartoon, anime';

  console.log('테스트 프롬프트:', testPrompt);
  console.log('이미지 생성 중... (약 10-30초 소요)');

  const result = await generateImage(testPrompt, negativePrompt);

  if (result.success) {
    console.log('✅ 이미지 생성 성공!');
    console.log(`   Base64 길이: ${result.imageBase64?.length} 문자`);
  } else {
    console.log('❌ 이미지 생성 실패');
    console.log(`   Error: ${result.error}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const testType = args[0] || 'all';

  try {
    switch (testType) {
      case 'prompt':
        await testPromptBuilder();
        break;
      case 'db':
        await testDatabaseConnection();
        break;
      case 'image':
        await testImageGeneration();
        break;
      case 'all':
        await testPromptBuilder();
        await testDatabaseConnection();
        // 이미지 생성은 비용이 발생하므로 기본적으로 스킵
        console.log('\n⚠️ 이미지 생성 테스트는 "npm run test image"로 별도 실행하세요.');
        break;
      default:
        console.log(`
사용법:
  npm run test prompt   - PromptBuilder 테스트
  npm run test db       - Database 연결 테스트
  npm run test image    - ImageGenerator 테스트 (실제 API 호출, 비용 발생)
  npm run test all      - 전체 테스트 (이미지 생성 제외)
        `);
    }
  } finally {
    await closePool();
  }
}

main();
