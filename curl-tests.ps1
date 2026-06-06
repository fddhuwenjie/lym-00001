# 航空气象电报 API 测试脚本 (PowerShell)
# 使用方法: 先启动服务 (npm start)，然后在另一个终端运行: .\curl-tests.ps1

$baseUrl = "http://localhost:8001"
$headers = @{"Content-Type" = "application/json"}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "航空气象电报 API 测试" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 测试 1: 服务健康检查
Write-Host "测试 1: 服务健康检查" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/" -Method Get
    Write-Host "  ✅ 服务运行正常" -ForegroundColor Green
    Write-Host "     名称: $($response.name)"
    Write-Host "     版本: $($response.version)"
} catch {
    Write-Host "  ❌ 服务未启动，请先运行 npm start" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 测试 2: METAR 解码 - 北京首都
Write-Host "测试 2: METAR 解码 - 北京首都 (含温度负数M前缀)" -ForegroundColor Yellow
$body = @{
    raw = "METAR ZBAA 060800Z 18005MPS 9999 FEW040 BKN120 25/M10 Q1015 NOSIG"
} | ConvertTo-Json
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/decode/metar" -Method Post -Body $body -Headers $headers
    Write-Host "  ✅ 解码成功" -ForegroundColor Green
    Write-Host "     机场: $($response.airport.code)"
    Write-Host "     温度: $($response.temperature.text) (raw: $($response.temperature.raw))"
    Write-Host "     露点: $($response.dewPoint.text) (raw: $($response.dewPoint.raw))"
    Write-Host "     风: $($response.wind.text)"
    Write-Host "     能见度: $($response.visibility.text)"
    Write-Host "     气压: $($response.pressure.text)"
    Write-Host "     云组: $($response.clouds.Count) 层"
} catch {
    Write-Host "  ❌ 解码失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 测试 3: METAR 解码 - 上海浦东 (CAVOK + KT 单位)
Write-Host "测试 3: METAR 解码 - 上海浦东 (CAVOK + KT 单位)" -ForegroundColor Yellow
$body = @{
    raw = "METAR COR ZSPD 060730Z AUTO 31015G25KT CAVOK 30/22 Q1008 BECMG 0800/0802 27010KT"
} | ConvertTo-Json
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/decode/metar" -Method Post -Body $body -Headers $headers
    Write-Host "  ✅ 解码成功" -ForegroundColor Green
    Write-Host "     CAVOK: $($response.visibility.cavok)"
    Write-Host "     风速单位: $($response.wind.speed.unit)"
    Write-Host "     阵风: $($response.wind.gust.text)"
    Write-Host "     修正报: $($response.correction)"
    Write-Host "     自动观测: $($response.automatic)"
    Write-Host "     趋势段: $($response.trends.Count) 段"
} catch {
    Write-Host "  ❌ 解码失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 测试 4: TAF 解码 - 北京首都 (跨日时段)
Write-Host "测试 4: TAF 解码 - 北京首都 (跨日时段)" -ForegroundColor Yellow
$body = @{
    raw = "TAF ZBAA 060500Z 0606/0712 20008MPS 9999 SCT050 BECMG 0620/0622 30005MPS BKN030 TEMPO 0700/0706 3000 BR SCT010"
} | ConvertTo-Json
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/decode/taf" -Method Post -Body $body -Headers $headers
    Write-Host "  ✅ 解码成功" -ForegroundColor Green
    Write-Host "     有效时段: $($response.validPeriod.text)"
    Write-Host "     跨日: $($response.validPeriod.crossDay)"
    Write-Host "     变化段数: $($response.changeGroups.Count)"
    $response.changeGroups | ForEach-Object {
        Write-Host "       - $($_.typeText): $($_.period.text)"
    }
} catch {
    Write-Host "  ❌ 解码失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 测试 5: 反向编码 - METAR 往返测试
Write-Host "测试 5: 反向编码 - METAR 往返一致测试" -ForegroundColor Yellow
$originalRaw = "METAR ZBAA 060800Z 18005MPS 9999 25/M10 Q1015 NOSIG"
$body1 = @{ raw = $originalRaw; archive = $false } | ConvertTo-Json
try {
    $decoded = Invoke-RestMethod -Uri "$baseUrl/api/decode/metar" -Method Post -Body $body1 -Headers $headers
    $body2 = @{ data = $decoded } | ConvertTo-Json -Depth 10
    $encoded = Invoke-RestMethod -Uri "$baseUrl/api/encode/metar" -Method Post -Body $body2 -Headers $headers
    Write-Host "  ✅ 编码成功" -ForegroundColor Green
    Write-Host "     原始: $originalRaw"
    Write-Host "     编码: $($encoded.encoded)"
    $body3 = @{ raw = $encoded.encoded; archive = $false } | ConvertTo-Json
    $reDecoded = Invoke-RestMethod -Uri "$baseUrl/api/decode/metar" -Method Post -Body $body3 -Headers $headers
    if ($reDecoded.success) {
        Write-Host "  ✅ 往返一致 ✓" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  往返解码失败" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ❌ 测试失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 测试 6: 批量校验
Write-Host "测试 6: 批量校验" -ForegroundColor Yellow
$messages = @(
    "METAR ZBAA 060800Z 18005MPS 9999 25/10 Q1015",
    "METAR ZSPD 060730Z 31015G25KT CAVOK 30/22 Q1008",
    "METAR ZZZZ 060800Z 18005MPS 9999 25/10 Q1015",
    "INVALID MESSAGE",
    "TAF ZGGG 060500Z 0606/0712 20008MPS 9999 SCT050"
)
$body = @{ messages = $messages } | ConvertTo-Json
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/validate/batch" -Method Post -Body $body -Headers $headers
    Write-Host "  ✅ 校验完成" -ForegroundColor Green
    Write-Host "     总计: $($response.total) | 合法: $($response.valid) | 非法: $($response.invalid)"
    Write-Host "     错误: $($response.totalErrors) | 警告: $($response.totalWarnings)"
    $response.results | ForEach-Object {
        $status = if ($_.valid) { "✅" } else { "❌" }
        Write-Host "     [$($_.index)] $status $($_.type) - $($_.raw.Substring(0, 50))..."
        if ($_.errors.Count -gt 0) {
            $_.errors | ForEach-Object { Write-Host "          错误: $($_.message)" }
        }
    }
} catch {
    Write-Host "  ❌ 校验失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 测试 7: 机场查询
Write-Host "测试 7: 机场查询" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/airports/ZBAA" -Method Get
    Write-Host "  ✅ 查询成功" -ForegroundColor Green
    Write-Host "     代码: $($response.data.code)"
    Write-Host "     名称: $($response.data.name)"
    Write-Host "     城市: $($response.data.city)"
    Write-Host "     坐标: $($response.data.lat), $($response.data.lon)"
    
    Write-Host ""
    Write-Host "  搜索 '北京':"
    $search = Invoke-RestMethod -Uri "$baseUrl/api/airports?q=北京" -Method Get
    Write-Host "     找到 $($search.count) 个机场"
    $search.data | ForEach-Object { Write-Host "       - $($_.code): $($_.name)" }
} catch {
    Write-Host "  ❌ 查询失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 测试 8: 历史归档查询
Write-Host "测试 8: 历史归档与对比" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/history/ZBAA?limit=10" -Method Get
    Write-Host "  ✅ 查询成功" -ForegroundColor Green
    Write-Host "     找到 $($response.count) 条历史记录"
    
    if ($response.count -ge 2) {
        $compare = Invoke-RestMethod -Uri "$baseUrl/api/history/compare/ZBAA" -Method Get
        Write-Host ""
        Write-Host "  电报对比:"
        Write-Host "     机场: $($compare.airport)"
        Write-Host "     变化项数: $($compare.changeCount)"
        $compare.changes | ForEach-Object {
            Write-Host "       - $($_.fieldName): $($_.change)"
        }
    }
} catch {
    Write-Host "  ⚠️  查询失败 (可能是新数据库无数据): $($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Host ""

# 测试 9: 统计信息
Write-Host "测试 9: 统计信息" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/stats" -Method Get
    Write-Host "  ✅ 获取成功" -ForegroundColor Green
    Write-Host "     总记录数: $($response.data.total)"
    Write-Host "     METAR: $($response.data.metarCount)"
    Write-Host "     TAF: $($response.data.tafCount)"
    Write-Host "     机场数: $($response.data.airportCount)"
} catch {
    Write-Host "  ❌ 获取失败: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "所有测试完成!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
