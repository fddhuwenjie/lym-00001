const { decodeMETAR } = require('../decoders/metar');
const { decodeTAF } = require('../decoders/taf');

function detectType(raw) {
  if (!raw || typeof raw !== 'string') return 'UNKNOWN';
  
  const upper = raw.trim().toUpperCase();
  if (upper.startsWith('TAF')) return 'TAF';
  if (upper.startsWith('METAR') || upper.startsWith('SPECI')) return 'METAR';
  
  if (/^[A-Z]{4}\s+\d{6}Z\s+/.test(upper)) {
    if (/^\d{4}\/\d{4}\s+/.test(upper.split(' ').slice(2).join(' '))) {
      return 'TAF';
    }
    return 'METAR';
  }
  
  return 'UNKNOWN';
}

function validateMETAR(raw) {
  const errors = [];
  const warnings = [];
  const tokens = raw.trim().split(/\s+/);
  
  let idx = 0;
  let position = 0;

  if (!tokens || tokens.length < 3) {
    errors.push({
      type: 'FORMAT_ERROR',
      message: '电报格式不完整，至少需要包含电报类型、机场代码和观测时间',
      position: 0,
      token: null
    });
    return { valid: false, errors, warnings };
  }

  if (tokens[idx] === 'METAR' || tokens[idx] === 'SPECI') {
    idx++;
  } else if (!/^[A-Z]{4}$/.test(tokens[idx])) {
    errors.push({
      type: 'MISSING_TYPE',
      message: '缺少电报类型标识（METAR 或 SPECI），或电报格式不正确',
      position: position,
      token: tokens[idx]
    });
  }

  if (tokens[idx] === 'COR' || tokens[idx] === 'AMD') {
    idx++;
    position++;
  }

  if (tokens[idx] === 'AUTO') {
    idx++;
    position++;
  }

  if (!/^[A-Z]{4}$/.test(tokens[idx])) {
    errors.push({
      type: 'INVALID_AIRPORT',
      message: `无效的机场代码：${tokens[idx]}，应为 4 位大写字母 ICAO 代码`,
      position: idx,
      token: tokens[idx]
    });
  }
  idx++;
  position++;

  if (!/^\d{6}Z$/.test(tokens[idx])) {
    errors.push({
      type: 'INVALID_TIME',
      message: `无效的观测时间：${tokens[idx]}，格式应为 DDHHMMZ（日时分Z）`,
      position: idx,
      token: tokens[idx]
    });
  }
  idx++;
  position++;

  if (tokens[idx] === 'NIL') {
    return { valid: errors.length === 0, errors, warnings };
  }

  let foundWind = false;
  let foundVisibility = false;
  let foundTempDew = false;
  let foundPressure = false;

  for (; idx < tokens.length; idx++) {
    const token = tokens[idx];
    
    if (!foundWind && /^(\d{3}|VRB)\d{2,3}(G\d{2,3})?(KT|MPS|KMH)$|^\/\/\/\/KT$/.test(token)) {
      foundWind = true;
      
      const windMatch = token.match(/^(\d{3})(\d{2,3})(G\d{2,3})?(KT|MPS|KMH)$/);
      if (windMatch) {
        const dir = parseInt(windMatch[1], 10);
        if (dir > 360) {
          errors.push({
            type: 'INVALID_WIND_DIRECTION',
            message: `无效的风向：${dir}°，风向范围应为 000-360`,
            position: idx,
            token: token
          });
        }
      }
      continue;
    }

    if (!foundVisibility && (token === 'CAVOK' || /^\d{4}$|^(\d+\/)?\d+SM$/.test(token))) {
      foundVisibility = true;
      
      if (/^\d{4}$/.test(token)) {
        const vis = parseInt(token, 10);
        if (vis > 9999) {
          errors.push({
            type: 'INVALID_VISIBILITY',
            message: `无效的能见度：${token}米，能见度范围应为 0000-9999 米`,
            position: idx,
            token: token
          });
        }
      }
      continue;
    }

    if (/^R\d{2}[LCR]?\/[MP]?\d{4}[VUDN]?FT$/.test(token)) {
      const rvrMatch = token.match(/^R(\d{2}[LCR]?)\/([MP])?(\d{4})([VUDN])?FT$/);
      if (rvrMatch) {
        const rwy = rvrMatch[1];
        const rwyNum = parseInt(rwy.slice(0, 2), 10);
        if (rwyNum < 1 || rwyNum > 36) {
          errors.push({
            type: 'INVALID_RUNWAY',
            message: `无效的跑道号：${rwy}，跑道号范围应为 01-36`,
            position: idx,
            token: token
          });
        }
      }
      continue;
    }

    if (/^M?\d{2}\/M?\d{2}$/.test(token)) {
      foundTempDew = true;
      const [temp, dew] = token.split('/');
      
      const parseVal = (s) => s.startsWith('M') ? -parseInt(s.slice(1), 10) : parseInt(s, 10);
      const tempVal = parseVal(temp);
      const dewVal = parseVal(dew);
      
      if (tempVal > 60 || tempVal < -80) {
        errors.push({
          type: 'INVALID_TEMPERATURE',
          message: `无效的温度：${tempVal}°C，温度范围应为 -80°C 至 60°C`,
          position: idx,
          token: token
        });
      }
      
      if (dewVal > tempVal) {
        warnings.push({
          type: 'DEW_POINT_HIGH',
          message: `露点温度(${dewVal}°C)高于气温(${tempVal}°C)，数据可能有误`,
          position: idx,
          token: token
        });
      }
      continue;
    }

    if (!foundPressure && /^[QA]\d{4}$/.test(token)) {
      foundPressure = true;
      
      const pressMatch = token.match(/^([QA])(\d{4})$/);
      if (pressMatch) {
        const value = parseInt(pressMatch[2], 10);
        if (pressMatch[1] === 'Q' && (value < 900 || value > 1050)) {
          warnings.push({
            type: 'PRESSURE_OUT_OF_RANGE',
            message: `气压值 ${value} HPa 超出正常范围(900-1050 HPa)`,
            position: idx,
            token: token
          });
        }
        if (pressMatch[1] === 'A' && (value < 2600 || value > 3200)) {
          warnings.push({
            type: 'PRESSURE_OUT_OF_RANGE',
            message: `气压值 ${value / 100} inHg 超出正常范围(26.00-32.00 inHg)`,
            position: idx,
            token: token
          });
        }
      }
      continue;
    }

    if (token === 'TEMPO' || token === 'BECMG' || token === 'NOSIG' || token === 'PROB30' || token === 'PROB40') {
      const trendType = token;
      idx++;
      
      if (trendType !== 'NOSIG' && idx < tokens.length && /^\d{4}\/\d{4}$/.test(tokens[idx])) {
        const periodMatch = tokens[idx].match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/);
        if (periodMatch) {
          const fromDay = parseInt(periodMatch[1], 10);
          const toDay = parseInt(periodMatch[3], 10);
          if (fromDay < 1 || fromDay > 31 || toDay < 1 || toDay > 31) {
            errors.push({
              type: 'INVALID_PERIOD',
              message: `无效的日期：${tokens[idx]}，日期范围应为 01-31`,
              position: idx,
              token: tokens[idx]
            });
          }
        }
        idx++;
      }
      
      while (idx < tokens.length && !['TEMPO', 'BECMG', 'NOSIG', 'PROB30', 'PROB40', 'RMK'].includes(tokens[idx])) {
        idx++;
      }
      idx--;
      continue;
    }

    if (token === 'RMK') {
      break;
    }
  }

  if (!foundWind) {
    warnings.push({
      type: 'MISSING_WIND',
      message: '未找到风组信息',
      position: null,
      token: null
    });
  }

  if (!foundVisibility) {
    warnings.push({
      type: 'MISSING_VISIBILITY',
      message: '未找到能见度信息',
      position: null,
      token: null
    });
  }

  if (!foundTempDew) {
    warnings.push({
      type: 'MISSING_TEMPERATURE',
      message: '未找到温度/露点信息',
      position: null,
      token: null
    });
  }

  if (!foundPressure) {
    warnings.push({
      type: 'MISSING_PRESSURE',
      message: '未找到气压信息',
      position: null,
      token: null
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function validateTAF(raw) {
  const errors = [];
  const warnings = [];
  const tokens = raw.trim().split(/\s+/);
  
  let idx = 0;

  if (!tokens || tokens.length < 4) {
    errors.push({
      type: 'FORMAT_ERROR',
      message: 'TAF 电报格式不完整',
      position: 0,
      token: null
    });
    return { valid: false, errors, warnings };
  }

  if (tokens[idx] === 'TAF') {
    idx++;
  } else {
    errors.push({
      type: 'MISSING_TYPE',
      message: '缺少 TAF 类型标识',
      position: 0,
      token: tokens[idx]
    });
  }

  if (tokens[idx] === 'AMD' || tokens[idx] === 'RTD' || tokens[idx] === 'COR') {
    idx++;
  }

  if (!/^[A-Z]{4}$/.test(tokens[idx])) {
    errors.push({
      type: 'INVALID_AIRPORT',
      message: `无效的机场代码：${tokens[idx]}`,
      position: idx,
      token: tokens[idx]
    });
  }
  idx++;

  if (!/^\d{6}Z$/.test(tokens[idx])) {
    errors.push({
      type: 'INVALID_TIME',
      message: `无效的发布时间：${tokens[idx]}`,
      position: idx,
      token: tokens[idx]
    });
  }
  idx++;

  if (!/^\d{4}\/\d{4}$/.test(tokens[idx])) {
    errors.push({
      type: 'INVALID_VALID_PERIOD',
      message: `无效的有效时段：${tokens[idx]}`,
      position: idx,
      token: tokens[idx]
    });
  } else {
    const periodMatch = tokens[idx].match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/);
    if (periodMatch) {
      const fromDay = parseInt(periodMatch[1], 10);
      const toDay = parseInt(periodMatch[3], 10);
      if (fromDay < 1 || fromDay > 31 || toDay < 1 || toDay > 31) {
        errors.push({
          type: 'INVALID_PERIOD_DAY',
          message: `日期超出有效范围：${tokens[idx]}`,
          position: idx,
          token: tokens[idx]
        });
      }
    }
  }
  idx++;

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function validateSingle(raw) {
  if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
    return {
      valid: false,
      type: 'UNKNOWN',
      errors: [{
        type: 'EMPTY_INPUT',
        message: '输入为空或无效',
        position: 0,
        token: null
      }],
      warnings: []
    };
  }

  const cleaned = raw.trim().replace(/\s+/g, ' ');
  const type = detectType(cleaned);

  let result;
  if (type === 'METAR') {
    result = validateMETAR(cleaned);
  } else if (type === 'TAF') {
    result = validateTAF(cleaned);
  } else {
    result = {
      valid: false,
      errors: [{
        type: 'UNKNOWN_TYPE',
        message: '无法识别电报类型，请确保是有效的 METAR/SPECI 或 TAF 格式',
        position: 0,
        token: cleaned.split(' ')[0]
      }],
      warnings: []
    };
  }

  return {
    valid: result.valid,
    type,
    raw: cleaned,
    errors: result.errors,
    warnings: result.warnings,
    errorCount: result.errors.length,
    warningCount: result.warnings.length
  };
}

function validateBatch(messages) {
  if (!Array.isArray(messages)) {
    return {
      success: false,
      error: '输入必须是数组格式'
    };
  }

  const results = messages.map((msg, index) => ({
    index,
    ...validateSingle(msg)
  }));

  const validCount = results.filter(r => r.valid).length;
  const invalidCount = results.filter(r => !r.valid).length;
  const totalErrors = results.reduce((sum, r) => sum + r.errorCount, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warningCount, 0);

  return {
    success: true,
    total: messages.length,
    valid: validCount,
    invalid: invalidCount,
    totalErrors,
    totalWarnings,
    results
  };
}

module.exports = {
  detectType,
  validateSingle,
  validateBatch,
  validateMETAR,
  validateTAF
};
