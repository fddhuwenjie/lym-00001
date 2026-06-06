const {
  getRouteById,
  getLatestReport,
  getReportByTimeAndType,
  saveBriefing,
  getBriefingById,
  getBriefingsByRoute
} = require('../db/database');
const { findAirport } = require('../data/airports');
const { decodeTAF } = require('../decoders/taf');
const { calculateAirportCrosswinds } = require('./crosswind');
const { assessAirportRisk, assessBriefingRisk, RISK_LEVELS } = require('./risk');
const { findAlternateAirports } = require('./alternate');

function parseUTCTime(timeStr) {
  if (!timeStr) return null;
  try {
    const date = new Date(timeStr);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date;
  } catch (e) {
    return null;
  }
}

function findTafForecastForTime(decodedTaf, targetTime) {
  if (!decodedTaf || !decodedTaf.forecast || !targetTime) return null;

  const targetDate = typeof targetTime === 'string' ? new Date(targetTime) : targetTime;
  const targetTs = targetDate.getTime();

  let bestMatch = null;

  for (const forecast of decodedTaf.forecast) {
    if (!forecast.period) continue;

    const fromTs = forecast.period.from?.timestamp ? new Date(forecast.period.from.timestamp).getTime() : null;
    const toTs = forecast.period.to?.timestamp ? new Date(forecast.period.to.timestamp).getTime() : null;

    if (fromTs != null && toTs != null && targetTs >= fromTs && targetTs <= toTs) {
      return forecast;
    }

    if (fromTs != null && targetTs >= fromTs) {
      if (!bestMatch || fromTs > (bestMatch.period?.from?.timestamp ? new Date(bestMatch.period.from.timestamp).getTime() : 0)) {
        bestMatch = forecast;
      }
    }
  }

  return bestMatch;
}

async function getAirportWeatherData(airportCode, targetTime, airportType, runwayHeadings = []) {
  const result = {
    airport: airportCode,
    airportType,
    airportInfo: findAirport(airportCode),
    metar: null,
    taf: null,
    tafForecastForTarget: null,
    crosswind: null,
    riskAssessment: null
  };

  let metarReport;
  if (targetTime) {
    metarReport = getReportByTimeAndType(airportCode, targetTime.toISOString(), 'METAR');
  }
  if (!metarReport) {
    metarReport = getLatestReport(airportCode, 'METAR');
  }

  if (metarReport) {
    result.metar = {
      id: metarReport.id,
      raw: metarReport.raw,
      observationTime: metarReport.decoded?.observationTime?.text || metarReport.observation_time,
      observationTimestamp: metarReport.decoded?.observationTime?.timestamp || metarReport.observation_time,
      decoded: metarReport.decoded
    };
  }

  let tafReport;
  if (targetTime) {
    tafReport = getReportByTimeAndType(airportCode, targetTime.toISOString(), 'TAF');
  }
  if (!tafReport) {
    tafReport = getLatestReport(airportCode, 'TAF');
  }

  if (tafReport) {
    let decodedTaf = tafReport.decoded;
    if (!decodedTaf && tafReport.raw) {
      decodedTaf = decodeTAF(tafReport.raw);
    }

    result.taf = {
      id: tafReport.id,
      raw: tafReport.raw,
      issueTime: decodedTaf?.issueTime?.text || tafReport.observation_time,
      issueTimestamp: decodedTaf?.issueTime?.timestamp || tafReport.observation_time,
      validPeriod: decodedTaf?.validPeriod?.text || null,
      decoded: decodedTaf
    };

    if (targetTime && decodedTaf) {
      result.tafForecastForTarget = findTafForecastForTime(decodedTaf, targetTime);
    }
  }

  const decodedForCrosswind = result.metar?.decoded || (result.tafForecastForTarget?.elements || result.taf?.decoded);
  if (decodedForCrosswind) {
    result.crosswind = calculateAirportCrosswinds(decodedForCrosswind, runwayHeadings);
  }

  result.riskAssessment = assessAirportRisk(
    result.metar?.decoded,
    result.taf?.decoded,
    airportCode,
    airportType,
    result.crosswind
  );

  return result;
}

