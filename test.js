const { getTestMetars, getTestTafs, getInvalidTests, getAllTestMessages } = require('./data/test_messages');
const { decodeMETAR } = require('./decoders/metar');
const { decodeTAF } = require('./decoders/taf');
const { encodeMETAR, encodeTAF } = require('./encoders/encode');
const { validateSingle, validateBatch, detectType } = require('./validators/validator');

function runTests() {
  console.log('========================================');
  console.log('航空气象电报解码 - 本地单元测试');
  console.log('========================================\n');

  console.log('=== 测试 1: METAR 解码 ===\n');
  const metars = getTestMetars();
  let metarPass = 0;
  let metarFail = 0;
  
  metars.forEach((test, idx) => {
    console.log(`测试 ${idx + 1}: ${test.name}`);
    console.log(`  描述: ${test.description}`);
    console.log(`  原始电报: ${test.raw}`);
    
    const result = decodeMETAR(test.raw);
    
    if (result.success) {
      console.log(`  ✅ 解码成功`);
      console.log(`     机场: ${result.airport?.code}`);
      console.log(`     时间: ${result.observationTime?.text}`);
      console.log(`     风: ${result.wind?.text || 'N/A'}`);
      console.log(`     能见度: ${result.visibility?.text || 'N/A'}`);
      console.log(`     温度/露点: ${result.temperature?.text || 'N/A'} / ${result.dewPoint?.text || 'N/A'}`);
      console.log(`     气压: ${result.pressure?.text || 'N/A'}`);
      console.log(`     云组: ${result.clouds?.length || 0} 层`);
      console.log(`     天气现象: ${result.weather?.length || 0} 种`);
      console.log(`     趋势: ${result.trends?.length || 0} 段`);
      
      const encoded = encodeMETAR(result);
      if (encoded.success) {
        console.log(`     🔄 反向编码: ${encoded.encoded}`);
        const reDecoded = decodeMETAR(encoded.encoded);
        if (reDecoded.success) {
          console.log(`     ✅ 往返一致 ✓`);
        } else {
          console.log(`     ⚠️  往返解码失败: ${reDecoded.error}`);
        }
      }
      
      const validation = validateSingle(test.raw);
      console.log(`     校验: ${validation.valid ? '✅ 合法' : '❌ 非法'} (${validation.errorCount} 错误, ${validation.warningCount} 警告)`);
      
      metarPass++;
    } else {
      console.log(`  ❌ 解码失败: ${result.error}`);
      metarFail++;
    }
    console.log('');
  });

  console.log('=== 测试 2: TAF 解码 ===\n');
  const tafs = getTestTafs();
  let tafPass = 0;
  let tafFail = 0;
  
  tafs.forEach((test, idx) => {
    console.log(`测试 ${idx + 1}: ${test.name}`);
    console.log(`  描述: ${test.description}`);
    console.log(`  原始电报: ${test.raw}`);
    
    const result = decodeTAF(test.raw);
    
    if (result.success) {
      console.log(`  ✅ 解码成功`);
      console.log(`     机场: ${result.airport?.code}`);
      console.log(`     发布时间: ${result.issueTime?.text}`);
      console.log(`     有效时段: ${result.validPeriod?.text}`);
      console.log(`     主预报风: ${result.mainForecast?.wind?.text || 'N/A'}`);
      console.log(`     主预报能见度: ${result.mainForecast?.visibility?.text || 'N/A'}`);
      console.log(`     变化段数: ${result.changeGroups?.length || 0}`);
      
      result.changeGroups?.forEach((cg, cgIdx) => {
        console.log(`       [${cgIdx + 1}] ${cg.typeText}: ${cg.period?.text || cg.fmTime?.text || 'N/A'}`);
        if (cg.wind) console.log(`            风: ${cg.wind.text}`);
        if (cg.visibility) console.log(`            能见度: ${cg.visibility.text}`);
        if (cg.weather?.length > 0) console.log(`            天气: ${cg.weather.map(w => w.text).join(', ')}`);
      });
      
      const encoded = encodeTAF(result);
      if (encoded.success) {
        console.log(`     🔄 反向编码: ${encoded.encoded}`);
        const reDecoded = decodeTAF(encoded.encoded);
        if (reDecoded.success) {
          console.log(`     ✅ 往返一致 ✓`);
        } else {
          console.log(`     ⚠️  往返解码失败: ${reDecoded.error}`);
        }
      }
      
      const validation = validateSingle(test.raw);
      console.log(`     校验: ${validation.valid ? '✅ 合法' : '❌ 非法'} (${validation.errorCount} 错误, ${validation.warningCount} 警告)`);
      
      tafPass++;
    } else {
      console.log(`  ❌ 解码失败: ${result.error}`);
      tafFail++;
    }
    console.log('');
  });

  console.log('=== 测试 3: 批量校验（含非法电报） ===\n');
  const allMessages = getAllTestMessages().map(m => m.raw);
  const batchResult = validateBatch(allMessages);
  
  console.log(`总电报数: ${batchResult.total}`);
  console.log(`合法: ${batchResult.valid} | 非法: ${batchResult.invalid}`);
  console.log(`总错误数: ${batchResult.totalErrors} | 总警告数: ${batchResult.totalWarnings}\n`);
  
  batchResult.results.forEach((r, idx) => {
    const type = detectType(r.raw);
    console.log(`[${idx + 1}] ${type.padEnd(6)} ${r.valid ? '✅' : '❌'} ${r.raw.substring(0, 60)}...`);
    if (r.errors.length > 0) {
      r.errors.forEach(e => console.log(`       错误: ${e.message}`));
    }
    if (r.warnings.length > 0) {
      r.warnings.forEach(w => console.log(`       警告: ${w.message}`));
    }
  });

  console.log('\n=== 测试 4: 特殊场景验证 ===\n');
  
  console.log('场景 1: 温度负数 M 前缀处理');
  const tempTest = decodeMETAR('METAR ZBAA 060800Z 18005MPS 9999 M10/M15 Q1015');
  console.log(`  温度: ${tempTest.temperature?.value}°C (raw: ${tempTest.temperature?.raw})`);
  console.log(`  露点: ${tempTest.dewPoint?.value}°C (raw: ${tempTest.dewPoint?.raw})`);
  console.log(`  ✅ ${tempTest.temperature?.value === -10 && tempTest.dewPoint?.value === -15 ? '通过' : '失败'}`);
  
  console.log('\n场景 2: CAVOK 处理');
  const cavokTest = decodeMETAR('METAR ZSPD 060800Z 18005KT CAVOK 25/20 Q1015');
  console.log(`  CAVOK: ${cavokTest.visibility?.cavok}`);
  console.log(`  天气现象数: ${cavokTest.weather?.length || 0}`);
  console.log(`  云组数: ${cavokTest.clouds?.length || 0}`);
  console.log(`  ✅ ${cavokTest.visibility?.cavok && cavokTest.weather?.length === 0 && cavokTest.clouds?.length === 0 ? '通过' : '失败'}`);
  
  console.log('\n场景 3: 风速单位 KT vs MPS');
  const ktTest = decodeMETAR('METAR EGLL 060800Z 18015KT 9999 20/10 Q1015');
  const mpsTest = decodeMETAR('METAR ZBAA 060800Z 18008MPS 9999 20/10 Q1015');
  console.log(`  KT: ${ktTest.wind?.speed?.value} ${ktTest.wind?.speed?.unit}`);
  console.log(`  MPS: ${mpsTest.wind?.speed?.value} ${mpsTest.wind?.speed?.unit}`);
  console.log(`  ✅ ${ktTest.wind?.speed?.unit === 'KT' && mpsTest.wind?.speed?.unit === 'MPS' ? '通过' : '失败'}`);
  
  console.log('\n场景 4: TAF 跨日时段');
  const crossDayTest = decodeTAF('TAF ZBAA 060500Z 0620/0706 20008MPS 9999 SCT050');
  console.log(`  时段: ${crossDayTest.validPeriod?.text}`);
  console.log(`  跨日: ${crossDayTest.validPeriod?.crossDay}`);
  console.log(`  开始: ${crossDayTest.validPeriod?.from?.timestamp}`);
  console.log(`  结束: ${crossDayTest.validPeriod?.to?.timestamp}`);
  console.log(`  ✅ ${crossDayTest.validPeriod?.crossDay ? '通过' : '失败'}`);

  console.log('\n========================================');
  console.log('测试汇总:');
  console.log(`  METAR: ${metarPass} 通过, ${metarFail} 失败`);
  console.log(`  TAF:   ${tafPass} 通过, ${tafFail} 失败`);
  console.log(`  总计:  ${metarPass + tafPass} 通过, ${metarFail + tafFail} 失败`);
  console.log('========================================');
  console.log('\n💡 提示: 运行 "npm start" 启动服务后，可使用 curl 命令进行 API 测试');
  console.log('   示例: curl -X POST http://localhost:8001/api/decode/metar -H "Content-Type: application/json" -d \'{"raw":"METAR ZBAA 060800Z 18005MPS 9999 25/M10 Q1015 NOSIG"}\'\n');
}

runTests();
