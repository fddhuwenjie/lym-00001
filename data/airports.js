const airports = {
  ZBAA: { code: 'ZBAA', name: '北京首都国际机场', city: '北京', country: 'CN', lat: 40.0801, lon: 116.5846, elevation: 35 },
  ZSPD: { code: 'ZSPD', name: '上海浦东国际机场', city: '上海', country: 'CN', lat: 31.1434, lon: 121.8058, elevation: 4 },
  ZSSS: { code: 'ZSSS', name: '上海虹桥国际机场', city: '上海', country: 'CN', lat: 31.1979, lon: 121.3363, elevation: 3 },
  ZGGG: { code: 'ZGGG', name: '广州白云国际机场', city: '广州', country: 'CN', lat: 23.3924, lon: 113.2988, elevation: 35 },
  ZUUU: { code: 'ZUUU', name: '成都双流国际机场', city: '成都', country: 'CN', lat: 30.5785, lon: 103.9471, elevation: 509 },
  ZUUU_CTU: { code: 'ZUTF', name: '成都天府国际机场', city: '成都', country: 'CN', lat: 30.3357, lon: 104.4463, elevation: 449 },
  ZLXY: { code: 'ZLXY', name: '西安咸阳国际机场', city: '西安', country: 'CN', lat: 34.4472, lon: 108.7517, elevation: 479 },
  ZUCK: { code: 'ZUCK', name: '重庆江北国际机场', city: '重庆', country: 'CN', lat: 29.7192, lon: 106.6417, elevation: 419 },
  ZHCC: { code: 'ZHCC', name: '郑州新郑国际机场', city: '郑州', country: 'CN', lat: 34.5197, lon: 113.8427, elevation: 152 },
  ZSFZ: { code: 'ZSFZ', name: '福州长乐国际机场', city: '福州', country: 'CN', lat: 25.9350, lon: 119.6625, elevation: 14 },
  ZSAM: { code: 'ZSAM', name: '厦门高崎国际机场', city: '厦门', country: 'CN', lat: 24.5370, lon: 118.1270, elevation: 21 },
  ZBOW: { code: 'ZBOW', name: '太原武宿国际机场', city: '太原', country: 'CN', lat: 37.7500, lon: 112.6275, elevation: 779 },
  ZYTX: { code: 'ZYTX', name: '沈阳桃仙国际机场', city: '沈阳', country: 'CN', lat: 41.6380, lon: 123.4900, elevation: 59 },
  ZYTL: { code: 'ZYTL', name: '大连周水子国际机场', city: '大连', country: 'CN', lat: 38.9657, lon: 121.5375, elevation: 31 },
  ZSNJ: { code: 'ZSNJ', name: '南京禄口国际机场', city: '南京', country: 'CN', lat: 31.7420, lon: 118.8620, elevation: 15 },
  ZSCN: { code: 'ZSCN', name: '南昌昌北国际机场', city: '南昌', country: 'CN', lat: 28.8690, lon: 115.9310, elevation: 43 },
  ZUCK_CKG: { code: 'ZUCK', name: '重庆江北国际机场', city: '重庆', country: 'CN', lat: 29.7192, lon: 106.6417, elevation: 419 },
  KJFK: { code: 'KJFK', name: '纽约肯尼迪国际机场', city: '纽约', country: 'US', lat: 40.6398, lon: -73.7789, elevation: 4 },
  KLAX: { code: 'KLAX', name: '洛杉矶国际机场', city: '洛杉矶', country: 'US', lat: 33.9425, lon: -118.4081, elevation: 39 },
  KORD: { code: 'KORD', name: '芝加哥奥黑尔国际机场', city: '芝加哥', country: 'US', lat: 41.9786, lon: -87.9048, elevation: 204 },
  KSFO: { code: 'KSFO', name: '旧金山国际机场', city: '旧金山', country: 'US', lat: 37.6189, lon: -122.3750, elevation: 4 },
  KDFW: { code: 'KDFW', name: '达拉斯沃斯堡国际机场', city: '达拉斯', country: 'US', lat: 32.8968, lon: -97.0381, elevation: 186 },
  EGLL: { code: 'EGLL', name: '伦敦希思罗机场', city: '伦敦', country: 'UK', lat: 51.4775, lon: -0.4614, elevation: 25 },
  LFPG: { code: 'LFPG', name: '巴黎戴高乐机场', city: '巴黎', country: 'FR', lat: 49.0128, lon: 2.5500, elevation: 119 },
  EDDF: { code: 'EDDF', name: '法兰克福国际机场', city: '法兰克福', country: 'DE', lat: 50.0333, lon: 8.5706, elevation: 112 },
  RJAA: { code: 'RJAA', name: '东京成田国际机场', city: '东京', country: 'JP', lat: 35.7647, lon: 140.3864, elevation: 35 },
  RJTT: { code: 'RJTT', name: '东京羽田国际机场', city: '东京', country: 'JP', lat: 35.5523, lon: 139.7797, elevation: 6 },
  VHHH: { code: 'VHHH', name: '香港国际机场', city: '香港', country: 'HK', lat: 22.3080, lon: 113.9185, elevation: 9 },
  WSSS: { code: 'WSSS', name: '新加坡樟宜机场', city: '新加坡', country: 'SG', lat: 1.3502, lon: 103.9944, elevation: 7 },
  YSSY: { code: 'YSSY', name: '悉尼金斯福德史密斯机场', city: '悉尼', country: 'AU', lat: -33.9461, lon: 151.1772, elevation: 6 },
  CYYZ: { code: 'CYYZ', name: '多伦多皮尔逊国际机场', city: '多伦多', country: 'CA', lat: 43.6767, lon: -79.6306, elevation: 173 },
  UUEE: { code: 'UUEE', name: '莫斯科谢列梅捷沃机场', city: '莫斯科', country: 'RU', lat: 55.9723, lon: 37.4108, elevation: 189 }
};

const airportList = Object.values(airports).filter((v, i, a) => 
  a.findIndex(t => t.code === v.code) === i
);

function findAirport(code) {
  return airportList.find(a => a.code === code) || null;
}

function searchAirports(query) {
  if (!query) return airportList;
  const q = query.toUpperCase();
  return airportList.filter(a => 
    a.code.includes(q) || 
    a.name.toUpperCase().includes(q) || 
    a.city.toUpperCase().includes(q)
  );
}

function getAllAirports() {
  return airportList;
}

module.exports = {
  airports,
  airportList,
  findAirport,
  searchAirports,
  getAllAirports
};
