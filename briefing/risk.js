const { convertToKnots } = require('./crosswind');
const { normalizeTafForecast } = require('./taf_utils');

const RISK_LEVELS = {
  GREEN: 'green',
  YELLOW: 'yellow',
  RED: 'red'
};

const RISK_LABELS = {
  green: '绿色正常',
  yellow: '黄色警告',
  red: '红色禁飞'
};

function convertToMetersPerSecond(speed, unit) {
  if (!speed || !unit) return 0;
  switch (unit.toUpperCase()) {
    case 'MPS':
      return speed;
    case 'KT':
      return speed * 0.514444;
    case 'KMH':
      return speed * 0.277778;
    default:
      return speed;
  }
}

function checkVisibility(decoded, airportCode, airportType) {
  const risks = [];
  if (!decoded || !decoded.visibility) return risks;

  const visibility = decoded.visibility;

  if (visibility.cavok) {
    return risks;
  }

  const visValue = visibility.value;

  if (visValue != null) {
    if (visValue < 800) {
      risks.push({
        level: RISK_LEVELS.RED,
        category: 'visibility',
        severity: 'critical',
        airport: airportCode,
        airportType,
        rule: 'visibility_below_800m',
        threshold: 800,
        actual: visValue,
        unit: 'M',
        message: `${airportType}机场 ${airportCode} 能见度 ${visValue} 米，低于最低标准 800 米`,
        recommendation: '能见度极差，禁止飞行'
      });
    } else if (visValue < 1500) {
      risks.push({
        level: RISK_LEVELS.YELLOW,
        category: 'visibility',
        severity: 'warning',
        airport: airportCode,
        airportType,
        rule: 'visibility_below_1500m',
        threshold: 1500,
        actual: visValue,
        unit: 'M',
        message: `${airportType}机场 ${airportCode} 能见度 ${visValue} 米，低于安全标准 1500 米`,
        recommendation: '能见度较低，谨慎操作，建议考虑备降'
      });
    }
  }

  return risks;
}

function checkWeatherPhenomena(decoded, airportCode, airportType) {
  const risks = [];
  if (!decoded || !decoded.weather || decoded.weather.length === 0) return risks;

  const thunderstormCodes = ['TS', 'TSRA', 'TSGR', 'TSGS', 'TSRG'];
  const freezingCodes = ['FZ', 'FZRA', 'FZFG', 'FZDZ', 'FZSN'];
  const severeWeatherCodes = ['FC', 'SS', 'DS', 'SQ', 'PO'];

  for (const weather of decoded.weather) {
    const raw = weather.raw || '';
    const phenomenaCodes = weather.phenomena?.map(p => p.code) || [];

    const hasThunderstorm = phenomenaCodes.some(c => thunderstormCodes.includes(c) || c === 'TS' || raw.includes('TS'));
    const hasFreezing = phenomenaCodes.some(c => freezingCodes.includes(c) || c === 'FZ' || raw.includes('FZ'));
    const hasSevere = phenomenaCodes.some(c => severeWeatherCodes.includes(c));

    if (hasThunderstorm) {
      risks.push({
        level: RISK_LEVELS.RED,
        category: 'weather',
        severity: 'critical',
        airport: airportCode,
        airportType,
        rule: 'thunderstorm_present',
        weatherCode: raw,
        weatherText: weather.text,
        message: `${airportType}机场 ${airportCode} 检测到雷暴天气：${weather.text}`,
        recommendation: '雷暴天气，禁止飞行'
      });
    }

    if (hasFreezing) {
      risks.push({
        level: RISK_LEVELS.RED,
        category: 'weather',
        severity: 'critical',
        airport: airportCode,
        airportType,
        rule: 'freezing_precipitation',
        weatherCode: raw,
        weatherText: weather.text,
        message: `${airportType}机场 ${airportCode} 检测到冻降水：${weather.text}`,
        recommendation: '存在积冰风险，禁止飞行'
      });
    }

    if (hasSevere) {
      risks.push({
        level: RISK_LEVELS.RED,
        category: 'weather',
        severity: 'critical',
        airport: airportCode,
        airportType,
        rule: 'severe_weather',
        weatherCode: raw,
        weatherText: weather.text,
        message: `${airportType}机场 ${airportCode} 检测到恶劣天气：${weather.text}`,
        recommendation: '极端天气，禁止飞行'
      });
    }

    if (weather.intensity === '+') {
      risks.push({
        level: RISK_LEVELS.YELLOW,
        category: 'weather',
        severity: 'warning',
        airport: airportCode,
        airportType,
        rule: 'heavy_precipitation',
        weatherCode: raw,
        weatherText: weather.text,
        message: `${airportType}机场 ${airportCode} 有强降水：${weather.text}`,
        recommendation: '强降水天气，谨慎操作'
      });
    }
  }

  return risks;
}

