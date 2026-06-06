const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'weather.db');

let db;

function initDB() {
  try {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS weather_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        airport TEXT NOT NULL,
        raw TEXT NOT NULL,
        decoded_json TEXT,
        observation_time TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_airport ON weather_reports (airport);
      CREATE INDEX IF NOT EXISTS idx_type ON weather_reports (type);
      CREATE INDEX IF NOT EXISTS idx_observation_time ON weather_reports (observation_time);
      CREATE INDEX IF NOT EXISTS idx_created_at ON weather_reports (created_at);

      CREATE TABLE IF NOT EXISTS flight_routes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        departure_airport TEXT NOT NULL,
        arrival_airport TEXT NOT NULL,
        waypoints TEXT,
        cruise_altitude INTEGER,
        flight_duration INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_route_name ON flight_routes (name);
      CREATE INDEX IF NOT EXISTS idx_route_departure ON flight_routes (departure_airport);
      CREATE INDEX IF NOT EXISTS idx_route_arrival ON flight_routes (arrival_airport);

      CREATE TABLE IF NOT EXISTS weather_briefings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        route_id INTEGER NOT NULL,
        departure_time TEXT NOT NULL,
        briefing_json TEXT NOT NULL,
        risk_level TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_briefing_route ON weather_briefings (route_id);
      CREATE INDEX IF NOT EXISTS idx_briefing_departure_time ON weather_briefings (departure_time);
      CREATE INDEX IF NOT EXISTS idx_briefing_risk ON weather_briefings (risk_level);
    `);
    
    console.log('数据库初始化成功');
    return true;
  } catch (error) {
    console.error('数据库初始化失败:', error.message);
    return false;
  }
}

function saveReport(type, airport, raw, decoded) {
  if (!db) {
    initDB();
    if (!db) return null;
  }

  try {
    const observationTime = decoded?.observationTime?.timestamp || decoded?.issueTime?.timestamp || null;
    
    const stmt = db.prepare(`
      INSERT INTO weather_reports (type, airport, raw, decoded_json, observation_time)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      type,
      airport,
      raw,
      JSON.stringify(decoded),
      observationTime
    );
    
    return result.lastInsertRowid;
  } catch (error) {
    console.error('保存电报失败:', error.message);
    return null;
  }
}

function queryByAirport(airport, startTime = null, endTime = null, limit = 100) {
  if (!db) {
    initDB();
    if (!db) return [];
  }

  try {
    let sql = `
      SELECT * FROM weather_reports 
      WHERE airport = ?
    `;
    const params = [airport];

    if (startTime) {
      sql += ' AND observation_time >= ?';
      params.push(startTime);
    }
    if (endTime) {
      sql += ' AND observation_time <= ?';
      params.push(endTime);
    }

    sql += ' ORDER BY observation_time DESC, created_at DESC LIMIT ?';
    params.push(limit);

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    
    return rows.map(row => ({
      ...row,
      decoded: row.decoded_json ? JSON.parse(row.decoded_json) : null
    }));
  } catch (error) {
    console.error('查询机场电报失败:', error.message);
    return [];
  }
}

function queryByTimeRange(startTime, endTime, airport = null, type = null, limit = 100) {
  if (!db) {
    initDB();
    if (!db) return [];
  }

  try {
    let sql = `
      SELECT * FROM weather_reports 
      WHERE observation_time >= ? AND observation_time <= ?
    `;
    const params = [startTime, endTime];

    if (airport) {
      sql += ' AND airport = ?';
      params.push(airport);
    }
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    sql += ' ORDER BY observation_time DESC, created_at DESC LIMIT ?';
    params.push(limit);

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    
    return rows.map(row => ({
      ...row,
      decoded: row.decoded_json ? JSON.parse(row.decoded_json) : null
    }));
  } catch (error) {
    console.error('按时间范围查询失败:', error.message);
    return [];
  }
}

