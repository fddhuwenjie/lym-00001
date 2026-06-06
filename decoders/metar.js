const { weatherPhenomena, cloudTypes, trendTypes } = require('../data/weather_codes');

function parseTemperature(tempStr) {
  if (!tempStr) return null;
  const isNegative = tempStr.startsWith('M');
  const value = parseInt(tempStr.replace('M', '-'), 10);
  return {
    raw: tempStr,
    value: isNegative ? -Math.abs(value) : value,
    unit: 'C',
    text: `${isNegative ? -Math.abs(value) : value}°C`
  };
}

function parseWind(windStr) {
  if (!windStr || windStr === '/////KT' || windStr === 'VRB' || windStr === '///KT') return null;
  
  if (windStr.startsWith('VRB')) {
    const match = windStr.match(/VRB(\d{2,3})(KT|MPS|KMH)/);
    if (match) {
      return {
        raw: windStr,
        direction: { value: null, text: '风向多变' },
        speed: { value: parseInt(match[1], 10), unit: match[2], text: `${match[1]} ${match[2]}` },
        gust: null,
        text: `风向多变，风速 ${match[1]} ${match[2]}`
      };
    }
    return null;
  }

  const match = windStr.match(/^(\d{3})(\d{2,3})(G(\d{2,3}))?(KT|MPS|KMH)$/);
  if (!match) return null;

  const dir = parseInt(match[1], 10);
  const speed = parseInt(match[2], 10);
  const gust = match[4] ? parseInt(match[4], 10) : null;
  const unit = match[5];

  let dirText = '';
  if (dir === 0) dirText = '无风';
  else if (dir <= 10 || dir >= 350) dirText = '北风';
  else if (dir <= 80) dirText = '东北风';
  else if (dir <= 100) dirText = '东风';
  else if (dir <= 170) dirText = '东南风';
  else if (dir <= 190) dirText = '南风';
  else if (dir <= 260) dirText = '西南风';
  else if (dir <= 280) dirText = '西风';
  else if (dir <= 350) dirText = '西北风';

  return {
    raw: windStr,
    direction: { value: dir, text: `${dir}° ${dirText}` },
    speed: { value: speed, unit, text: `${speed} ${unit}` },
    gust: gust ? { value: gust, unit, text: `${gust} ${unit}` } : null,
    text: `${dir}°${dirText}，风速 ${speed} ${unit}${gust ? `，阵风 ${gust} ${unit}` : ''}`
  };
}

function parseVisibility(visStr) {
  if (!visStr) return null;

  if (visStr === 'CAVOK') {
    return {
      raw: visStr,
      value: 10000,
      unit: 'M',
      cavok: true,
      text: '能见度大于10公里，无重要天气现象'
    };
  }

  if (visStr === '////') return null;

  const metricMatch = visStr.match(/^(\d{4})$|^(\d+)M$/);
  if (metricMatch) {
    const value = parseInt(metricMatch[1] || metricMatch[2], 10);
    let text = '';
    if (value >= 1000) text = `${(value / 1000).toFixed(1)} 公里`;
    else text = `${value} 米`;
    return {
      raw: visStr,
      value,
      unit: 'M',
      cavok: false,
      text
    };
  }

  const statuteMatch = visStr.match(/^(\d+)(\/(\d+))?SM$/);
  if (statuteMatch) {
    let value;
    if (statuteMatch[3]) {
      value = parseInt(statuteMatch[1], 10) / parseInt(statuteMatch[3], 10);
    } else {
      value = parseInt(statuteMatch[1], 10);
    }
    return {
      raw: visStr,
      value: Math.round(value * 1609.34),
      unit: 'SM',
      displayValue: statuteMatch[3] ? `${statuteMatch[1]}/${statuteMatch[3]}` : statuteMatch[1],
      cavok: false,
      text: `${statuteMatch[3] ? statuteMatch[1] + '/' + statuteMatch[3] : statuteMatch[1]} 英里`
    };
  }

  return null;
}

