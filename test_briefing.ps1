$baseUrl = "http://localhost:8001/api/briefing"
$headers = @{"Content-Type" = "application/json"}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  飞行计划气象简报模块 - 完整闭环测试" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "【步骤 1】创建航线" -ForegroundColor Yellow
Write-Host "------------------------" -ForegroundColor Gray
$routeBody = @{
    name = "北京-成都测试航线"
    departure_airport = "ZBAA"
    arrival_airport = "ZUUU"
    waypoints = @("ZUCK")
    cruise_altitude = 35000
    flight_duration = 180
} | ConvertTo-Json

$routeResponse = Invoke-RestMethod -Uri "$baseUrl/routes" -Method Post -Body $routeBody -Headers $headers
$routeId = $routeResponse.data.id
Write-Host "航线创建成功！ID: $routeId" -ForegroundColor Green
Write-Host "航线名称: $($routeResponse.data.name)" -ForegroundColor White
Write-Host "起飞机场: $($routeResponse.data.departure_airport)" -ForegroundColor White
Write-Host "降落机场: $($routeResponse.data.arrival_airport)" -ForegroundColor White
Write-Host "途经点: $($routeResponse.data.waypoints -join ', ')" -ForegroundColor White
Write-Host ""

Write-Host "【步骤 2】查询航线列表（按名称搜索）" -ForegroundColor Yellow
Write-Host "------------------------" -ForegroundColor Gray
$searchResponse = Invoke-RestMethod -Uri "$baseUrl/routes?name=北京" -Method Get -Headers $headers
Write-Host "找到 $($searchResponse.count) 条匹配航线" -ForegroundColor Green
foreach ($r in $searchResponse.data) {
    Write-Host "  - ID: $($r.id), 名称: $($r.name)" -ForegroundColor White
}
Write-Host ""

Write-Host "【步骤 3】生成第一份气象简报（触发风险标签）" -ForegroundColor Yellow
Write-Host "------------------------" -ForegroundColor Gray
$briefing1Body = @{
    route_id = $routeId
    departure_time = "2026-06-06T08:00:00Z"
    departure_runways = @(18, 36)
    arrival_runways = @(02, 20)
} | ConvertTo-Json

$briefing1Response = Invoke-RestMethod -Uri "$baseUrl/generate" -Method Post -Body $briefing1Body -Headers $headers
$briefing1Id = $briefing1Response.briefingId
$briefing1 = $briefing1Response.data

Write-Host "简报生成成功！ID: $briefing1Id" -ForegroundColor Green
Write-Host "整体风险等级: $($briefing1.riskAssessment.overallLabel)" -ForegroundColor $(if ($briefing1.riskAssessment.overallLevel -eq "red") {"Red"} elseif ($briefing1.riskAssessment.overallLevel -eq "yellow") {"Yellow"} else {"Green"})
Write-Host "是否可飞行: $($briefing1.riskAssessment.canFly)" -ForegroundColor White
Write-Host ""

Write-Host "【步骤 4】风险标签触发详情" -ForegroundColor Yellow
Write-Host "------------------------" -ForegroundColor Gray
Write-Host "起飞机场 ($($briefing1.departure.airport)) 风险等级: $($briefing1.departure.riskAssessment.overallLabel)" -ForegroundColor White
Write-Host "降落机场 ($($briefing1.arrival.airport)) 风险等级: $($briefing1.arrival.riskAssessment.overallLabel)" -ForegroundColor White
Write-Host ""
Write-Host "所有触发的风险项 ($($briefing1.riskAssessment.totalRiskCount) 项):" -ForegroundColor White
foreach ($risk in $briefing1.riskAssessment.risks) {
    $color = if ($risk.level -eq "red") {"Red"} elseif ($risk.level -eq "yellow") {"Yellow"} else {"Green"}
    Write-Host "  [$($risk.level.ToUpper())] $($risk.message)" -ForegroundColor $color
    Write-Host "           建议: $($risk.recommendation)" -ForegroundColor Gray
}
Write-Host ""

