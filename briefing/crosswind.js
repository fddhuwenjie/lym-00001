function convertToKnots(speed, unit) {
  if (!speed || !unit) return 0;
  switch (unit.toUpperCase()) {
    case 'KT':
      return speed;
    case 'MPS':
      return speed * 1.94384;
    case 'KMH':
      return speed * 0.539957;
    default:
      return speed;
  }
}

function calculateCrosswindComponents(runwayHeading, windDirection, windSpeed, windUnit = 'KT') {
  if (runwayHeading == null || windDirection == null || windSpeed == null) {
    return null;
  }

  const windSpeedKt = convertToKnots(windSpeed, windUnit);

  let windDir = windDirection;
  let rwyHdg = runwayHeading;

  if (rwyHdg < 100) {
    rwyHdg = rwyHdg * 10;
  }

  const angleDiff = ((windDir - rwyHdg + 360) % 360) * (Math.PI / 180);

  const headwindKt = windSpeedKt * Math.cos(angleDiff);
  const crosswindKt = windSpeedKt * Math.sin(angleDiff);

  const crosswindDirection = crosswindKt >= 0 ? 'right' : 'left';
  const headwindDirection = headwindKt >= 0 ? 'head' : 'tail';

  return {
    runwayHeading: rwyHdg,
    windDirection: windDir,
    windSpeed: {
      value: windSpeed,
      unit: windUnit,
      knots: Math.round(windSpeedKt * 10) / 10
    },
    angleDegrees: Math.round(((windDir - rwyHdg + 360) % 360) * 10) / 10,
    headwind: {
      value: Math.round(headwindKt * 10) / 10,
      unit: 'KT',
      direction: headwindDirection,
      text: `${Math.abs(Math.round(headwindKt * 10) / 10)} 节 ${headwindDirection === 'head' ? '逆风' : '顺风'}`
    },
    crosswind: {
      value: Math.round(Math.abs(crosswindKt) * 10) / 10,
      unit: 'KT',
      direction: crosswindDirection,
      text: `${Math.round(Math.abs(crosswindKt) * 10) / 10} 节 ${crosswindDirection === 'right' ? '右侧风' : '左侧风'}`
    },
    exceedsLimit: Math.abs(crosswindKt) > 25,
    limit: 25,
    text: `跑道 ${Math.round(rwyHdg / 10).toString().padStart(2, '0')}：${Math.abs(Math.round(headwindKt * 10) / 10)} 节${headwindDirection === 'head' ? '逆' : '顺'}风，${Math.round(Math.abs(crosswindKt) * 10) / 10} 节${crosswindDirection === 'right' ? '右' : '左'}侧风${Math.abs(crosswindKt) > 25 ? '（超过25节限制）' : ''}`
  };
}

function calculateAirportCrosswinds(decodedReport, runwayHeadings = []) {
  if (!decodedReport || !decodedReport.wind || !decodedReport.wind.direction || decodedReport.wind.direction.value == null) {
    return null;
  }

  const windDirection = decodedReport.wind.direction.value;
  const windSpeed = decodedReport.wind.speed?.value || 0;
  const windUnit = decodedReport.wind.speed?.unit || 'KT';

  const results = [];
  let isEstimated = false;

  for (const rwyHdg of runwayHeadings) {
    const calc = calculateCrosswindComponents(rwyHdg, windDirection, windSpeed, windUnit);
    if (calc) {
      results.push(calc);
    }
  }

  if (results.length === 0) {
    isEstimated = true;
    const estimatedRunways = new Set();

    const rwyOpposite = Math.round(((windDirection + 180) % 360) / 10) * 10;
    const rwySame = Math.round(windDirection / 10) * 10;

    estimatedRunways.add(rwyOpposite / 10);
    estimatedRunways.add(rwySame / 10);

    for (const offset of [-10, 10]) {
      const rwy = Math.round(((windDirection + 180 + offset + 360) % 360) / 10) * 10;
      estimatedRunways.add(rwy / 10);
    }

    const sortedRunways = Array.from(estimatedRunways).sort((a, b) => a - b);

    for (const rwyHdg of sortedRunways) {
      if (rwyHdg >= 1 && rwyHdg <= 36) {
        const calc = calculateCrosswindComponents(rwyHdg, windDirection, windSpeed, windUnit);
        if (calc) {
          calc.isEstimated = true;
          calc.runwayNote = '跑道方向为根据风向估算';
          results.push(calc);
        }
      }
    }
  }

  const maxCrosswind = results.length > 0
    ? results.reduce((max, r) => Math.max(max, r.crosswind.value), 0)
    : 0;

  return {
    airport: decodedReport.airport?.code || 'UNKNOWN',
    wind: decodedReport.wind.text || '',
    calculations: results,
    maxCrosswindKt: Math.round(maxCrosswind * 10) / 10,
    anyExceedsLimit: results.some(r => r.exceedsLimit),
    isEstimated,
    summary: results.length > 0
      ? `${isEstimated ? '【估算】' : ''}最大侧风 ${Math.round(maxCrosswind * 10) / 10} 节${results.some(r => r.exceedsLimit) ? '，存在超过25节限制的跑道' : ''}${isEstimated ? '（未提供真实跑道方向，侧风为根据风向估算值）' : ''}`
      : '无法计算侧风分量'
  };
}

module.exports = {
  calculateCrosswindComponents,
  calculateAirportCrosswinds,
  convertToKnots
};
