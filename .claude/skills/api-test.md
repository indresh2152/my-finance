---
name: api-test
description: Test REST API endpoints with curl — auth, credit cards, overview
---

**Trigger:** User asks to "test the API", "check an endpoint", or "curl the backend".

Base URL: `http://localhost:4000/api/v1` (same in both dev and container modes)

```bash
# Health / readiness (no auth)
curl http://localhost:4000/health
curl http://localhost:4000/ready

# Login (sets refresh token cookie)
curl -c cookies.txt -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"indresh","password":"s3cret"}'

# Credit cards (use accessToken from login response)
curl -H "Authorization: Bearer <token>" \
  http://localhost:4000/api/v1/credit-cards

# Financial overview
curl -H "Authorization: Bearer <token>" \
  http://localhost:4000/api/v1/overview
```
