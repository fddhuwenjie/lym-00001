function encodeTemperature(value) {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'object' ? value.value : value;
  if (num === null || num === undefined) return null;
  if (num < 0) {
    return 'M' + Math.abs(num).toString().padStart(2, '0');
  }
  return num.toString().padStart(2, '0');
}

function encodeWind(wind) {
  if (!wind) return null;
  
  if (wind.direction && wind.direction.value === null) {
    const speed = wind.speed.value.toString().padStart(2, '0');
    const unit = wind.speed.unit || 'KT';
    return `VRB${speed}${unit}`;
  }

  const dir = wind.direction.value.toString().padStart(3, '0');
  const speed = wind.speed.value.toString().padStart(2, '0');
  const unit = wind.speed.unit || 'KT';
  const gust = wind.gust ? `G${wind.gust.value.toString().padStart(2, '0')}` : '';

  return `${dir}${speed}${gust}${unit}`;
}

function encodeVisibility(visibility) {
  if (!visibility) return null;
  
  if (visibility.cavok) return 'CAVOK';
  
  if (visibility.unit === 'SM') {
    return `${visibility.displayValue || visibility.value}SM`;
  }
  
  return visibility.value.toString().padStart(4, '0');
}

function encodeRVR(rvr) {
  if (!rvr) return null;
  const prefix = rvr.prefix || '';
  const value = (rvr.displayValue || Math.round(rvr.value / 0.3048)).toString().padStart(4, '0');
  const trend = rvr.trend || '';
  return `R${rvr.runway}/${prefix}${value}${trend}FT`;
}

function encodeWeather(weather) {
  if (!weather || !Array.isArray(weather) || weather.length === 0) return null;

  return weather.map(w => {
    let str = '';
    if (w.intensity === '-') str += '-';
    else if (w.intensity === '+') str += '+';
    else if (w.intensity === 'VC') str += 'VC';
    
    if (w.descriptor) str += w.descriptor;
    
    if (w.phenomena && Array.isArray(w.phenomena)) {
      str += w.phenomena.map(p => typeof p === 'object' ? p.code : p).join('');
    }
    
    return str;
  }).join(' ');
}

function encodeCloud(clouds) {
  if (!clouds || !Array.isArray(clouds) || clouds.length === 0) return null;

  return clouds.map(c => {
    if (c.type === 'NSC' || c.type === 'NCD' || c.type === 'SKC' || c.type === 'CLR') {
      return c.type;
    }
    const amount = c.amount;
    const height = c.height ? Math.round((c.height.meters || c.height.value) / 0.3048 / 100).toString().padStart(3, '0') : '000';
    const cloudType = c.cloudType ? (typeof c.cloudType === 'object' ? c.cloudType.code : c.cloudType) : '';
    return `${amount}${height}${cloudType}`;
  }).join(' ');
}

function encodePressure(pressure) {
  if (!pressure) return null;
  
  if (pressure.unit === 'INHG' || pressure.displayUnit === 'INHG') {
    const inhg = (pressure.displayValue || pressure.value / 33.86389).toFixed(2).replace('.', '');
    return `A${inhg}`;
  }
  
  return `Q${pressure.value.toString().padStart(4, '0')}`;
}

function encodeTime(time) {
  if (!time) return null;
  if (typeof time === 'string') return time;
  
  const day = time.day.toString().padStart(2, '0');
  const hour = time.hour.toString().padStart(2, '0');
  const minute = (time.minute || 0).toString().padStart(2, '0');
  return `${day}${hour}${minute}Z`;
}

function encodeTAFPeriod(period) {
  if (!period) return null;
  
  const fromDay = period.from.day.toString().padStart(2, '0');
  const fromHour = period.from.hour.toString().padStart(2, '0');
  const toDay = period.to.day.toString().padStart(2, '0');
  const toHour = period.to.hour.toString().padStart(2, '0');
  
  return `${fromDay}${fromHour}/${toDay}${toHour}`;
}