function checkWind(decoded, airportCode, airportType, crosswindData) {
  const risks = [];
  if (!decoded || !decoded.wind) return risks;

  const wind = decoded.wind;

  const gustValue = wind.gust?.value;
  const gustUnit = wind.gust?.unit || wind.speed?.unit || 'KT';

  if (gustValue != null) {
    const gustMps = convertToMetersPerSecond(gustValue, gustUnit);
    if (gustMps > 20) {
      risks.push({
        level: RISK_LEVELS.RED,
        category: 'wind',
        severity: 'critical',
        airport: airportCode,
        airportType,
        rule: 'gust_above_20mps',
        threshold: 20,
        actual: Math.round(gustMps * 10) / 10,
        unit: 'MPS',
        rawValue: gustValue,
        rawUnit: gustUnit,
        message: `${airportType}机场 ${airportCode} 阵风 ${Math.round(gustMps * 10) / 10} m/s，超过 20 m/s 限制`,
        recommendation: '阵风过大，禁止飞行'
      });
    } else if (gustMps > 15) {
      risks.push({
        level: RISK_LEVELS.YELLOW,
        category: 'wind',
        severity: 'warning',
        airport: airportCode,
        airportType,
        rule: 'gust_above_15mps',
        threshold: 15,
        actual: Math.round(gustMps * 10) / 10,
        unit: 'MPS',
        rawValue: gustValue,
        rawUnit: gustUnit,
        message: `${airportType}机场 ${airportCode} 阵风 ${Math.round(gustMps * 10) / 10} m/s，超过 15 m/s 警告阈值`,
        recommendation: '阵风较大，谨慎操作'
      });
    }
  }

  const windSpeedValue = wind.speed?.value;
  const windSpeedUnit = wind.speed?.unit || 'KT';
  if (windSpeedValue != null) {
    const windSpeedKt = convertToKnots(windSpeedValue, windSpeedUnit);
    if (windSpeedKt > 40) {
      risks.push({
        level: RISK_LEVELS.YELLOW,
        category: 'wind',
        severity: 'warning',
        airport: airportCode,
        airportType,
        rule: 'windspeed_above_40kt',
        threshold: 40,
        actual: Math.round(windSpeedKt),
        unit: 'KT',
        message: `${airportType}机场 ${airportCode} 风速 ${Math.round(windSpeedKt)} 节，超过 40 节警告阈值`,
        recommendation: '风速较大，注意操作'
      });
    }
  }

  if (crosswindData && crosswindData.maxCrosswindKt != null) {
    if (crosswindData.maxCrosswindKt > 25) {
      risks.push({
        level: RISK_LEVELS.RED,
        category: 'crosswind',
        severity: 'critical',
        airport: airportCode,
        airportType,
        rule: 'crosswind_above_25kt',
        threshold: 25,
        actual: crosswindData.maxCrosswindKt,
        unit: 'KT',
        message: `${airportType}机场 ${airportCode} 最大侧风 ${crosswindData.maxCrosswindKt} 节，超过 25 节限制`,
        recommendation: '侧风过大，禁止起降'
      });
    } else if (crosswindData.maxCrosswindKt > 15) {
      risks.push({
        level: RISK_LEVELS.YELLOW,
        category: 'crosswind',
        severity: 'warning',
        airport: airportCode,
        airportType,
        rule: 'crosswind_above_15kt',
        threshold: 15,
        actual: crosswindData.maxCrosswindKt,
        unit: 'KT',
        message: `${airportType}机场 ${airportCode} 最大侧风 ${crosswindData.maxCrosswindKt} 节，超过 15 节警告阈值`,
        recommendation: '侧风较大，谨慎操作'
      });
    }
  }

  return risks;
}

