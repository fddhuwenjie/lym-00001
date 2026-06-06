const { airportList, findAirport } = require('../data/airports');
const { getLatestReport, getReportByTimeAndType } = require('../db/database');
const { decodeMETAR } = require('../decoders/metar');
const { decodeTAF } = require('../decoders/taf');
const { assessAirportRisk } = require('./risk');
const { calculateAirportCrosswinds } = require('./crosswind');
const { normalizeTafForecast } = require('./taf_utils');

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findNearbyAirports(targetAirportCode, maxDistanceKm = 300) {
  const target = findAirport(targetAirportCode);
  if (!target) {
    return [];
  }

  const results = [];

  for (const airport of airportList) {
    if (airport.code.toUpperCase() === target.code.toUpperCase()) continue;

    const distance = haversineDistance(
      target.lat, target.lon,
      airport.lat, airport.lon
    );

    if (distance <= maxDistanceKm) {
      results.push({
        airport,
        distanceKm: Math.round(distance * 10) / 10,
        distanceText: `${Math.round(distance * 10) / 10} 公里`
      });
    }
  }

  results.sort((a, b) => a.distanceKm - b.distanceKm);
  return results;
}

async function getAirportWeatherAndRisk(airportCode, targetTime = null) {
  try {
    let metarReport;
    
    if (targetTime) {
      metarReport = getReportByTimeAndType(airportCode, targetTime, 'METAR');
    }
    if (!metarReport) {
      metarReport = getLatestReport(airportCode, 'METAR');
    }

    let decodedMetar = metarReport?.decoded;
    
    if (!decodedMetar && metarReport?.raw) {
      decodedMetar = decodeMETAR(metarReport.raw);
    }

    const crosswindData = decodedMetar ? calculateAirportCrosswinds(decodedMetar) : null;

    const riskAssessment = assessAirportRisk(decodedMetar, null, airportCode, '备降', crosswindData);

    return {
      airportCode,
      metar: metarReport ? {
        id: metarReport.id,
        raw: metarReport.raw,
        observationTime: decodedMetar?.observationTime?.text || metarReport.observation_time,
        decoded: decodedMetar
      } : null,
      crosswind: crosswindData,
      riskAssessment,
      hasWeatherData: !!decodedMetar
    };
  } catch (error) {
    console.error(`获取备降机场 ${airportCode} 气象数据失败:`, error.message);
    return {
      airportCode,
      metar: null,
      crosswind: null,
      riskAssessment: null,
      hasWeatherData: false,
      error: error.message
    };
  }
}

async function findAlternateAirports(arrivalAirportCode, targetTime = null, maxDistanceKm = 300, maxResults = 3) {
  const arrivalAirport = findAirport(arrivalAirportCode);
  if (!arrivalAirport) {
    return {
      success: false,
      error: `未找到降落机场 ${arrivalAirportCode} 的信息`,
      alternates: []
    };
  }

  const nearbyAirports = findNearbyAirports(arrivalAirportCode, maxDistanceKm);

  if (nearbyAirports.length === 0) {
    return {
      success: true,
      arrivalAirport: {
        code: arrivalAirport.code,
        name: arrivalAirport.name,
        lat: arrivalAirport.lat,
        lon: arrivalAirport.lon
      },
      searchRadiusKm: maxDistanceKm,
      totalNearby: 0,
      eligibleCount: 0,
      alternates: [],
      message: `${maxDistanceKm} 公里范围内未找到其他机场`
    };
  }

  const alternatesWithWeather = [];

  for (const nearby of nearbyAirports) {
    const weatherData = await getAirportWeatherAndRisk(nearby.airport.code, targetTime);
    
    const isGreen = weatherData.riskAssessment?.overallLevel === 'green';
    const canOperate = weatherData.riskAssessment?.canOperate !== false;

    alternatesWithWeather.push({
      ...nearby,
      airport: {
        code: nearby.airport.code,
        name: nearby.airport.name,
        city: nearby.airport.city,
        country: nearby.airport.country,
        lat: nearby.airport.lat,
        lon: nearby.airport.lon,
        elevation: nearby.airport.elevation
      },
      ...weatherData,
      isEligible: isGreen && canOperate && weatherData.hasWeatherData
    });
  }

  const greenAlternates = alternatesWithWeather
    .filter(a => a.isEligible)
    .slice(0, maxResults);

  const eligibleCount = alternatesWithWeather.filter(a => a.isEligible).length;

  return {
    success: true,
    arrivalAirport: {
      code: arrivalAirport.code,
      name: arrivalAirport.name,
      lat: arrivalAirport.lat,
      lon: arrivalAirport.lon
    },
    searchRadiusKm: maxDistanceKm,
    totalNearby: nearbyAirports.length,
    eligibleCount,
    maxResults,
    alternates: greenAlternates,
    allCandidates: alternatesWithWeather,
    message: eligibleCount > 0
      ? `找到 ${eligibleCount} 个符合条件的备降机场，已返回最近的 ${Math.min(eligibleCount, maxResults)} 个`
      : `${maxDistanceKm} 公里范围内未找到气象条件良好的备降机场`
  };
}

module.exports = {
  haversineDistance,
  findNearbyAirports,
  getAirportWeatherAndRisk,
  findAlternateAirports
};