function compareReports(report1, report2) {
  if (!report1 || !report2) {
    return { error: '需要两份电报数据' };
  }

  const changes = [];

  const decoded1 = typeof report1.decoded === 'string' ? JSON.parse(report1.decoded) : report1.decoded;
  const decoded2 = typeof report2.decoded === 'string' ? JSON.parse(report2.decoded) : report2.decoded;

  if (decoded1.wind?.speed?.value !== decoded2.wind?.speed?.value || 
      decoded1.wind?.direction?.value !== decoded2.wind?.direction?.value ||
      decoded1.wind?.gust?.value !== decoded2.wind?.gust?.value) {
    changes.push({
      field: 'wind',
      fieldName: '风',
      oldValue: decoded1.wind?.text || '无',
      newValue: decoded2.wind?.text || '无',
      change: `从 "${decoded1.wind?.text || '无'}" 变为 "${decoded2.wind?.text || '无'}"`
    });
  }

  const vis1 = decoded1.visibility?.value;
  const vis2 = decoded2.visibility?.value;
  if (vis1 !== vis2) {
    changes.push({
      field: 'visibility',
      fieldName: '能见度',
      oldValue: decoded1.visibility?.text || '无',
      newValue: decoded2.visibility?.text || '无',
      change: `从 ${decoded1.visibility?.text || '无'} 变为 ${decoded2.visibility?.text || '无'}`
    });
  }

  const weather1 = decoded1.weather?.map(w => w.text).join(', ') || '无';
  const weather2 = decoded2.weather?.map(w => w.text).join(', ') || '无';
  if (weather1 !== weather2) {
    changes.push({
      field: 'weather',
      fieldName: '天气现象',
      oldValue: weather1,
      newValue: weather2,
      change: `从 "${weather1}" 变为 "${weather2}"`
    });
  }

  const clouds1 = decoded1.clouds?.map(c => c.text).join(', ') || '无云';
  const clouds2 = decoded2.clouds?.map(c => c.text).join(', ') || '无云';
  if (clouds1 !== clouds2) {
    changes.push({
      field: 'clouds',
      fieldName: '云组',
      oldValue: clouds1,
      newValue: clouds2,
      change: `从 "${clouds1}" 变为 "${clouds2}"`
    });
  }

  if (decoded1.temperature?.value !== decoded2.temperature?.value) {
    changes.push({
      field: 'temperature',
      fieldName: '温度',
      oldValue: decoded1.temperature?.text || '无',
      newValue: decoded2.temperature?.text || '无',
      change: `从 ${decoded1.temperature?.text || '无'} 变为 ${decoded2.temperature?.text || '无'}`
    });
  }

  if (decoded1.dewPoint?.value !== decoded2.dewPoint?.value) {
    changes.push({
      field: 'dewPoint',
      fieldName: '露点',
      oldValue: decoded1.dewPoint?.text || '无',
      newValue: decoded2.dewPoint?.text || '无',
      change: `从 ${decoded1.dewPoint?.text || '无'} 变为 ${decoded2.dewPoint?.text || '无'}`
    });
  }

  if (decoded1.pressure?.value !== decoded2.pressure?.value) {
    changes.push({
      field: 'pressure',
      fieldName: '气压',
      oldValue: decoded1.pressure?.text || '无',
      newValue: decoded2.pressure?.text || '无',
      change: `从 ${decoded1.pressure?.text || '无'} 变为 ${decoded2.pressure?.text || '无'}`
    });
  }

  return {
    airport: decoded1.airport?.code || '未知机场',
    report1: {
      id: report1.id,
      time: decoded1.observationTime?.text || decoded1.issueTime?.text,
      raw: report1.raw
    },
    report2: {
      id: report2.id,
      time: decoded2.observationTime?.text || decoded2.issueTime?.text,
      raw: report2.raw
    },
    changes,
    changeCount: changes.length,
    hasChanges: changes.length > 0
  };
}

function getLatestReport(airport, type = 'METAR') {
  if (!db) {
    initDB();
    if (!db) return null;
  }

  try {
    const stmt = db.prepare(`
      SELECT * FROM weather_reports 
      WHERE airport = ? AND type = ?
      ORDER BY observation_time DESC, created_at DESC LIMIT 1
    `);
    const row = stmt.get(airport, type);
    
    if (row) {
      return {
        ...row,
        decoded: row.decoded_json ? JSON.parse(row.decoded_json) : null
      };
    }
    return null;
  } catch (error) {
    console.error('获取最新电报失败:', error.message);
    return null;
  }
}