function parseRVR(rvrStr) {
  if (!rvrStr) return null;
  const match = rvrStr.match(/^R(\d{2}[LCR]?)\/([MP])?(\d{4})([VU])?FT$/);
  if (!match) return null;

  const runway = match[1];
  const prefix = match[2];
  const value = parseInt(match[3], 10);
  const suffix = match[4];

  let text = `${runway}号跑道视程 `;
  if (prefix === 'M') text += '小于 ';
  else if (prefix === 'P') text += '大于 ';
  text += `${value} 英尺`;
  if (suffix === 'U') text += '，趋势上升';
  else if (suffix === 'D') text += '，趋势下降';
  else if (suffix === 'N') text += '，无变化';

  return {
    raw: rvrStr,
    runway,
    value: Math.round(value * 0.3048),
    unit: 'M',
    displayUnit: 'FT',
    displayValue: value,
    prefix: prefix || null,
    trend: suffix || null,
    text
  };
}

function parseWeather(weatherStr) {
  if (!weatherStr || weatherStr === 'NSW') return null;

  const weatherList = [];
  const parts = weatherStr.split(' ');

  for (const part of parts) {
    if (part === 'NSW' || part === '//') continue;

    let intensity = '';
    let descriptor = '';
    let phenomena = [];
    let remaining = part;

    if (remaining.startsWith('-')) {
      intensity = '-';
      remaining = remaining.slice(1);
    } else if (remaining.startsWith('+')) {
      intensity = '+';
      remaining = remaining.slice(1);
    } else if (remaining.startsWith('VC')) {
      intensity = 'VC';
      remaining = remaining.slice(2);
    }

    if (remaining.length >= 2) {
      const desc = remaining.slice(0, 2);
      if (weatherPhenomena.descriptors[desc]) {
        descriptor = desc;
        remaining = remaining.slice(2);
      }
    }

    for (let i = 0; i < remaining.length; i += 2) {
      const phenom = remaining.slice(i, i + 2);
      if (weatherPhenomena.phenomena[phenom]) {
        phenomena.push(phenom);
      }
    }

    if (phenomena.length > 0) {
      const textParts = [];
      if (intensity === 'VC') textParts.push('机场附近');
      else if (intensity === '-') textParts.push('小');
      else if (intensity === '+') textParts.push('强');

      if (descriptor) textParts.push(weatherPhenomena.descriptors[descriptor]);

      const phenomTexts = phenomena.map(p => weatherPhenomena.phenomena[p]);
      textParts.push(phenomTexts.join('、'));

      weatherList.push({
        raw: part,
        intensity: intensity || null,
        intensityText: weatherPhenomena.intensity[intensity] || '中',
        descriptor: descriptor || null,
        descriptorText: descriptor ? weatherPhenomena.descriptors[descriptor] : null,
        phenomena: phenomena.map(p => ({
          code: p,
          text: weatherPhenomena.phenomena[p]
        })),
        text: textParts.join('')
      });
    }
  }

  return weatherList.length > 0 ? weatherList : null;
}

function parseCloud(cloudStr) {
  if (!cloudStr) return null;

  if (cloudStr === 'NSC' || cloudStr === 'NCD' || cloudStr === 'SKC' || cloudStr === 'CLR') {
    return {
      raw: cloudStr,
      type: cloudStr,
      amount: null,
      height: null,
      cloudType: null,
      text: cloudTypes[cloudStr] || '无云'
    };
  }

  const match = cloudStr.match(/^(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU)?$/);
  if (!match) return null;

  const amount = match[1];
  const height = parseInt(match[2], 10) * 100;
  const cloudType = match[3] || null;

  const heightText = height >= 1000 ? `${(height / 1000).toFixed(1)} 千米` : `${height} 英尺`;
  let text = `${cloudTypes[amount]}，${heightText}`;
  if (cloudType) text += `，${cloudTypes[cloudType]}`;

  return {
    raw: cloudStr,
    type: 'cloud',
    amount,
    amountText: cloudTypes[amount],
    height: {
      value: height,
      unit: 'FT',
      meters: Math.round(height * 0.3048),
      text: heightText
    },
    cloudType: cloudType ? { code: cloudType, text: cloudTypes[cloudType] } : null,
    text
  };
}

