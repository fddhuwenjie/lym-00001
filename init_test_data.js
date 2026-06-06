const { initDB, saveReport } = require('./db/database');
const { decodeMETAR } = require('./decoders/metar');
const { decodeTAF } = require('./decoders/taf');
const { testMessages } = require('./data/test_messages');

initDB();

console.log('开始归档测试气象数据...\n');

for (const metar of testMessages.metar) {
  console.log(`归档 METAR: ${metar.name}`);
  const decoded = decodeMETAR(metar.raw);
  if (decoded.success && decoded.airport) {
    saveReport('METAR', decoded.airport.code, metar.raw, decoded);
    console.log(`  ✓ 已归档: ${decoded.airport.code}`);
  } else {
    console.log(`  ✗ 解码失败: ${decoded.error}`);
  }
}

console.log('');

for (const taf of testMessages.taf) {
  console.log(`归档 TAF: ${taf.name}`);
  const decoded = decodeTAF(taf.raw);
  if (decoded.success && decoded.airport) {
    saveReport('TAF', decoded.airport.code, taf.raw, decoded);
    console.log(`  ✓ 已归档: ${decoded.airport.code}`);
  } else {
    console.log(`  ✗ 解码失败: ${decoded.error}`);
  }
}

console.log('\n测试数据归档完成！');