function getPreviousReport(airport, beforeTime, type = 'METAR') {
  if (!db) {
    initDB();
    if (!db) return null;
  }

  try {
    const stmt = db.prepare(`
      SELECT * FROM weather_reports 
      WHERE airport = ? AND type = ? AND observation_time < ?
      ORDER BY observation_time DESC LIMIT 1
    `);
    const row = stmt.get(airport, type, beforeTime);
    
    if (row) {
      return {
        ...row,
        decoded: row.decoded_json ? JSON.parse(row.decoded_json) : null
      };
    }
    return null;
  } catch (error) {
    console.error('获取前一份电报失败:', error.message);
    return null;
  }
}

function compareLatestWithPrevious(airport, type = 'METAR') {
  const latest = getLatestReport(airport, type);
  if (!latest) {
    return { error: '未找到该机场的电报记录' };
  }

  const decodedLatest = latest.decoded;
  const obsTime = decodedLatest.observationTime?.timestamp || decodedLatest.issueTime?.timestamp;
  
  const previous = getPreviousReport(airport, obsTime, type);
  
  if (!previous) {
    return { 
      airport,
      latest: {
        id: latest.id,
        time: decodedLatest.observationTime?.text || decodedLatest.issueTime?.text,
        raw: latest.raw
      },
      previous: null,
      changes: [],
      changeCount: 0,
      hasChanges: false,
      message: '该机场只有一份电报记录，无可对比项'
    };
  }

  return compareReports(previous, latest);
}

function getAllReports(limit = 100) {
  if (!db) {
    initDB();
    if (!db) return [];
  }

  try {
    const stmt = db.prepare(`
      SELECT * FROM weather_reports 
      ORDER BY created_at DESC LIMIT ?
    `);
    const rows = stmt.all(limit);
    
    return rows.map(row => ({
      ...row,
      decoded: row.decoded_json ? JSON.parse(row.decoded_json) : null
    }));
  } catch (error) {
    console.error('获取所有电报失败:', error.message);
    return [];
  }
}

function deleteReport(id) {
  if (!db) {
    initDB();
    if (!db) return false;
  }

  try {
    const stmt = db.prepare('DELETE FROM weather_reports WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  } catch (error) {
    console.error('删除电报失败:', error.message);
    return false;
  }
}

function getStats() {
  if (!db) {
    initDB();
    if (!db) return null;
  }

  try {
    const totalStmt = db.prepare('SELECT COUNT(*) as count FROM weather_reports');
    const metarStmt = db.prepare('SELECT COUNT(*) as count FROM weather_reports WHERE type = \'METAR\'');
    const tafStmt = db.prepare('SELECT COUNT(*) as count FROM weather_reports WHERE type = \'TAF\'');
    const airportStmt = db.prepare('SELECT COUNT(DISTINCT airport) as count FROM weather_reports');
    
    return {
      total: totalStmt.get().count,
      metarCount: metarStmt.get().count,
      tafCount: tafStmt.get().count,
      airportCount: airportStmt.get().count
    };
  } catch (error) {
    console.error('获取统计信息失败:', error.message);
    return null;
  }
}

function createRoute(routeData) {
  if (!db) {
    initDB();
    if (!db) return null;
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO flight_routes (name, departure_airport, arrival_airport, waypoints, cruise_altitude, flight_duration)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      routeData.name,
      routeData.departure_airport,
      routeData.arrival_airport,
      routeData.waypoints ? JSON.stringify(routeData.waypoints) : null,
      routeData.cruise_altitude,
      routeData.flight_duration
    );
    return result.lastInsertRowid;
  } catch (error) {
    console.error('创建航线失败:', error.message);
    return null;
  }
}

function getRouteById(id) {
  if (!db) {
    initDB();
    if (!db) return null;
  }

  try {
    const stmt = db.prepare('SELECT * FROM flight_routes WHERE id = ?');
    const row = stmt.get(id);
    if (row) {
      return {
        ...row,
        waypoints: row.waypoints ? JSON.parse(row.waypoints) : []
      };
    }
    return null;
  } catch (error) {
    console.error('查询航线失败:', error.message);
    return null;
  }
}

function searchRoutesByName(name) {
  if (!db) {
    initDB();
    if (!db) return [];
  }

  try {
    let sql = 'SELECT * FROM flight_routes';
    const params = [];
    
    if (name) {
      sql += ' WHERE name LIKE ?';
      params.push(`%${name}%`);
    }
    sql += ' ORDER BY updated_at DESC';

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    
    return rows.map(row => ({
      ...row,
      waypoints: row.waypoints ? JSON.parse(row.waypoints) : []
    }));
  } catch (error) {
    console.error('搜索航线失败:', error.message);
    return [];
  }
}

