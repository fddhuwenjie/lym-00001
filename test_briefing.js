const http = require('http');

const baseUrl = 'http://localhost:8001/api/briefing';

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function post(path, body) {
  return request({
    hostname: 'localhost',
    port: 8001,
    path: path,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, body);
}

function get(path) {
  return request({
    hostname: 'localhost',
    port: 8001,
    path: path,
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
}

function color(text, colorCode) {
  return `\x1b[${colorCode}m${text}\x1b[0m`;
}

async function runTests() {
  console.log(color('========================================', 36));
  console.log(color('  飞行计划气象简报模块 - 完整闭环测试', 36));
  console.log(color('========================================', 36));
  console.log('');

  let routeId, briefing1Id, briefing2Id;

  try {
    console.log(color('【步骤 1】创建航线', 33));
    console.log(color('------------------------', 90));
    const routeBody = {
      name: '北京-成都测试航线',
      departure_airport: 'ZBAA',
      arrival_airport: 'ZUUU',
      waypoints: ['ZUCK'],
      cruise_altitude: 35000,
      flight_duration: 180
    };
    const routeRes = await post(`${baseUrl}/routes`, routeBody);
    routeId = routeRes.data.id;
    console.log(color(`航线创建成功！ID: ${routeId}`, 32));
    console.log(`航线名称: ${routeRes.data.name}`);
    console.log(`起飞机场: ${routeRes.data.departure_airport}`);
    console.log(`降落机场: ${routeRes.data.arrival_airport}`);
    console.log(`途经点: ${routeRes.data.waypoints.join(', ')}`);
    console.log('');

    console.log(color('【步骤 2】查询航线列表（按名称搜索）', 33));
    console.log(color('------------------------', 90));
    const searchRes = await get(`${baseUrl}/routes?name=${encodeURIComponent('北京')}`);
    console.log(color(`找到 ${searchRes.count} 条匹配航线`, 32));
    for (const r of searchRes.data) {
      console.log(`  - ID: ${r.id}, 名称: ${r.name}`);
    }
    console.log('');

    console.log(color('【步骤 3】生成第一份气象简报（触发风险标签）', 33));
    console.log(color('------------------------', 90));
    const briefing1Body = {
      route_id: routeId,
      departure_time: '2026-06-06T08:00:00Z',
      departure_runways: [18, 36],
      arrival_runways: [0o2, 20]
    };
    const briefing1Res = await post(`${baseUrl}/generate`, briefing1Body);
    briefing1Id = briefing1Res.briefingId;
    const briefing1 = briefing1Res.data;
    console.log(color(`简报生成成功！ID: ${briefing1Id}`, 32));
    const riskColor = briefing1.riskAssessment.overallLevel === 'red' ? 31 :
                     briefing1.riskAssessment.overallLevel === 'yellow' ? 33 : 32;
    console.log(`整体风险等级: ${color(briefing1.riskAssessment.overallLabel, riskColor)}`);
    console.log(`是否可飞行: ${briefing1.riskAssessment.canFly}`);
    console.log('');

    console.log(color('【步骤 4】风险标签触发详情', 33));
    console.log(color('------------------------', 90));
    console.log(`起飞机场 (${briefing1.departure.airport}) 风险等级: ${briefing1.departure.riskAssessment.overallLabel}`);
    console.log(`降落机场 (${briefing1.arrival.airport}) 风险等级: ${color(briefing1.arrival.riskAssessment.overallLabel, 31)}`);
    console.log('');
    console.log(`所有触发的风险项 (${briefing1.riskAssessment.totalRiskCount} 项):`);
    for (const risk of briefing1.riskAssessment.risks) {
      const rColor = risk.level === 'red' ? 31 : risk.level === 'yellow' ? 33 : 32;
      console.log(`  ${color(`[${risk.level.toUpperCase()}]`, rColor)} ${risk.message}`);
      console.log(`           建议: ${risk.recommendation}`);
    }
    console.log('');

    console.log(color('【步骤 5】侧风计算结果', 33));
    console.log(color('------------------------', 90));
    if (briefing1.departure.crosswind) {
      console.log(`起飞机场侧风: ${briefing1.departure.crosswind.summary}`);
      for (const calc of briefing1.departure.crosswind.calculations) {
        console.log(`  ${calc.text}`);
      }
    }
    if (briefing1.arrival.crosswind) {
      console.log(`降落机场侧风: ${briefing1.arrival.crosswind.summary}`);
      for (const calc of briefing1.arrival.crosswind.calculations) {
        console.log(`  ${calc.text}`);
      }
    }
    console.log('');

    console.log(color('【步骤 6】替补机场建议（降落机场不安全时自动触发）', 33));
    console.log(color('------------------------', 90));
    if (briefing1.alternateAirports) {
      console.log(color(briefing1.alternateAirports.message, 32));
      console.log(`搜索半径: ${briefing1.alternateAirports.searchRadiusKm} 公里`);
      console.log(`找到备降机场: ${briefing1.alternateAirports.eligibleCount} 个`);
      for (const alt of briefing1.alternateAirports.alternates) {
        console.log(`  ${color('✓', 32)} ${alt.airport.code} - ${alt.airport.name} (${alt.distanceText})`);
        console.log(`    风险等级: ${alt.riskAssessment.overallLabel}`);
      }
      console.log('');
      console.log('所有候选机场（含不符合条件的）:');
      for (const cand of briefing1.alternateAirports.allCandidates) {
        const status = cand.isEligible ? color('✓ 符合', 32) : color('✗ 不符合', 31);
        console.log(`  ${status} ${cand.airport.code} - ${cand.airport.name} (${cand.distanceText}) - ${cand.riskAssessment.overallLabel}`);
      }
    } else {
      console.log(color('降落机场风险等级为绿色，无需备降机场', 32));
    }
    console.log('');

    console.log(color('【步骤 7】生成第二份简报（用于对比）', 33));
    console.log(color('------------------------', 90));
    const briefing2Body = {
      route_id: routeId,
      departure_time: '2026-06-06T12:00:00Z',
      departure_runways: [18, 36],
      arrival_runways: [0o2, 20]
    };
    const briefing2Res = await post(`${baseUrl}/generate`, briefing2Body);
    briefing2Id = briefing2Res.briefingId;
    const briefing2 = briefing2Res.data;
    console.log(color(`第二份简报生成成功！ID: ${briefing2Id}`, 32));
    console.log(`计划起飞时间: ${briefing2.schedule.plannedDepartureTimeText}`);
    console.log(`整体风险等级: ${briefing2.riskAssessment.overallLabel}`);
    console.log('');

    console.log(color('【步骤 8】对比两份简报的差异', 33));
    console.log(color('------------------------', 90));
    const compareRes = await get(`${baseUrl}/compare/${briefing1Id}/${briefing2Id}`);
    console.log(color(compareRes.summary, 32));
    console.log(`简报 #${briefing1Id} (${compareRes.briefing1.departureTime}) vs 简报 #${briefing2Id} (${compareRes.briefing2.departureTime})`);
    console.log('');
    if (compareRes.hasChanges) {
      console.log(color(`发现 ${compareRes.changeCount} 处差异:`, 33));
      for (const change of compareRes.changes) {
        console.log(`  字段: ${change.fieldName}`);
        console.log(`    ${change.change}`);
      }
    } else {
      console.log(color('两份简报关键字段无差异', 32));
    }
    console.log('');

    console.log(color('【步骤 9】查询航线的所有历史简报', 33));
    console.log(color('------------------------', 90));
    const historyRes = await get(`${baseUrl}/routes/${routeId}/briefings`);
    console.log(color(`航线 '${historyRes.route.name}' 共有 ${historyRes.count} 份历史简报`, 32));
    for (const b of historyRes.data) {
      const rColor = b.riskLevel === 'red' ? 31 : b.riskLevel === 'yellow' ? 33 : 32;
      console.log(`  - ID: ${b.id}, 时间: ${b.departureTime}, 风险: ${color(b.riskLevel, rColor)}`);
      console.log(`    摘要: ${b.summary}`);
    }
    console.log('');

    console.log(color('【步骤 10】修改航线信息', 33));
    console.log(color('------------------------', 90));
    const updateBody = {
      name: '北京-成都测试航线（更新）',
      cruise_altitude: 37000,
      flight_duration: 170
    };
    const updateRes = await request({
      hostname: 'localhost',
      port: 8001,
      path: `${baseUrl}/routes/${routeId}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, updateBody);
    console.log(color('航线更新成功！', 32));
    console.log(`新名称: ${updateRes.data.name}`);
    console.log(`新巡航高度: ${updateRes.data.cruise_altitude} 英尺`);
    console.log(`新飞行时长: ${updateRes.data.flight_duration} 分钟`);
    console.log('');

    console.log(color('【步骤 11】单独测试侧风计算接口', 33));
    console.log(color('------------------------', 90));
    const crosswindBody = {
      runway_heading: 18,
      wind_direction: 270,
      wind_speed: 30,
      wind_unit: 'KT'
    };
    const crosswindRes = await post(`${baseUrl}/crosswind`, crosswindBody);
    console.log(color('侧风计算结果:', 32));
    console.log(`  ${crosswindRes.data.text}`);
    console.log(`  逆风分量: ${crosswindRes.data.headwind.text}`);
    console.log(`  侧风分量: ${crosswindRes.data.crosswind.text}`);
    const xwindColor = crosswindRes.data.exceedsLimit ? 31 : 32;
    console.log(`  是否超限: ${color(crosswindRes.data.exceedsLimit.toString(), xwindColor)}`);
    console.log('');

    console.log(color('【步骤 12】单独测试备降机场查询接口', 33));
    console.log(color('------------------------', 90));
    const altRes = await get(`${baseUrl}/alternate/ZUUU?radius_km=500`);
    console.log(color(altRes.message, 32));
    for (const alt of altRes.alternates) {
      console.log(`  ${color('✓', 32)} ${alt.airport.code} - ${alt.airport.name} (${alt.distanceText})`);
    }
    console.log('');

    console.log(color('========================================', 36));
    console.log(color('  完整闭环测试完成！', 36));
    console.log(color('========================================', 36));
    console.log('');
    console.log(color('测试总结:', 33));
    console.log(color('  ✓ 航线管理 (创建/查询/修改)', 32));
    console.log(color('  ✓ 气象简报生成 (METAR/TAF/途经点)', 32));
    console.log(color('  ✓ 风险评估 (红色禁飞/黄色警告/绿色正常)', 32));
    console.log(color('  ✓ 侧风计算 (矢量分解/超限检测)', 32));
    console.log(color('  ✓ 替补机场建议 (距离筛选/风险过滤)', 32));
    console.log(color('  ✓ 简报归档与差异对比', 32));
    console.log('');

  } catch (error) {
    console.error(color('测试失败:', 31), error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
