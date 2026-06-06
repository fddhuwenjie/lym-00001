const express = require('express');
const { decodeMETAR } = require('./decoders/metar');
const { decodeTAF } = require('./decoders/taf');
const { encodeMETAR, encodeTAF } = require('./encoders/encode');
const { validateSingle, validateBatch, detectType } = require('./validators/validator');
const { 
  initDB, saveReport, queryByAirport, queryByTimeRange, 
  compareReports, compareLatestWithPrevious, getLatestReport, 
  getAllReports, getStats, deleteReport 
} = require('./db/database');
const { findAirport, searchAirports, getAllAirports } = require('./data/airports');

const app = express();
const PORT = 8001;

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.get('/', (req, res) => {
  res.json({
    name: '航空气象电报解码 API 服务',
    version: '1.0.0',
    endpoints: {
      'POST /api/decode/metar': 'METAR/SPECI 电报解码',
      'POST /api/decode/taf': 'TAF 预报电报解码',
      'POST /api/encode/metar': 'METAR 反向编码',
      'POST /api/encode/taf': 'TAF 反向编码',
      'POST /api/validate': '单条电报校验',
      'POST /api/validate/batch': '批量电报校验',
      'GET  /api/airports': '查询机场列表',
      'GET  /api/airports/:code': '查询单个机场',
      'GET  /api/airports/search?q=xxx': '搜索机场',
      'GET  /api/history/:airport': '查询机场历史电报',
      'GET  /api/history/compare/:airport': '对比机场电报变化',
      'GET  /api/stats': '获取统计信息'
    }
  });
});

app.post('/api/decode/metar', (req, res) => {
  try {
    const { raw, archive = true } = req.body;
    
    if (!raw) {
      return res.status(400).json({
        success: false,
        error: '缺少 raw 参数，请提供 METAR/SPECI 原始电报'
      });
    }

    const decoded = decodeMETAR(raw);
    
    if (!decoded.success) {
      return res.status(400).json(decoded);
    }

    if (archive && decoded.airport) {
      saveReport('METAR', decoded.airport.code, raw, decoded);
    }

    res.json(decoded);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '解码失败: ' + error.message
    });
  }
});

app.post('/api/decode/taf', (req, res) => {
  try {
    const { raw, archive = true } = req.body;
    
    if (!raw) {
      return res.status(400).json({
        success: false,
        error: '缺少 raw 参数，请提供 TAF 原始电报'
      });
    }

    const decoded = decodeTAF(raw);
    
    if (!decoded.success) {
      return res.status(400).json(decoded);
    }

    if (archive && decoded.airport) {
      saveReport('TAF', decoded.airport.code, raw, decoded);
    }

    res.json(decoded);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '解码失败: ' + error.message
    });
  }
});

app.post('/api/decode', (req, res) => {
  try {
    const { raw, archive = true } = req.body;
    
    if (!raw) {
      return res.status(400).json({
        success: false,
        error: '缺少 raw 参数，请提供原始电报'
      });
    }

    const type = detectType(raw);
    let decoded;

    if (type === 'METAR') {
      decoded = decodeMETAR(raw);
    } else if (type === 'TAF') {
      decoded = decodeTAF(raw);
    } else {
      return res.status(400).json({
        success: false,
        error: '无法识别电报类型，请确保是有效的 METAR/SPECI 或 TAF 格式'
      });
    }

    if (!decoded.success) {
      return res.status(400).json(decoded);
    }

    if (archive && decoded.airport) {
      saveReport(type, decoded.airport.code, raw, decoded);
    }

    res.json({ ...decoded, detectedType: type });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '解码失败: ' + error.message
    });
  }
});

app.post('/api/encode/metar', (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data) {
      return res.status(400).json({
        success: false,
        error: '缺少 data 参数，请提供结构化 JSON 数据'
      });
    }

    const encoded = encodeMETAR(data);
    
    if (!encoded.success) {
      return res.status(400).json(encoded);
    }

    res.json(encoded);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '编码失败: ' + error.message
    });
  }
});

