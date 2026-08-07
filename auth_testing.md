# Auth Testing (JWT Bearer)

Admin login returns a JWT in `access_token` (no cookies). Frontend stores it in
localStorage and sends `Authorization: Bearer <token>`.

## Curl
```
API=https://eurasia-orders-app.preview.emergentagent.com
# login
TOKEN=$(curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@eurasia.com","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
# me
curl -s "$API/api/auth/me" -H "Authorization: Bearer $TOKEN"
# verify staff pin
curl -s -X POST "$API/api/verify-pin" -H "Content-Type: application/json" -d '{"pin":"1234"}'
```

Admin: admin@eurasia.com / admin123
Staff PIN: 1234