function parsePressure(pressStr) {
  if (!pressStr || pressStr === 'Q////') return null;

  const qnhMatch = pressStr.match(/^Q(\d{4})$/);
  if (qnhMatch) {
    const value = parseInt(qnhMatch[1], 10);
    return {
      raw: pressStr,
      value,
      unit: 'HPA',
      text: `${value} 百帕`
    };
  }

  const altMatch = pressStr.match(/^A(\d{4})$/);
  if (altMatch) {
    const value = parseInt(altMatch[1], 10) / 100;
    return {
      raw: pressStr,
      value: Math.round(value * 33.86389),
      unit: 'HPA',
      displayValue: value,
      displayUnit: 'INHG',
      text: `${value.toFixed(2)} 英寸汞柱`
    };
  }

  return null;
}

function parseTime(timeStr, referenceDate = new Date()) {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const hour = parseInt(match[2], 10);
  const minute = parseInt(match[3], 10);

  const date = new Date(referenceDate);
  date.setUTCDate(day);
  date.setUTCHours(hour, minute, 0, 0);

  if (date > referenceDate && date.getUTCDate() !== day) {
    date.setUTCMonth(date.getUTCMonth() - 1);
  }

  return {
    raw: timeStr,
    day,
    hour,
    minute,
    timestamp: date.toISOString(),
    text: `${day}日 ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} UTC`
  };
}

function parseTrendPeriod(periodStr) {
  if (!periodStr) return null;

  const fmMatch = periodStr.match(/^FM(\d{2})(\d{2})$/);
  if (fmMatch) {
    return {
      raw: periodStr,
      type: 'FM',
      from: {
        hour: parseInt(fmMatch[1], 10),
        minute: parseInt(fmMatch[2], 10),
        text: `从 ${fmMatch[1]}:${fmMatch[2]} UTC`
      },
      to: null,
      text: `从 ${fmMatch[1]}:${fmMatch[2]} UTC 起`
    };
  }

  const tlMatch = periodStr.match(/^TL(\d{2})(\d{2})$/);
  if (tlMatch) {
    return {
      raw: periodStr,
      type: 'TL',
      from: null,
      to: {
        hour: parseInt(tlMatch[1], 10),
        minute: parseInt(tlMatch[2], 10),
        text: `到 ${tlMatch[1]}:${tlMatch[2]} UTC`
      },
      text: `到 ${tlMatch[1]}:${tlMatch[2]} UTC 止`
    };
  }

  const atMatch = periodStr.match(/^AT(\d{2})(\d{2})$/);
  if (atMatch) {
    return {
      raw: periodStr,
      type: 'AT',
      from: {
        hour: parseInt(atMatch[1], 10),
        minute: parseInt(atMatch[2], 10),
        text: `在 ${atMatch[1]}:${atMatch[2]} UTC`
      },
      to: null,
      text: `在 ${atMatch[1]}:${atMatch[2]} UTC`
    };
  }

  const periodMatch = periodStr.match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/);
  if (periodMatch) {
    return {
      raw: periodStr,
      type: 'PERIOD',
      from: {
        day: parseInt(periodMatch[1], 10),
        hour: parseInt(periodMatch[2], 10),
        text: `${periodMatch[1]}日 ${periodMatch[2]}:00 UTC`
      },
      to: {
        day: parseInt(periodMatch[3], 10),
        hour: parseInt(periodMatch[4], 10),
        text: `${periodMatch[3]}日 ${periodMatch[4]}:00 UTC`
      },
      text: `${periodMatch[1]}日 ${periodMatch[2]}:00 至 ${periodMatch[3]}日 ${periodMatch[4]}:00 UTC`
    };
  }

  return null;
}