function checkClouds(decoded, airportCode, airportType) {
  const risks = [];
  if (!decoded || !decoded.clouds || decoded.clouds.length === 0) return risks;

  for (const cloud of decoded.clouds) {
    if (!cloud.amount || !cloud.height) continue;

    const amount = cloud.amount;
    const heightFeet = cloud.height.value;

    if ((amount === 'BKN' || amount === 'OVC') && heightFeet < 200) {
      risks.push({
        level: RISK_LEVELS.RED,
        category: 'clouds',
        severity: 'critical',
        airport: airportCode,
        airportType,
        rule: 'low_ceiling_below_200ft',
        threshold: 200,
        actual: heightFeet,
        unit: 'FT',
        cloudAmount: amount,
        cloudText: cloud.text,
        message: `${airportType}机场 ${airportCode} ${cloud.amountText} 云底高度 ${heightFeet} 英尺，低于 200 英尺最低安全高度`,
        recommendation: '云高过低，禁止起降'
      });
    } else if ((amount === 'BKN' || amount === 'OVC') && heightFeet < 500) {
      risks.push({
        level: RISK_LEVELS.YELLOW,
        category: 'clouds',
        severity: 'warning',
        airport: airportCode,
        airportType,
        rule: 'low_ceiling_below_500ft',
        threshold: 500,
        actual: heightFeet,
        unit: 'FT',
        cloudAmount: amount,
        cloudText: cloud.text,
        message: `${airportType}机场 ${airportCode} ${cloud.amountText} 云底高度 ${heightFeet} 英尺，低于 500 英尺警告阈值`,
        recommendation: '云高较低，谨慎操作'
      });
    }

    if (cloud.cloudType && (cloud.cloudType.code === 'CB' || cloud.cloudType.code === 'TCU')) {
      risks.push({
        level: RISK_LEVELS.YELLOW,
        category: 'clouds',
        severity: 'warning',
        airport: airportCode,
        airportType,
        rule: 'cumulonimbus_present',
        cloudType: cloud.cloudType.code,
        cloudText: cloud.text,
        message: `${airportType}机场 ${airportCode} 检测到${cloud.cloudType.text}：${cloud.text}`,
        recommendation: '存在对流云，注意避开'
      });
    }
  }

  return risks;
}

function assessAirportRisk(decodedMetar, decodedTaf, airportCode, airportType, crosswindData) {
  const allRisks = [];

  if (decodedMetar) {
    allRisks.push(...checkVisibility(decodedMetar, airportCode, airportType));
    allRisks.push(...checkWeatherPhenomena(decodedMetar, airportCode, airportType));
    allRisks.push(...checkWind(decodedMetar, airportCode, airportType, crosswindData));
    allRisks.push(...checkClouds(decodedMetar, airportCode, airportType));
  }

  if (decodedTaf) {
    if (!decodedTaf.forecast) {
      decodedTaf.forecast = normalizeTafForecast(decodedTaf);
    }
  }

  if (decodedTaf && decodedTaf.forecast && decodedTaf.forecast.length > 0) {
    for (const forecast of decodedTaf.forecast) {
      if (forecast.period && forecast.elements) {
        const tafRisks = [];
        tafRisks.push(...checkVisibility(forecast.elements, airportCode, `${airportType}(TAF)`));
        tafRisks.push(...checkWeatherPhenomena(forecast.elements, airportCode, `${airportType}(TAF)`));
        tafRisks.push(...checkClouds(forecast.elements, airportCode, `${airportType}(TAF)`));
        for (const risk of tafRisks) {
          risk.forecastPeriod = forecast.period.text;
          allRisks.push(risk);
        }
      }
    }
  }

  let overallLevel = RISK_LEVELS.GREEN;
  if (allRisks.some(r => r.level === RISK_LEVELS.RED)) {
    overallLevel = RISK_LEVELS.RED;
  } else if (allRisks.some(r => r.level === RISK_LEVELS.YELLOW)) {
    overallLevel = RISK_LEVELS.YELLOW;
  }

  const redRisks = allRisks.filter(r => r.level === RISK_LEVELS.RED);
  const yellowRisks = allRisks.filter(r => r.level === RISK_LEVELS.YELLOW);

  return {
    airport: airportCode,
    airportType,
    overallLevel,
    overallLabel: RISK_LABELS[overallLevel],
    canOperate: overallLevel !== RISK_LEVELS.RED,
    totalRiskCount: allRisks.length,
    redRiskCount: redRisks.length,
    yellowRiskCount: yellowRisks.length,
    risks: allRisks,
    summary: generateRiskSummary(overallLevel, redRisks.length, yellowRisks.length, airportCode)
  };
}