function updateRoute(id, routeData) {
  if (!db) {
    initDB();
    if (!db) return false;
  }

  try {
    const stmt = db.prepare(`
      UPDATE flight_routes 
      SET name = ?, departure_airport = ?, arrival_airport = ?, waypoints = ?, cruise_altitude = ?, flight_duration = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const result = stmt.run(
      routeData.name,
      routeData.departure_airport,
      routeData.arrival_airport,
      routeData.waypoints ? JSON.stringify(routeData.waypoints) : null,
      routeData.cruise_altitude,
      routeData.flight_duration,
      id
    );
    return result.changes > 0;
  } catch (error) {
    console.error('更新航线失败:', error.message);
    return false;
  }
}

function deleteRoute(id) {
  if (!db) {
    initDB();
    if (!db) return false;
  }

  try {
    const stmt = db.prepare('DELETE FROM flight_routes WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  } catch (error) {
    console.error('删除航线失败:', error.message);
    return false;
  }
}

function saveBriefing(routeId, departureTime, briefingJson, riskLevel) {
  if (!db) {
    initDB();
    if (!db) return null;
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO weather_briefings (route_id, departure_time, briefing_json, risk_level)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(
      routeId,
      departureTime,
      JSON.stringify(briefingJson),
      riskLevel
    );
    return result.lastInsertRowid;
  } catch (error) {
    console.error('保存简报失败:', error.message);
    return null;
  }
}

function getBriefingById(id) {
  if (!db) {
    initDB();
    if (!db) return null;
  }

  try {
    const stmt = db.prepare('SELECT * FROM weather_briefings WHERE id = ?');
    const row = stmt.get(id);
    if (row) {
      return {
        ...row,
        briefing: row.briefing_json ? JSON.parse(row.briefing_json) : null
      };
    }
    return null;
  } catch (error) {
    console.error('查询简报失败:', error.message);
    return null;
  }
}

function getBriefingsByRoute(routeId) {
  if (!db) {
    initDB();
    if (!db) return [];
  }

  try {
    const stmt = db.prepare('SELECT * FROM weather_briefings WHERE route_id = ? ORDER BY created_at DESC');
    const rows = stmt.all(routeId);
    return rows.map(row => ({
      ...row,
      briefing: row.briefing_json ? JSON.parse(row.briefing_json) : null
    }));
  } catch (error) {
    console.error('查询航线简报失败:', error.message);
    return [];
  }
}

function getAllBriefings(limit = 100) {
  if (!db) {
    initDB();
    if (!db) return [];
  }

  try {
    const stmt = db.prepare('SELECT * FROM weather_briefings ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(limit);
    return rows.map(row => ({
      ...row,
      briefing: row.briefing_json ? JSON.parse(row.briefing_json) : null
    }));
  } catch (error) {
    console.error('查询所有简报失败:', error.message);
    return [];
  }
}

function getReportByTimeAndType(airport, targetTime, type = 'METAR', beforeMinutes = 360) {
  if (!db) {
    initDB();
    if (!db) return null;
  }

  try {
    const stmt = db.prepare(`
      SELECT * FROM weather_reports
      WHERE airport = ? AND type = ? AND observation_time <= ?
      ORDER BY observation_time DESC LIMIT 1
    `);
    const row = stmt.get(airport, type, targetTime);
    if (row) {
      return {
        ...row,
        decoded: row.decoded_json ? JSON.parse(row.decoded_json) : null
      };
    }
    return null;
  } catch (error) {
    console.error('按时间查询电报失败:', error.message);
    return null;
  }
}

module.exports = {
  initDB,
  saveReport,
  queryByAirport,
  queryByTimeRange,
  compareReports,
  compareLatestWithPrevious,
  getLatestReport,
  getPreviousReport,
  getAllReports,
  deleteReport,
  getStats,
  createRoute,
  getRouteById,
  searchRoutesByName,
  updateRoute,
  deleteRoute,
  saveBriefing,
  getBriefingById,
  getBriefingsByRoute,
  getAllBriefings,
  getReportByTimeAndType
};
