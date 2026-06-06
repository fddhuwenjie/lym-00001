const weatherPhenomena = {
  descriptors: {
    MI: '浅', PR: '部分', BC: '散片状', DR: '低吹', BL: '高吹',
    SH: '阵', TS: '雷暴', FZ: '冻'
  },
  phenomena: {
    DZ: '毛毛雨', RA: '雨', SN: '雪', SG: '雪粒', IC: '冰晶',
    PE: '冰粒', PL: '冰针', GR: '冰雹', GS: '小冰雹', UP: '未知',
    BR: '轻雾', FG: '雾', FU: '烟', VA: '火山灰', DU: '浮尘',
    SA: '扬沙', HZ: '霾', PY: '尘暴', PO: '尘卷风', SQ: '飑',
    FC: '漏斗云', SS: '沙暴', DS: '尘暴'
  },
  intensity: {
    '-': '轻', '+': '强', '': '中', VC: '机场附近'
  }
};

const cloudTypes = {
  FEW: '少量云',
  SCT: '疏云',
  BKN: '碎云',
  OVC: '满天云',
  CB: '积雨云',
  TCU: '浓积云',
  SKC: '晴空',
  NSC: '无重要云',
  CAVOK: '天气和能见度良好'
};

const trendTypes = {
  BECMG: '逐渐变化',
  TEMPO: '短时变化',
  FM: '从某时起',
  TL: '到某时止',
  AT: '在某时',
  PROB30: '概率30%',
  PROB40: '概率40%',
  NOSIG: '无显著变化'
};

const units = {
  MPS: '米/秒',
  KT: '节',
  KMH: '公里/小时',
  M: '米',
  SM: ' statute英里',
  KM: '公里',
  HPA: '百帕',
  INHG: '英寸汞柱',
  C: '摄氏度'
};

module.exports = {
  weatherPhenomena,
  cloudTypes,
  trendTypes,
  units
};