function generateRiskSummary(level, redCount, yellowCount, airportCode) {
  if (level === RISK_LEVELS.RED) {
    return `${airportCode} 存在 ${redCount} 项红色禁飞风险和 ${yellowCount} 项黄色警告，禁止飞行`;
  } else if (level === RISK_LEVELS.YELLOW) {
    return `${airportCode} 存在 ${yellowCount} 项黄色警告，建议谨慎操作`;
  } else {
    return `${airportCode} 气象条件良好，适合飞行`;
  }
}

function assessBriefingRisk(briefingData) {
  const allRisks = [];

  if (briefingData.departure?.riskAssessment) {
    allRisks.push(...briefingData.departure.riskAssessment.risks.map(r => ({ ...r, section: 'departure' })));
  }

  if (briefingData.arrival?.riskAssessment) {
    allRisks.push(...briefingData.arrival.riskAssessment.risks.map(r => ({ ...r, section: 'arrival' })));
  }

  if (briefingData.enroute && briefingData.enroute.length > 0) {
    for (const wp of briefingData.enroute) {
      if (wp.riskAssessment) {
        allRisks.push(...wp.riskAssessment.risks.map(r => ({ ...r, section: 'enroute', waypoint: wp.airport })));
      }
    }
  }

  let overallLevel = RISK_LEVELS.GREEN;
  if (allRisks.some(r => r.level === RISK_LEVELS.RED)) {
    overallLevel = RISK_LEVELS.RED;
  } else if (allRisks.some(r => r.level === RISK_LEVELS.YELLOW)) {
    overallLevel = RISK_LEVELS.YELLOW;
  }

  const redRisks = allRisks.filter(r => r.level === RISK_LEVELS.RED);
  const yellowRisks = allRisks.filter(r => r.level === RISK_LEVELS.YELLOW);

  const departureOk = briefingData.departure?.riskAssessment?.canOperate ?? true;
  const arrivalOk = briefingData.arrival?.riskAssessment?.canOperate ?? true;

  return {
    overallLevel,
    overallLabel: RISK_LABELS[overallLevel],
    canFly: overallLevel !== RISK_LEVELS.RED && departureOk && arrivalOk,
    totalRiskCount: allRisks.length,
    redRiskCount: redRisks.length,
    yellowRiskCount: yellowRisks.length,
    risks: allRisks,
    departureOperable: departureOk,
    arrivalOperable: arrivalOk,
    summary: overallLevel === RISK_LEVELS.RED
      ? `存在 ${redRisks.length} 项红色禁飞风险，禁止执行此航班`
      : overallLevel === RISK_LEVELS.YELLOW
      ? `存在 ${yellowRisks.length} 项黄色警告，建议评估后谨慎操作`
      : '所有检查点通过，适合飞行'
  };
}

module.exports = {
  RISK_LEVELS,
  RISK_LABELS,
  checkVisibility,
  checkWeatherPhenomena,
  checkWind,
  checkClouds,
  assessAirportRisk,
  assessBriefingRisk
};