async function getEnrouteWeather(waypoints, targetTime) {
  const results = [];

  if (!waypoints || waypoints.length === 0) {
    return results;
  }

  for (const waypoint of waypoints) {
    const wpData = await getAirportWeatherData(waypoint, targetTime, '航路点');
    results.push(wpData);
  }

  return results;
}

async function generateBriefing(routeId, departureTimeStr, options = {}) {
  const route = getRouteById(routeId);
  if (!route) {
    return {
      success: false,
      error: `未找到 ID 为 ${routeId} 的航线`
    };
  }

  const departureTime = parseUTCTime(departureTimeStr);
  if (!departureTime) {
    return {
      success: false,
      error: '无效的计划起飞时间，请使用 ISO 8601 格式（如 2026-06-06T12:00:00Z）'
    };
  }

  const arrivalTime = new Date(departureTime.getTime() + (route.flight_duration || 0) * 60 * 1000);

  const departureData = await getAirportWeatherData(
    route.departure_airport,
    departureTime,
    '起飞',
    options.departureRunways || []
  );

  const arrivalData = await getAirportWeatherData(
    route.arrival_airport,
    arrivalTime,
    '降落',
    options.arrivalRunways || []
  );

  const enrouteData = await getEnrouteWeather(route.waypoints, departureTime);

  const briefing = {
    briefingId: null,
    generatedAt: new Date().toISOString(),
    route: {
      id: route.id,
      name: route.name,
      departureAirport: route.departure_airport,
      arrivalAirport: route.arrival_airport,
      waypoints: route.waypoints,
      cruiseAltitude: route.cruise_altitude,
      flightDurationMinutes: route.flight_duration
    },
    schedule: {
      plannedDepartureTime: departureTime.toISOString(),
      plannedDepartureTimeText: departureTime.toUTCString(),
      plannedArrivalTime: arrivalTime.toISOString(),
      plannedArrivalTimeText: arrivalTime.toUTCString()
    },
    departure: departureData,
    arrival: arrivalData,
    enroute: enrouteData,
    riskAssessment: null,
    alternateAirports: null
  };

  briefing.riskAssessment = assessBriefingRisk(briefing);

  if (!briefing.riskAssessment.arrivalOperable || briefing.arrival?.riskAssessment?.overallLevel === RISK_LEVELS.RED) {
    briefing.alternateAirports = await findAlternateAirports(
      route.arrival_airport,
      arrivalTime.toISOString(),
      options.alternateRadiusKm || 300,
      options.maxAlternates || 3
    );
  }

  const briefingId = saveBriefing(
    routeId,
    departureTime.toISOString(),
    briefing,
    briefing.riskAssessment.overallLevel
  );

  briefing.briefingId = briefingId;

  return {
    success: true,
    briefingId,
    briefing
  };
}

function getBriefing(briefingId) {
  const briefing = getBriefingById(briefingId);
  if (!briefing) {
    return {
      success: false,
      error: `未找到 ID 为 ${briefingId} 的简报`
    };
  }
  return {
    success: true,
    data: {
      id: briefing.id,
      routeId: briefing.route_id,
      departureTime: briefing.departure_time,
      riskLevel: briefing.risk_level,
      createdAt: briefing.created_at,
      briefing: briefing.briefing
    }
  };
}

function getRouteBriefings(routeId) {
  const route = getRouteById(routeId);
  if (!route) {
    return {
      success: false,
      error: `未找到 ID 为 ${routeId} 的航线`
    };
  }

  const briefings = getBriefingsByRoute(routeId);
  return {
    success: true,
    route: {
      id: route.id,
      name: route.name,
      departureAirport: route.departure_airport,
      arrivalAirport: route.arrival_airport
    },
    count: briefings.length,
    data: briefings.map(b => ({
      id: b.id,
      departureTime: b.departure_time,
      riskLevel: b.risk_level,
      createdAt: b.created_at,
      summary: b.briefing?.riskAssessment?.summary || null
    }))
  };
}

