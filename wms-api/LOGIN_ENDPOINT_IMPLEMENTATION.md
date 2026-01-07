# Login Endpoint Implementation

## ✅ Implementation Complete

The login endpoint has been implemented at `POST /api/auth/login`

### Endpoint Details

**URL:** `POST /api/auth/login`

**Request Body:**
```json
{
  "user_code": "USER-172188",
  "password": "password123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 604800,
    "user": {
      "user_code": "USER-172188",
      "name": "John Doe"
    }
  }
}
```

**Error Response (400/401):**
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR" | "AUTH_INVALID",
    "message": "Error message"
  }
}
```

### Database Requirements

The endpoint queries the `tabUser` table:
- `user_code` - User identifier (unique)
- `name` - User display name
- `password_hash` - Password hash (optional for development)
- `role` - User role
- `active` - Whether user is active (must be 1/true)

### Password Handling

**Development Mode:**
- If `password_hash` is NULL or empty, any password is accepted
- This allows testing without setting up password hashes

**Production Mode:**
- Password hash must exist
- Currently supports SHA256 hashes
- TODO: Implement bcrypt for production use

### Testing

#### Test with cURL:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "user_code": "USER-172188",
    "password": "password123"
  }'
```

#### Test with Postman:
1. Method: POST
2. URL: `http://localhost:3000/api/auth/login`
3. Headers: `Content-Type: application/json`
4. Body (raw JSON):
```json
{
  "user_code": "USER-172188",
  "password": "password123"
}
```

### Creating Test Users

To create a test user in the database:

```sql
INSERT INTO tabUser (user_code, name, password_hash, role, active)
VALUES ('USER-172188', 'John Doe', NULL, 'operator', 1);
```

For development, if `password_hash` is NULL, any password will be accepted.

For production, hash the password:
```sql
-- Using SHA256 (simple, not recommended for production)
INSERT INTO tabUser (user_code, name, password_hash, role, active)
VALUES ('USER-172188', 'John Doe', SHA2('password123', 256), 'operator', 1);
```

### Security Notes

⚠️ **Important for Production:**
1. Implement bcrypt for password hashing
2. Remove development mode password bypass
3. Use strong JWT_SECRET in `.env`
4. Enable HTTPS
5. Implement rate limiting for login attempts

### Files Created/Modified

1. ✅ `wms-api/src/modules/auth/authController.js` - Login controller
2. ✅ `wms-api/src/routes/authRoutes.js` - Auth routes
3. ✅ `wms-api/src/routes/index.js` - Registered auth routes

### Next Steps

1. **Test the endpoint** with a test user
2. **Create test users** in database if needed
3. **Update mobile app** to use the correct endpoint URL
4. **Verify JWT token** works with other protected endpoints