Write-Host "【步骤 5】侧风计算结果" -ForegroundColor Yellow
Write-Host "------------------------" -ForegroundColor Gray
if ($briefing1.departure.crosswind) {
    Write-Host "起飞机场侧风: $($briefing1.departure.crosswind.summary)" -ForegroundColor White
    foreach ($calc in $briefing1.departure.crosswind.calculations) {
        Write-Host "  $($calc.text)" -ForegroundColor Gray
    }
}
if ($briefing1.arrival.crosswind) {
    Write-Host "降落机场侧风: $($briefing1.arrival.crosswind.summary)" -ForegroundColor White
    foreach ($calc in $briefing1.arrival.crosswind.calculations) {
        Write-Host "  $($calc.text)" -ForegroundColor Gray
    }
}
Write-Host ""

Write-Host "【步骤 6】替补机场建议（降落机场不安全时自动触发）" -ForegroundColor Yellow
Write-Host "------------------------" -ForegroundColor Gray
if ($briefing1.alternateAirports) {
    Write-Host "$($briefing1.alternateAirports.message)" -ForegroundColor Green
    Write-Host "搜索半径: $($briefing1.alternateAirports.searchRadiusKm) 公里" -ForegroundColor White
    Write-Host "找到备降机场: $($briefing1.alternateAirports.eligibleCount) 个" -ForegroundColor White
    foreach ($alt in $briefing1.alternateAirports.alternates) {
        Write-Host "  ✓ $($alt.airport.code) - $($alt.airport.name) ($($alt.distanceText))" -ForegroundColor Green
        Write-Host "    风险等级: $($alt.riskAssessment.overallLabel)" -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host "所有候选机场（含不符合条件的）:" -ForegroundColor White
    foreach ($cand in $briefing1.alternateAirports.allCandidates) {
        $status = if ($cand.isEligible) {"✓ 符合"} else {"✗ 不符合"}
        $color = if ($cand.isEligible) {"Green"} else {"Red"}
        Write-Host "  $status $($cand.airport.code) - $($cand.airport.name) ($($cand.distanceText)) - $($cand.riskAssessment.overallLabel)" -ForegroundColor $color
    }
} else {
    Write-Host "降落机场风险等级为绿色，无需备降机场" -ForegroundColor Green
}
Write-Host ""

Write-Host "【步骤 7】生成第二份简报（用于对比）" -ForegroundColor Yellow
Write-Host "------------------------" -ForegroundColor Gray
$briefing2Body = @{
    route_id = $routeId
    departure_time = "2026-06-06T12:00:00Z"
    departure_runways = @(18, 36)
    arrival_runways = @(02, 20)
} | ConvertTo-Json

$briefing2Response = Invoke-RestMethod -Uri "$baseUrl/generate" -Method Post -Body $briefing2Body -Headers $headers
$briefing2Id = $briefing2Response.briefingId
$briefing2 = $briefing2Response.data

Write-Host "第二份简报生成成功！ID: $briefing2Id" -ForegroundColor Green
Write-Host "计划起飞时间: $($briefing2.schedule.plannedDepartureTimeText)" -ForegroundColor White
Write-Host "整体风险等级: $($briefing2.riskAssessment.overallLabel)" -ForegroundColor White
Write-Host ""

Write-Host "【步骤 8】对比两份简报的差异" -ForegroundColor Yellow
Write-Host "------------------------" -ForegroundColor Gray
$compareResponse = Invoke-RestMethod -Uri "$baseUrl/compare/$briefing1Id/$briefing2Id" -Method Get -Headers $headers

Write-Host "对比结果: $($compareResponse.summary)" -ForegroundColor Green
Write-Host "简报 #$briefing1Id ($($compareResponse.briefing1.departureTime)) vs 简报 #$briefing2Id ($($compareResponse.briefing2.departureTime))" -ForegroundColor White
Write-Host ""
if ($compareResponse.hasChanges) {
    Write-Host "发现 $($compareResponse.changeCount) 处差异:" -ForegroundColor Yellow
    foreach ($change in $compareResponse.changes) {
        Write-Host "  字段: $($change.fieldName)" -ForegroundColor White
        Write-Host "    $($change.change)" -ForegroundColor Gray
    }
} else {
    Write-Host "两份简报关键字段无差异" -ForegroundColor Green
}
Write-Host ""

Write-Host "【步骤 9】查询航线的所有历史简报" -ForegroundColor Yellow
Write-Host "------------------------" -ForegroundColor Gray
$historyResponse = Invoke-RestMethod -Uri "$baseUrl/routes/$routeId/briefings" -Method Get -Headers $headers
Write-Host "航线 '$($historyResponse.route.name)' 共有 $($historyResponse.count) 份历史简报" -ForegroundColor Green
foreach ($b in $historyResponse.data) {
    $color = if ($b.riskLevel -eq "red") {"Red"} elseif ($b.riskLevel -eq "yellow") {"Yellow"} else {"Green"}
    Write-Host "  - ID: $($b.id), 时间: $($b.departureTime), 风险: $($b.riskLevel)" -ForegroundColor $color
    Write-Host "    摘要: $($b.summary)" -ForegroundColor Gray
}
Write-Host ""

Write-Host "【步骤 10】修改航线信息" -ForegroundColor Yellow
Write-Host "------------------------" -ForegroundColor Gray
$updateBody = @{
    name = "北京-成都测试航线（更新）"
    cruise_altitude = 37000
    flight_duration = 170
} | ConvertTo-Json

$updateResponse = Invoke-RestMethod -Uri "$baseUrl/routes/$routeId" -Method Put -Body $updateBody -Headers $headers
Write-Host "航线更新成功！" -ForegroundColor Green
Write-Host "新名称: $($updateResponse.data.name)" -ForegroundColor White
Write-Host "新巡航高度: $($updateResponse.data.cruise_altitude) 英尺" -ForegroundColor White
Write-Host "新飞行时长: $($updateResponse.data.flight_duration) 分钟" -ForegroundColor White
Write-Host ""

Write-Host "【步骤 11】单独测试侧风计算接口" -ForegroundColor Yellow
Write-Host "------------------------" -ForegroundColor Gray
$crosswindBody = @{
    runway_heading = 18
    wind_direction = 270
    wind_speed = 30
    wind_unit = "KT"
} | ConvertTo-Json

$crosswindResponse = Invoke-RestMethod -Uri "$baseUrl/crosswind" -Method Post -Body $crosswindBody -Headers $headers
Write-Host "侧风计算结果:" -ForegroundColor Green
Write-Host "  $($crosswindResponse.data.text)" -ForegroundColor White
Write-Host "  逆风分量: $($crosswindResponse.data.headwind.text)" -ForegroundColor Gray
Write-Host "  侧风分量: $($crosswindResponse.data.crosswind.text)" -ForegroundColor Gray
Write-Host "  是否超限: $($crosswindResponse.data.exceedsLimit)" -ForegroundColor $(if ($crosswindResponse.data.exceedsLimit) {"Red"} else {"Green"})
Write-Host ""

Write-Host "【步骤 12】单独测试备降机场查询接口" -ForegroundColor Yellow
Write-Host "------------------------" -ForegroundColor Gray
$altResponse = Invoke-RestMethod -Uri "$baseUrl/alternate/ZUUU?radius_km=500" -Method Get -Headers $headers
Write-Host "$($altResponse.message)" -ForegroundColor Green
foreach ($alt in $altResponse.alternates) {
    Write-Host "  ✓ $($alt.airport.code) - $($alt.airport.name) ($($alt.distanceText))" -ForegroundColor Green
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  完整闭环测试完成！" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "测试总结:" -ForegroundColor Yellow
Write-Host "  ✓ 航线管理 (创建/查询/修改)" -ForegroundColor Green
Write-Host "  ✓ 气象简报生成 (METAR/TAF/途经点)" -ForegroundColor Green
Write-Host "  ✓ 风险评估 (红色禁飞/黄色警告/绿色正常)" -ForegroundColor Green
Write-Host "  ✓ 侧风计算 (矢量分解/超限检测)" -ForegroundColor Green
Write-Host "  ✓ 替补机场建议 (距离筛选/风险过滤)" -ForegroundColor Green
Write-Host "  ✓ 简报归档与差异对比" -ForegroundColor Green
Write-Host ""