function compareBriefings(briefingId1, briefingId2) {
  const b1 = getBriefingById(briefingId1);
  const b2 = getBriefingById(briefingId2);

  if (!b1) {
    return { success: false, error: `未找到 ID 为 ${briefingId1} 的简报` };
  }
  if (!b2) {
    return { success: false, error: `未找到 ID 为 ${briefingId2} 的简报` };
  }

  const data1 = b1.briefing;
  const data2 = b2.briefing;

  if (!data1 || !data2) {
    return { success: false, error: '简报数据不完整，无法对比' };
  }

  if (data1.route?.id !== data2.route?.id) {
    return {
      success: false,
      error: '两份简报不属于同一条航线，无法对比'
    };
  }

  const changes = [];

  function compareField(path, fieldName, value1, value2, formatter = v => v) {
    if (value1 !== value2) {
      changes.push({
        path,
        fieldName,
        oldValue: value1 != null ? formatter(value1) : '无数据',
        newValue: value2 != null ? formatter(value2) : '无数据',
        change: `${fieldName} 从 "${value1 != null ? formatter(value1) : '无数据'}" 变为 "${value2 != null ? formatter(value2) : '无数据'}"`
      });
    }
  }

  compareField('schedule.departureTime', '计划起飞时间', data1.schedule?.plannedDepartureTime, data2.schedule?.plannedDepartureTime);

  function compareAirportSection(sectionKey, sectionName, airportCode) {
    const d1 = data1[sectionKey];
    const d2 = data2[sectionKey];

    if (!d1 || !d2) return;

    const prefix = `${sectionKey}`;

    const vis1 = d1.metar?.decoded?.visibility?.value;
    const vis2 = d2.metar?.decoded?.visibility?.value;
    compareField(`${prefix}.metar.visibility`, `${sectionName}能见度`, vis1, vis2, v => `${v} 米`);

    const wind1 = d1.metar?.decoded?.wind?.text;
    const wind2 = d2.metar?.decoded?.wind?.text;
    compareField(`${prefix}.metar.wind`, `${sectionName}风`, wind1, wind2);

    const weather1 = d1.metar?.decoded?.weather?.map(w => w.text).join(', ') || '无';
    const weather2 = d2.metar?.decoded?.weather?.map(w => w.text).join(', ') || '无';
    compareField(`${prefix}.metar.weather`, `${sectionName}天气现象`, weather1, weather2);

    const clouds1 = d1.metar?.decoded?.clouds?.map(c => c.text).join(', ') || '无云';
    const clouds2 = d2.metar?.decoded?.clouds?.map(c => c.text).join(', ') || '无云';
    compareField(`${prefix}.metar.clouds`, `${sectionName}云组`, clouds1, clouds2);

    const risk1 = d1.riskAssessment?.overallLevel;
    const risk2 = d2.riskAssessment?.overallLevel;
    compareField(`${prefix}.risk`, `${sectionName}风险等级`, risk1, risk2, v => v === 'green' ? '绿色正常' : v === 'yellow' ? '黄色警告' : '红色禁飞');

    const xwind1 = d1.crosswind?.maxCrosswindKt;
    const xwind2 = d2.crosswind?.maxCrosswindKt;
    compareField(`${prefix}.crosswind`, `${sectionName}最大侧风`, xwind1, xwind2, v => `${v} 节`);
  }

  compareAirportSection('departure', '起飞机场', data1.route?.departureAirport);
  compareAirportSection('arrival', '降落机场', data1.route?.arrivalAirport);

  compareField('overallRisk', '整体风险等级', data1.riskAssessment?.overallLevel, data2.riskAssessment?.overallLevel, v => v === 'green' ? '绿色正常' : v === 'yellow' ? '黄色警告' : '红色禁飞');

  compareField('canFly', '是否可飞行', data1.riskAssessment?.canFly, data2.riskAssessment?.canFly, v => v ? '是' : '否');

  return {
    success: true,
    route: {
      id: data1.route?.id,
      name: data1.route?.name
    },
    briefing1: {
      id: b1.id,
      createdAt: b1.created_at,
      departureTime: b1.departure_time,
      riskLevel: b1.risk_level
    },
    briefing2: {
      id: b2.id,
      createdAt: b2.created_at,
      departureTime: b2.departure_time,
      riskLevel: b2.risk_level
    },
    changes,
    changeCount: changes.length,
    hasChanges: changes.length > 0,
    summary: changes.length > 0
      ? `两份简报共有 ${changes.length} 处差异`
      : '两份简报关键字段无差异'
  };
}

module.exports = {
  generateBriefing,
  getBriefing,
  getRouteBriefings,
  compareBriefings,
  parseUTCTime,
  findTafForecastForTime
};