app.post('/api/encode/taf', (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data) {
      return res.status(400).json({
        success: false,
        error: '缺少 data 参数，请提供结构化 JSON 数据'
      });
    }

    const encoded = encodeTAF(data);
    
    if (!encoded.success) {
      return res.status(400).json(encoded);
    }

    res.json(encoded);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '编码失败: ' + error.message
    });
  }
});

app.post('/api/validate', (req, res) => {
  try {
    const { raw } = req.body;
    
    if (!raw) {
      return res.status(400).json({
        success: false,
        error: '缺少 raw 参数，请提供电报内容'
      });
    }

    const result = validateSingle(raw);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '校验失败: ' + error.message
    });
  }
});

app.post('/api/validate/batch', (req, res) => {
  try {
    const { messages } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        error: '缺少 messages 参数，请提供电报数组'
      });
    }

    const result = validateBatch(messages);
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '批量校验失败: ' + error.message
    });
  }
});

app.get('/api/airports', (req, res) => {
  try {
    const { q } = req.query;
    
    if (q) {
      const airports = searchAirports(q);
      res.json({
        success: true,
        count: airports.length,
        data: airports
      });
    } else {
      const airports = getAllAirports();
      res.json({
        success: true,
        count: airports.length,
        data: airports
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '查询机场失败: ' + error.message
    });
  }
});

app.get('/api/airports/:code', (req, res) => {
  try {
    const { code } = req.params;
    const airport = findAirport(code.toUpperCase());
    
    if (!airport) {
      return res.status(404).json({
        success: false,
        error: '未找到该机场'
      });
    }

    res.json({
      success: true,
      data: airport
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '查询机场失败: ' + error.message
    });
  }
});

app.get('/api/history/:airport', (req, res) => {
  try {
    const { airport } = req.params;
    const { start, end, limit = 100, type } = req.query;
    
    const airportCode = airport.toUpperCase();
    
    let reports;
    
    if (start || end) {
      reports = queryByTimeRange(start, end, airportCode, type, parseInt(limit));
    } else {
      reports = queryByAirport(airportCode, null, null, parseInt(limit));
    }

    res.json({
      success: true,
      count: reports.length,
      data: reports.map(r => ({
        id: r.id,
        type: r.type,
        airport: r.airport,
        raw: r.raw,
        observation_time: r.observation_time,
        created_at: r.created_at,
        decoded: r.decoded
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '查询历史电报失败: ' + error.message
    });
  }
});

app.get('/api/history/compare/:airport', (req, res) => {
  try {
    const { airport } = req.params;
    const { type = 'METAR' } = req.query;
    
    const airportCode = airport.toUpperCase();
    const result = compareLatestWithPrevious(airportCode, type);
    
    if (result.error) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '对比电报失败: ' + error.message
    });
  }
});

app.get('/api/history', (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const reports = getAllReports(parseInt(limit));
    
    res.json({
      success: true,
      count: reports.length,
      data: reports.map(r => ({
        id: r.id,
        type: r.type,
        airport: r.airport,
        raw: r.raw,
        observation_time: r.observation_time,
        created_at: r.created_at
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '查询历史电报失败: ' + error.message
    });
  }
});

app.delete('/api/history/:id', (req, res) => {
  try {
    const { id } = req.params;
    const deleted = deleteReport(parseInt(id));
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: '未找到该记录'
      });
    }

    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '删除失败: ' + error.message
    });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const stats = getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '获取统计信息失败: ' + error.message
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: '接口不存在'
  });
});

app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  console.error('Stack:', err.stack);
  res.status(500).json({
    success: false,
    error: '服务器内部错误: ' + err.message,
    stack: err.stack
  });
});

initDB();

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`航空气象电报解码 API 服务已启动`);
  console.log(`服务地址: http://localhost:${PORT}`);
  console.log(`API 文档: http://localhost:${PORT}/`);
  console.log(`========================================\n`);
});

module.exports = app;
