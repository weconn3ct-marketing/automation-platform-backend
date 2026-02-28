$BASE = "http://localhost:3000/api"
$headers = @{ "Content-Type" = "application/json" }

Write-Host "`n=== WeConnect Backend API Tests ===" -ForegroundColor Cyan

# 1. Health check
Write-Host "`n[1] GET /health" -ForegroundColor Yellow
$health = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing
Write-Host "Status: $($health.StatusCode)" -ForegroundColor Green
Write-Host $health.Content

# 2. Signup
Write-Host "`n[2] POST /api/auth/signup" -ForegroundColor Yellow
$body = '{"email":"smoke@weconnect.com","password":"password123","firstName":"Smoke","lastName":"Test"}'
try {
    $r = Invoke-WebRequest -Uri "$BASE/auth/signup" -Method POST -Body $body -Headers $headers -UseBasicParsing
    $d = $r.Content | ConvertFrom-Json
    $TOKEN = $d.data.token
    Write-Host "Status: $($r.StatusCode)" -ForegroundColor Green
    Write-Host "User: $($d.data.user.email)"
    Write-Host "Token: $($TOKEN.Substring(0,40))..."
} catch {
    # User may already exist from previous run — try login
    Write-Host "Signup skipped (user exists), trying login..." -ForegroundColor DarkYellow
    $loginBody = '{"email":"smoke@weconnect.com","password":"password123"}'
    $r = Invoke-WebRequest -Uri "$BASE/auth/login" -Method POST -Body $loginBody -Headers $headers -UseBasicParsing
    $d = $r.Content | ConvertFrom-Json
    $TOKEN = $d.data.token
    Write-Host "Login Status: $($r.StatusCode)" -ForegroundColor Green
}

$authHeaders = @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $TOKEN" }

# 3. GET /me
Write-Host "`n[3] GET /api/auth/me" -ForegroundColor Yellow
$me = Invoke-WebRequest -Uri "$BASE/auth/me" -Headers $authHeaders -UseBasicParsing
$meData = $me.Content | ConvertFrom-Json
Write-Host "Status: $($me.StatusCode)" -ForegroundColor Green
Write-Host "Authenticated as: $($meData.data.email)"

# 4. Create Post
Write-Host "`n[4] POST /api/posts" -ForegroundColor Yellow
$postBody = '{"topic":"AI trends 2026","platforms":["instagram","linkedin"],"contentType":"text","tone":"professional"}'
$newPost = Invoke-WebRequest -Uri "$BASE/posts" -Method POST -Body $postBody -Headers $authHeaders -UseBasicParsing
$postData = $newPost.Content | ConvertFrom-Json
$POST_ID = $postData.data.id
Write-Host "Status: $($newPost.StatusCode)" -ForegroundColor Green
Write-Host "Post ID: $POST_ID"
Write-Host "Status: $($postData.data.status)"

# 5. List Posts
Write-Host "`n[5] GET /api/posts" -ForegroundColor Yellow
$posts = Invoke-WebRequest -Uri "$BASE/posts" -Headers $authHeaders -UseBasicParsing
$postsData = $posts.Content | ConvertFrom-Json
Write-Host "Status: $($posts.StatusCode)" -ForegroundColor Green
Write-Host "Total posts: $($postsData.data.pagination.total)"

# 6. Create Connection
Write-Host "`n[6] POST /api/connections" -ForegroundColor Yellow
$connBody = '{"platform":"instagram","accountName":"@test_account","accountId":"IG-TEST-001","accessToken":"test-token-abc123"}'
$conn = Invoke-WebRequest -Uri "$BASE/connections" -Method POST -Body $connBody -Headers $authHeaders -UseBasicParsing
$connData = $conn.Content | ConvertFrom-Json
Write-Host "Status: $($conn.StatusCode)" -ForegroundColor Green
Write-Host "Connection ID: $($connData.data.id)"
Write-Host "Platform: $($connData.data.platform)"

# 7. List Connections
Write-Host "`n[7] GET /api/connections" -ForegroundColor Yellow
$conns = Invoke-WebRequest -Uri "$BASE/connections" -Headers $authHeaders -UseBasicParsing
$connsData = $conns.Content | ConvertFrom-Json
Write-Host "Status: $($conns.StatusCode)" -ForegroundColor Green
Write-Host "Total connections: $($connsData.data.Count)"

# 8. Dashboard Analytics
Write-Host "`n[8] GET /api/analytics/dashboard" -ForegroundColor Yellow
$dash = Invoke-WebRequest -Uri "$BASE/analytics/dashboard" -Headers $authHeaders -UseBasicParsing
$dashData = $dash.Content | ConvertFrom-Json
Write-Host "Status: $($dash.StatusCode)" -ForegroundColor Green
Write-Host "Scheduled Posts: $($dashData.data.scheduledPosts)"
Write-Host "Connected Accounts: $($dashData.data.connectedAccounts)"
Write-Host "Total Reach: $($dashData.data.totalReach)"

# 9. 401 Unauthorized check
Write-Host "`n[9] GET /api/posts (no token - should 401)" -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri "$BASE/posts" -UseBasicParsing | Out-Null
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host "Status: $code (Expected 401)" -ForegroundColor Green
}

Write-Host "`n=== ALL TESTS COMPLETE ===" -ForegroundColor Cyan
