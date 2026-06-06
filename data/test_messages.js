const testMessages = {
  metar: [
    {
      name: "标准 METAR - 北京首都",
      description: "包含风、能见度、天气现象、云、温湿度、气压，无趋势",
      raw: "METAR ZBAA 060800Z 18005MPS 9999 FEW040 BKN120 25/M10 Q1015 NOSIG",
      testCases: ["温度负数M前缀", "风速单位MPS", "NOSIG趋势", "多层云组"]
    },
    {
      name: "复杂 METAR - 上海浦东",
      description: "包含 CAVOK、阵风、修正报、自动观测",
      raw: "METAR COR ZSPD 060730Z AUTO 31015G25KT CAVOK 30/22 Q1008 BECMG 0800/0802 27010KT",
      testCases: ["CAVOK处理", "风速单位KT", "阵风G", "COR修正报", "AUTO自动观测", "BECMG趋势"]
    },
    {
      name: "METAR 带跑道视程和雷暴 - 广州白云",
      description: "包含 RVR、TS雷暴、多种天气现象、TEMPO趋势",
      raw: "SPECI ZGGG 060650Z 09008MPS 5000 R01/1200D TSRA FEW030CB SCT050 28/26 Q1001 TEMPO 0700/0703 2000 +TSRA",
      testCases: ["SPECI特殊报", "跑道视程RVR", "雷暴TS", "强天气+", "积雨云CB", "TEMPO趋势", "趋势时间跨段"]
    },
    {
      name: "METAR 低能见度复杂天气 - 成都双流",
      description: "包含大雾、冻降水、风向多变、多种云",
      raw: "METAR ZUUU 060200Z VRB02KT 1500 FG FZRA BKN005 OVC015 M03/M05 Q1028",
      testCases: ["风向多变VRB", "大雾FG", "冻降水FZ", "温度负数", "多层云", "风速单位KT"]
    },
    {
      name: "METAR 国际航班 - 纽约肯尼迪",
      description: "使用英制单位、降雪、概率预报",
      raw: "METAR KJFK 060551Z 22018G28KT 10SM -SN BKN025 OVC040 M02/M08 A2992 RMK AO2 PK WND 25035/0540",
      testCases: ["美国机场", "能见度SM英里", "英寸汞柱A", "轻雪-SN", "RMK备注", "PK WND阵风峰值"]
    },
    {
      name: "METAR 带 PROB 概率趋势 - 伦敦希思罗",
      description: "包含概率预报、短时变化",
      raw: "METAR EGLL 060850Z 25012KT 9999 SCT030 18/12 Q1012 PROB30 TEMPO 0910/0914 4000 RA",
      testCases: ["欧洲机场", "PROB30概率", "TEMPO短时", "组合变化段"]
    }
  ],
  taf: [
    {
      name: "标准 TAF - 北京首都",
      description: "主预报 + BECMG 变化段，跨日时段",
      raw: "TAF ZBAA 060500Z 0606/0712 20008MPS 9999 SCT050 BECMG 0620/0622 30005MPS BKN030 TEMPO 0700/0706 3000 BR SCT010",
      testCases: ["主预报段", "BECMG渐变", "TEMPO短时", "跨日时段(06-07日)"]
    },
    {
      name: "TAF 带 FM 时间点变化 - 上海浦东",
      description: "包含 FM 精确时间点变化、最大最小温度",
      raw: "TAF AMD ZSPD 060400Z 0606/0706 28015KT 9999 SCT040 TX32/0606Z TN24/0622Z FM061200 20010KT 5000 -SHRA SCT020CB",
      testCases: ["AMD修正报", "最大温度TX", "最小温度TN", "FM精确时间", "积雨云CB", "阵雨SHRA"]
    },
    {
      name: "TAF 复杂多段 - 香港国际机场",
      description: "多个变化段，包含 PROB 概率",
      raw: "TAF VHHH 060300Z 0606/0712 18010KT 6000 SCT030 BECMG 0608/0610 14015KT 9999 SCT050 PROB40 TEMPO 0612/0618 3000 TSRA FM062000 22008KT 8000 FEW040",
      testCases: ["香港机场", "多段预报", "PROB40概率", "FM时间点", "BECMG渐变"]
    },
    {
      name: "TAF 国际 - 洛杉矶",
      description: "英制单位、跨日、多种变化类型",
      raw: "TAF KLAX 060440Z 0606/0712 21010KT 10SM SCT025 BKN040 TEMPO 0618/0624 3SM -RA OVC020 PROB30 0620/0622 1SM FG",
      testCases: ["美国机场", "英制单位", "TEMPO短时", "PROB30概率", "大雾FG"]
    }
  ],
  invalid: [
    {
      name: "无效机场代码",
      raw: "METAR ZZZZ 060800Z 18005MPS 9999 25/10 Q1015"
    },
    {
      name: "无效时间格式",
      raw: "METAR ZBAA 060800 18005MPS 9999 25/10 Q1015"
    },
    {
      name: "无效风向",
      raw: "METAR ZBAA 060800Z 40005MPS 9999 25/10 Q1015"
    },
    {
      name: "露点高于气温",
      raw: "METAR ZBAA 060800Z 18005MPS 9999 10/25 Q1015"
    },
    {
      name: "不完整电报",
      raw: "METAR ZBAA 060800Z"
    }
  ]
};

function getTestMetars() {
  return testMessages.metar;
}

function getTestTafs() {
  return testMessages.taf;
}

function getInvalidTests() {
  return testMessages.invalid;
}

function getAllTestMessages() {
  return [
    ...testMessages.metar.map(m => ({ type: 'METAR', ...m })),
    ...testMessages.taf.map(m => ({ type: 'TAF', ...m })),
    ...testMessages.invalid.map(m => ({ type: 'INVALID', ...m }))
  ];
}

module.exports = {
  testMessages,
  getTestMetars,
  getTestTafs,
  getInvalidTests,
  getAllTestMessages
};
