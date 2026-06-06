const { parseWind, parseVisibility, parseWeather, parseCloud, parseTime, parseTrendPeriod, parseTemperature } = require('./metar');
const { trendTypes } = require('../data/weather_codes');

function parseTAFPeriod(periodStr, referenceDate = new Date()) {
  if (!periodStr) return null;

  const match = periodStr.match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/);
  if (!match) return null;

  const fromDay = parseInt(match[1], 10);
  const fromHour = parseInt(match[2], 10);
  const toDay = parseInt(match[3], 10);
  const toHour = parseInt(match[4], 10);

  const fromDate = new Date(referenceDate);
  fromDate.setUTCDate(fromDay);
  fromDate.setUTCHours(fromHour, 0, 0, 0);

  const toDate = new Date(referenceDate);
  toDate.setUTCDate(toDay);
  toDate.setUTCHours(toHour, 0, 0, 0);

  let isCrossDay = false;
  if (toDate <= fromDate) {
    toDate.setUTCDate(toDate.getUTCDate() + 1);
    isCrossDay = true;
  } else if (toDay !== fromDay) {
    isCrossDay = true;
  }

  let fromText = `${fromDay}日 ${fromHour.toString().padStart(2, '0')}:00 UTC`;
  let toText = `${toDay}日 ${toHour.toString().padStart(2, '0')}:00 UTC`;

  if (isCrossDay && (toDay < fromDay || (toDay === fromDay && toHour <= fromHour))) {
    toText = `${toDay + 1}日 ${toHour.toString().padStart(2, '0')}:00 UTC（次日）`;
  } else if (isCrossDay) {
    toText = `${toDay}日 ${toHour.toString().padStart(2, '0')}:00 UTC（次日）`;
  }

  return {
    raw: periodStr,
    from: {
      day: fromDay,
      hour: fromHour,
      timestamp: fromDate.toISOString(),
      text: fromText
    },
    to: {
      day: toDay,
      hour: toHour,
      timestamp: toDate.toISOString(),
      text: toText
    },
    crossDay: isCrossDay,
    text: `${fromText} 至 ${toText}`
  };
}