function parseTrend(trendStr) {
  if (!trendStr || trendStr === 'NOSIG') {
    return trendStr === 'NOSIG' ? {
      type: 'NOSIG',
      typeText: '无显著变化',
      period: null,
      wind: null,
      visibility: null,
      weather: null,
      clouds: null,
      text: '预计未来2小时无显著变化'
    } : null;
  }

  const tokens = trendStr.trim().split(/\s+/);
  if (tokens.length === 0) return null;

  const result = {
    type: null,
    typeText: null,
    probability: null,
    period: null,
    wind: null,
    visibility: null,
    weather: null,
    clouds: [],
    raw: trendStr
  };

  let i = 0;

  if (tokens[i].startsWith('PROB')) {
    result.type = 'PROB';
    result.probability = parseInt(tokens[i].replace('PROB', ''), 10);
    result.typeText = `概率${result.probability}%`;
    i++;
  } else if (trendTypes[tokens[i]]) {
    result.type = tokens[i];
    result.typeText = trendTypes[tokens[i]];
    i++;
  } else {
    result.type = 'TREND';
    result.typeText = '变化趋势';
  }

  if (tokens[i] && (tokens[i].startsWith('FM') || tokens[i].startsWith('TL') || tokens[i].startsWith('AT') || /^\d{4}\/\d{4}$/.test(tokens[i]))) {
    result.period = parseTrendPeriod(tokens[i]);
    i++;
  } else if (tokens[i] && tokens[i + 1] && /^\d{4}\/\d{4}$/.test(tokens[i] + tokens[i + 1])) {
    result.period = parseTrendPeriod(tokens[i] + '/' + tokens[i + 1]);
    i += 2;
  }

  for (; i < tokens.length; i++) {
    const token = tokens[i];

    if (!result.wind && /^(\d{3}|VRB)\d{2,3}(G\d{2,3})?(KT|MPS|KMH)$/.test(token)) {
      result.wind = parseWind(token);
      continue;
    }

    if (!result.visibility && (token === 'CAVOK' || /^(\d{4}|(\d+\/)?\d+SM)$/.test(token))) {
      result.visibility = parseVisibility(token);
      continue;
    }

    if (!result.weather && /^(-|\+|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?(DZ|RA|SN|SG|IC|PE|PL|GR|GS|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+$/.test(token)) {
      result.weather = parseWeather(token);
      continue;
    }

    if (/^(FEW|SCT|BKN|OVC|NSC|NCD|SKC|CLR)\d{0,3}(CB|TCU)?$/.test(token)) {
      const cloud = parseCloud(token);
      if (cloud) result.clouds.push(cloud);
      continue;
    }
  }

  return result;
}

function decodeMETAR(raw) {
  if (!raw || typeof raw !== 'string') {
    return { success: false, error: '无效的电报输入' };
  }

  const cleaned = raw.trim().replace(/\s+/g, ' ');
  const tokens = cleaned.split(' ');
  
  if (tokens.length < 3) {
    return { success: false, error: '电报格式不完整' };
  }

  const result = {
    success: true,
    raw: cleaned,
    type: null,
    correction: false,
    automatic: false,
    header: {},
    airport: null,
    observationTime: null,
    wind: null,
    visibility: null,
    rvr: [],
    weather: [],
    clouds: [],
    temperature: null,
    dewPoint: null,
    pressure: null,
    recentWeather: null,
    windShear: null,
    trends: [],
    remarks: null
  };

  let idx = 0;

  if (tokens[idx] === 'METAR' || tokens[idx] === 'SPECI') {
    result.type = tokens[idx];
    result.header.type = tokens[idx];
    idx++;
  } else {
    result.type = 'METAR';
    result.header.type = 'METAR';
  }

  if (tokens[idx] === 'COR' || tokens[idx] === 'AMD') {
    result.correction = true;
    result.header.correction = tokens[idx];
    idx++;
  }

  if (tokens[idx] === 'AUTO') {
    result.automatic = true;
    result.header.automatic = true;
    idx++;
  }

  if (/^[A-Z]{4}$/.test(tokens[idx])) {
    result.airport = {
      code: tokens[idx],
      icao: tokens[idx]
    };
    result.header.airport = tokens[idx];
    idx++;
  }

  if (/^\d{6}Z$/.test(tokens[idx])) {
    result.observationTime = parseTime(tokens[idx]);
    result.header.time = tokens[idx];
    idx++;
  }

  for (; idx < tokens.length; idx++) {
    const token = tokens[idx];

    if (token === 'NIL') {
      result.nil = true;
      break;
    }

    if (token === 'AUTO') {
      result.automatic = true;
      continue;
    }

    if (token === 'COR' || token === 'AMD') {
      result.correction = true;
      continue;
    }

    if (!result.wind && /^(\d{3}|VRB)\d{2,3}(G\d{2,3})?(KT|MPS|KMH)$|^\/\/\/\/KT$|^\/\/\s*KT$/.test(token)) {
      result.wind = parseWind(token);
      continue;
    }

    if (!result.visibility && (token === 'CAVOK' || /^\d{4}$|^(\d+\/)?\d+SM$|^\/\/\/\/$/.test(token))) {
      result.visibility = parseVisibility(token);
      continue;
    }

    if (/^R\d{2}[LCR]?\/[MP]?\d{4}[VUDN]?FT$/.test(token)) {
      const rvr = parseRVR(token);
      if (rvr) result.rvr.push(rvr);
      continue;
    }

    if (/^(-|\+|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?(DZ|RA|SN|SG|IC|PE|PL|GR|GS|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS|UP)+$/.test(token) || token === 'NSW') {
      const weather = parseWeather(token);
      if (weather && weather.length > 0) {
        result.weather = result.weather.concat(weather);
      }
      continue;
    }

    if (/^(FEW|SCT|BKN|OVC|NSC|NCD|SKC|CLR)\d{0,3}(CB|TCU)?$/.test(token) || /^VV\d{3}$/.test(token)) {
      const cloud = parseCloud(token);
      if (cloud) result.clouds.push(cloud);
      continue;
    }

    if (/^M?\d{2}\/M?\d{2}$/.test(token)) {
      const [temp, dew] = token.split('/');
      result.temperature = parseTemperature(temp);
      result.dewPoint = parseTemperature(dew);
      continue;
    }

    if (!result.pressure && /^[QA]\d{4}$|^Q\/\/\/\/$/.test(token)) {
      result.pressure = parsePressure(token);
      continue;
    }

    if (token === 'RE' || token.startsWith('RE')) {
      result.recentWeather = parseWeather(token.replace('RE', ''));
      continue;
    }

    if (token === 'WS' || token.startsWith('WS')) {
      result.windShear = token;
      continue;
    }

    if (token === 'TEMPO' || token === 'BECMG' || token === 'NOSIG' || token === 'PROB30' || token === 'PROB40') {
      let trendTokens = [token];
      idx++;
      while (idx < tokens.length && !['TEMPO', 'BECMG', 'NOSIG', 'PROB30', 'PROB40', 'RMK'].includes(tokens[idx])) {
        trendTokens.push(tokens[idx]);
        idx++;
      }
      idx--;
      const trend = parseTrend(trendTokens.join(' '));
      if (trend) result.trends.push(trend);
      continue;
    }

    if (token === 'RMK') {
      result.remarks = tokens.slice(idx + 1).join(' ');
      break;
    }
  }

  if (result.visibility && result.visibility.cavok) {
    result.weather = [];
    result.clouds = [];
  }

  return result;
}

module.exports = {
  decodeMETAR,
  parseTemperature,
  parseWind,
  parseVisibility,
  parseRVR,
  parseWeather,
  parseCloud,
  parsePressure,
  parseTime,
  parseTrend,
  parseTrendPeriod
};
