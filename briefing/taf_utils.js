function normalizeTafForecast(decodedTaf) {
  if (!decodedTaf) return [];

  const forecasts = [];

  if (decodedTaf.mainForecast) {
    forecasts.push({
      type: 'MAIN',
      typeText: '主预报段',
      period: decodedTaf.mainForecast.period,
      elements: {
        wind: decodedTaf.mainForecast.wind,
        visibility: decodedTaf.mainForecast.visibility,
        weather: decodedTaf.mainForecast.weather || [],
        clouds: decodedTaf.mainForecast.clouds || [],
        temperature: decodedTaf.mainForecast.temperature
      }
    });
  }

  if (decodedTaf.changeGroups && Array.isArray(decodedTaf.changeGroups)) {
    for (const group of decodedTaf.changeGroups) {
      forecasts.push({
        type: group.type,
        typeText: group.typeText,
        probability: group.probability,
        subType: group.subType,
        period: group.period,
        fmTime: group.fmTime,
        elements: {
          wind: group.wind,
          visibility: group.visibility,
          weather: group.weather || [],
          clouds: group.clouds || [],
          temperature: group.temperature
        },
        raw: group.raw
      });
    }
  }

  return forecasts;
}

module.exports = {
  normalizeTafForecast
};
