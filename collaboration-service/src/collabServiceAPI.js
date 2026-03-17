```
Base URL: http://localhost:3003

POST   /sessions                 Create collaboration room (Matching Service)
GET    /sessions/active          Get caller's active session [auth]
GET    /sessions/:sessionId      Get session by ID [auth, must be participant]
PATCH  /sessions/:sessionId/end  End a session [auth, must be participant]

[auth] = requires Authorization: Bearer <token> header