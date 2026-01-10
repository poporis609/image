/**
 * Image Generator - 메인 실행 파일
 * 
 * History에 이미지가 없는 경우 Bedrock Titan Image Generator로 자동 생성
 */

import 'dotenv/config';
import { closePool } from './services/database.js';
import { 
  getHistoriesWithoutImage, 
  generateImageForHistory,
  generateImagesForAllHistories 
} from './services/historyService.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'list';

  console.log('='.repeat(60));
  console.log('Image Generator - History 이미지 자동 생성');
  console.log('='.repeat(60));

  try {
    switch (command) {
      case 'list':
        // 이미지가 없는 History 목록 조회
        console.log('\n📋 이미지가 없는 History 목록:\n');
        const histories = await getHistoriesWithoutImage(20);
        
        if (histories.length === 0) {
          console.log('모든 History에 이미지가 있습니다.');
        } else {
          for (const h of histories) {
            console.log(`  [${h.id}] ${h.user_id.substring(0, 8)}... | ${h.record_date} | ${h.content.substring(0, 50)}...`);
          }
          console.log(`\n총 ${histories.length}개의 History에 이미지가 없습니다.`);
        }
        break;

      case 'generate':
        // 특정 History ID에 대해 이미지 생성
        const historyId = parseInt(args[1]);
        if (isNaN(historyId)) {
          console.error('사용법: npm start generate <history_id>');
          process.exit(1);
        }

        console.log(`\n🎨 History ${historyId}에 대해 이미지 생성 중...\n`);
        const result = await generateImageForHistory(historyId);

        if (result.imageGenerated) {
          console.log('✅ 이미지 생성 성공!');
          console.log(`   S3 Key: ${result.s3Key}`);
        } else if (result.hasImage) {
          console.log('ℹ️ 이미 이미지가 있습니다.');
          console.log(`   S3 Key: ${result.s3Key}`);
        } else {
          console.log('❌ 이미지 생성 실패');
          console.log(`   Error: ${result.error}`);
        }
        break;

      case 'batch':
        // 배치로 여러 History에 이미지 생성
        const limit = parseInt(args[1]) || 5;
        console.log(`\n🎨 최대 ${limit}개의 History에 대해 이미지 생성 중...\n`);
        
        const results = await generateImagesForAllHistories(limit);
        
        let successCount = 0;
        let skipCount = 0;
        let failCount = 0;

        for (const r of results) {
          if (r.imageGenerated) {
            successCount++;
            console.log(`✅ [${r.historyId}] 생성 완료: ${r.s3Key}`);
          } else if (r.hasImage) {
            skipCount++;
            console.log(`⏭️ [${r.historyId}] 이미 이미지 있음`);
          } else {
            failCount++;
            console.log(`❌ [${r.historyId}] 실패: ${r.error}`);
          }
        }

        console.log(`\n📊 결과: 성공 ${successCount}, 스킵 ${skipCount}, 실패 ${failCount}`);
        break;

      default:
        console.log(`
사용법:
  npm start list              - 이미지가 없는 History 목록 조회
  npm start generate <id>     - 특정 History에 이미지 생성
  npm start batch [limit]     - 배치로 여러 History에 이미지 생성 (기본 5개)
        `);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