function parseFMTime(fmStr, referenceDate = new Date()) {
  if (!fmStr) return null;

  const match = fmStr.match(/^FM(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const hour = parseInt(match[2], 10);
  const minute = parseInt(match[3], 10);

  const date = new Date(referenceDate);
  date.setUTCDate(day);
  date.setUTCHours(hour, minute, 0, 0);

  return {
    raw: fmStr,
    day,
    hour,
    minute,
    timestamp: date.toISOString(),
    text: `${day}日 ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} UTC`
  };
}

function parseForecastElements(tokens, startIdx, referenceDate) {
  const elements = {
    wind: null,
    visibility: null,
    weather: [],
    clouds: [],
    temperature: null,
    windShear: null,
    icing: null,
    turbulence: null
  };

  let i = startIdx;
  for (; i < tokens.length; i++) {
    const token = tokens[i];

    if (['BECMG', 'TEMPO', 'PROB30', 'PROB40', 'FM', 'TL', 'AT', 'RMK'].includes(token) || /^FM\d{6}$/.test(token)) {
      break;
    }

    if (/^(\d{3}|VRB)\d{2,3}(G\d{2,3})?(KT|MPS|KMH)$/.test(token)) {
      elements.wind = parseWind(token);
      continue;
    }

    if (token === 'CAVOK' || /^\d{4}$|^(\d+\/)?\d+SM$|^\/\/\/\/$|^P\d{4}$|^M\d{4}$/.test(token)) {
      elements.visibility = parseVisibility(token);
      continue;
    }

    if (/^(-|\+|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?(DZ|RA|SN|SG|IC|PE|PL|GR|GS|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS|UP)+$/.test(token) || token === 'NSW') {
      const weather = parseWeather(token);
      if (weather && weather.length > 0) {
        elements.weather = elements.weather.concat(weather);
      }
      continue;
    }

    if (/^(FEW|SCT|BKN|OVC|NSC|NCD|SKC|CLR)\d{0,3}(CB|TCU)?$/.test(token) || /^VV\d{3}$/.test(token)) {
      const cloud = parseCloud(token);
      if (cloud) elements.clouds.push(cloud);
      continue;
    }

    if (/^TX(M?\d{2})\/(\d{4})Z?$/.test(token)) {
      const match = token.match(/^TX(M?\d{2})\/(\d{4})Z?$/);
      elements.maxTemperature = {
        value: parseTemperature(match[1]),
        time: {
          day: parseInt(match[2].slice(0, 2), 10),
          hour: parseInt(match[2].slice(2, 4), 10),
          text: `${match[2].slice(0, 2)}日 ${match[2].slice(2, 4)}:00 UTC`
        }
      };
      continue;
    }

    if (/^TN(M?\d{2})\/(\d{4})Z?$/.test(token)) {
      const match = token.match(/^TN(M?\d{2})\/(\d{4})Z?$/);
      elements.minTemperature = {
        value: parseTemperature(match[1]),
        time: {
          day: parseInt(match[2].slice(0, 2), 10),
          hour: parseInt(match[2].slice(2, 4), 10),
          text: `${match[2].slice(0, 2)}日 ${match[2].slice(2, 4)}:00 UTC`
        }
      };
      continue;
    }

    if (token.startsWith('WS')) {
      elements.windShear = token;
      continue;
    }

    if (token.startsWith('6')) {
      elements.icing = token;
      continue;
    }

    if (token.startsWith('5')) {
      elements.turbulence = token;
      continue;
    }
  }

  return { elements, nextIdx: i };
}

function decodeTAF(raw) {
  if (!raw || typeof raw !== 'string') {
    return { success: false, error: '无效的电报输入' };
  }

  const cleaned = raw.trim().replace(/\s+/g, ' ');
  const tokens = cleaned.split(' ');
  
  if (tokens.length < 4) {
    return { success: false, error: 'TAF 电报格式不完整' };
  }

  const now = new Date();

  const result = {
    success: true,
    raw: cleaned,
    type: 'TAF',
    amendment: false,
    correction: false,
    header: {},
    airport: null,
    issueTime: null,
    validPeriod: null,
    mainForecast: null,
    changeGroups: [],
    remarks: null
  };

  let idx = 0;

  if (tokens[idx] === 'TAF') {
    idx++;
  }

  if (tokens[idx] === 'AMD' || tokens[idx] === 'RTD') {
    result.amendment = true;
    result.header.amendment = tokens[idx];
    idx++;
  }

  if (tokens[idx] === 'COR') {
    result.correction = true;
    result.header.correction = tokens[idx];
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
    result.issueTime = parseTime(tokens[idx], now);
    result.header.issueTime = tokens[idx];
    idx++;
  }

  if (/^\d{4}\/\d{4}$/.test(tokens[idx])) {
    result.validPeriod = parseTAFPeriod(tokens[idx], now);
    result.header.validPeriod = tokens[idx];
    idx++;
  }

  const { elements, nextIdx } = parseForecastElements(tokens, idx, now);
  result.mainForecast = {
    type: 'MAIN',
    typeText: '主预报段',
    period: result.validPeriod,
    ...elements
  };
  idx = nextIdx;

  while (idx < tokens.length) {
    const token = tokens[idx];

    if (token === 'RMK') {
      result.remarks = tokens.slice(idx + 1).join(' ');
      break;
    }

    let changeGroup = {
      type: null,
      typeText: null,
      probability: null,
      period: null,
      fmTime: null,
      wind: null,
      visibility: null,
      weather: [],
      clouds: [],
      raw: ''
    };

    let rawTokens = [];

    if (token === 'BECMG' || token === 'TEMPO') {
      changeGroup.type = token;
      changeGroup.typeText = trendTypes[token];
      rawTokens.push(token);
      idx++;

      if (tokens[idx] && /^\d{4}\/\d{4}$/.test(tokens[idx])) {
        changeGroup.period = parseTAFPeriod(tokens[idx], now);
        rawTokens.push(tokens[idx]);
        idx++;
      }
    } else if (token === 'PROB30' || token === 'PROB40') {
      changeGroup.type = 'PROB';
      changeGroup.probability = parseInt(token.replace('PROB', ''), 10);
      changeGroup.typeText = `概率${changeGroup.probability}%`;
      rawTokens.push(token);
      idx++;

      if (tokens[idx] && /^\d{4}\/\d{4}$/.test(tokens[idx])) {
        changeGroup.period = parseTAFPeriod(tokens[idx], now);
        rawTokens.push(tokens[idx]);
        idx++;
      }

      if (tokens[idx] === 'TEMPO') {
        changeGroup.subType = 'TEMPO';
        changeGroup.typeText += ' 短时变化';
        rawTokens.push(tokens[idx]);
        idx++;
      }
    } else if (/^FM\d{6}$/.test(token)) {
      changeGroup.type = 'FM';
      changeGroup.typeText = '从某时起';
      changeGroup.fmTime = parseFMTime(token, now);
      rawTokens.push(token);
      idx++;

      const periodTokens = [];
      while (idx < tokens.length && /^TL\d{4}$/.test(tokens[idx])) {
        periodTokens.push(tokens[idx]);
        idx++;
      }
    } else {
      idx++;
      continue;
    }

    const { elements: changeElements, nextIdx: changeNextIdx } = parseForecastElements(tokens, idx, now);
    Object.assign(changeGroup, changeElements);
    
    for (let j = idx; j < changeNextIdx; j++) {
      rawTokens.push(tokens[j]);
    }
    changeGroup.raw = rawTokens.join(' ');
    
    idx = changeNextIdx;

    result.changeGroups.push(changeGroup);
  }

  return result;
}

module.exports = {
  decodeTAF,
  parseTAFPeriod,
  parseFMTime,
  parseForecastElements
};