function encodeMETAR(data) {
  if (!data || !data.success) {
    return { success: false, error: '无效的输入数据' };
  }

  const parts = [];

  if (data.type) parts.push(data.type);
  if (data.correction) parts.push('COR');
  if (data.automatic) parts.push('AUTO');
  if (data.airport) parts.push(data.airport.code || data.airport.icao);
  if (data.observationTime) parts.push(encodeTime(data.observationTime));

  const wind = encodeWind(data.wind);
  if (wind) parts.push(wind);

  const visibility = encodeVisibility(data.visibility);
  if (visibility) parts.push(visibility);

  if (data.rvr && data.rvr.length > 0) {
    data.rvr.forEach(r => {
      const encoded = encodeRVR(r);
      if (encoded) parts.push(encoded);
    });
  }

  const weather = encodeWeather(data.weather);
  if (weather && !visibility?.includes('CAVOK')) parts.push(weather);

  const clouds = encodeCloud(data.clouds);
  if (clouds && !visibility?.includes('CAVOK')) parts.push(clouds);

  if (data.temperature || data.dewPoint) {
    const temp = encodeTemperature(data.temperature) || '//';
    const dew = encodeTemperature(data.dewPoint) || '//';
    parts.push(`${temp}/${dew}`);
  }

  const pressure = encodePressure(data.pressure);
  if (pressure) parts.push(pressure);

  if (data.recentWeather) {
    const recent = encodeWeather(data.recentWeather);
    if (recent) parts.push(`RE${recent.replace(/ /g, '')}`);
  }

  if (data.windShear) parts.push(data.windShear);

  if (data.trends && data.trends.length > 0) {
    data.trends.forEach(trend => {
      const trendParts = [];
      
      if (trend.type === 'PROB') {
        trendParts.push(`PROB${trend.probability}`);
      } else if (trend.type !== 'TREND') {
        trendParts.push(trend.type);
      }
      
      if (trend.period) {
        trendParts.push(encodeTAFPeriod(trend.period));
      }
      
      const tWind = encodeWind(trend.wind);
      if (tWind) trendParts.push(tWind);
      
      const tVis = encodeVisibility(trend.visibility);
      if (tVis) trendParts.push(tVis);
      
      const tWeather = encodeWeather(trend.weather);
      if (tWeather) trendParts.push(tWeather);
      
      const tClouds = encodeCloud(trend.clouds);
      if (tClouds) trendParts.push(tClouds);
      
      if (trendParts.length > 0) {
        parts.push(trendParts.join(' '));
      }
    });
  }

  if (data.remarks) parts.push(`RMK ${data.remarks}`);

  const result = parts.join(' ');

  return {
    success: true,
    encoded: result,
    normalized: result
  };
}

function encodeTAF(data) {
  if (!data || !data.success) {
    return { success: false, error: '无效的输入数据' };
  }

  const parts = [];

  parts.push('TAF');
  if (data.amendment) parts.push(data.header?.amendment || 'AMD');
  if (data.correction) parts.push('COR');
  if (data.airport) parts.push(data.airport.code || data.airport.icao);
  if (data.issueTime) parts.push(encodeTime(data.issueTime));
  if (data.validPeriod) parts.push(encodeTAFPeriod(data.validPeriod));

  if (data.mainForecast) {
    const mf = data.mainForecast;
    
    const wind = encodeWind(mf.wind);
    if (wind) parts.push(wind);
    
    const visibility = encodeVisibility(mf.visibility);
    if (visibility) parts.push(visibility);
    
    const weather = encodeWeather(mf.weather);
    if (weather) parts.push(weather);
    
    const clouds = encodeCloud(mf.clouds);
    if (clouds) parts.push(clouds);
    
    if (mf.maxTemperature) {
      const temp = encodeTemperature(mf.maxTemperature.value);
      const time = `${mf.maxTemperature.time.day.toString().padStart(2, '0')}${mf.maxTemperature.time.hour.toString().padStart(2, '0')}`;
      parts.push(`TX${temp}/${time}Z`);
    }
    
    if (mf.minTemperature) {
      const temp = encodeTemperature(mf.minTemperature.value);
      const time = `${mf.minTemperature.time.day.toString().padStart(2, '0')}${mf.minTemperature.time.hour.toString().padStart(2, '0')}`;
      parts.push(`TN${temp}/${time}Z`);
    }
  }

  if (data.changeGroups && data.changeGroups.length > 0) {
    data.changeGroups.forEach(cg => {
      const cgParts = [];
      
      if (cg.type === 'PROB') {
        cgParts.push(`PROB${cg.probability}`);
        if (cg.subType) cgParts.push(cg.subType);
      } else if (cg.type === 'FM') {
        const fmDay = cg.fmTime.day.toString().padStart(2, '0');
        const fmHour = cg.fmTime.hour.toString().padStart(2, '0');
        const fmMin = cg.fmTime.minute.toString().padStart(2, '0');
        cgParts.push(`FM${fmDay}${fmHour}${fmMin}`);
      } else {
        cgParts.push(cg.type);
      }
      
      if (cg.period) {
        cgParts.push(encodeTAFPeriod(cg.period));
      }
      
      const wind = encodeWind(cg.wind);
      if (wind) cgParts.push(wind);
      
      const visibility = encodeVisibility(cg.visibility);
      if (visibility) cgParts.push(visibility);
      
      const weather = encodeWeather(cg.weather);
      if (weather) cgParts.push(weather);
      
      const clouds = encodeCloud(cg.clouds);
      if (clouds) cgParts.push(clouds);
      
      if (cgParts.length > 0) {
        parts.push(cgParts.join(' '));
      }
    });
  }

  if (data.remarks) parts.push(`RMK ${data.remarks}`);

  const result = parts.join(' ');

  return {
    success: true,
    encoded: result,
    normalized: result
  };
}

module.exports = {
  encodeMETAR,
  encodeTAF,
  encodeTemperature,
  encodeWind,
  encodeVisibility,
  encodeRVR,
  encodeWeather,
  encodeCloud,
  encodePressure,
  encodeTime,
  encodeTAFPeriod
};
