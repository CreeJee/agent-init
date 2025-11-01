# Backend API Specification

## Base URL

```
Development: http://localhost:3000/api
Production: https://api.example.com
```

## Authentication

All API endpoints require JWT authentication via the `Authorization` header:

```
Authorization: Bearer <access_token>
```

## Endpoints

### User Authentication

#### POST /auth/signup

Create a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe",
  "team_id": "engineering"
}
```

**Response:**
```json
{
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "name": "John Doe",
    "team_id": "engineering"
  },
  "tokens": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  }
}
```

#### POST /auth/login

Authenticate and receive tokens.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "tokens": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  }
}
```

#### POST /auth/refresh

Refresh access token using refresh token.

**Request:**
```json
{
  "refreshToken": "eyJhbGc..."
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGc..."
}
```

### Context Documents

#### GET /api/context/:team/:file

Retrieve a context document.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```markdown
# Document Content

...
```

#### PUT /api/context/:team/:file

Update or create a context document.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```markdown
# Updated Document Content

...
```

**Response:**
```json
{
  "success": true,
  "team": "BE",
  "file": "api-spec.md",
  "message": "Document updated successfully"
}
```

## Error Responses

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "Missing required permission: write:docs"
}
```

### 404 Not Found
```json
{
  "error": "Not Found",
  "message": "Document BE/api-spec.md not found"
}
```

## Rate Limiting

- 100 requests per minute per user
- 429 Too Many Requests returned when exceeded

## Versioning

API version is included in the URL path:

```
/api/v1/...
```

Current version: v1
