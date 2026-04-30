# Mobile device session & Transfer In locks — API for the mobile app

Use the **same API base URL** as today (no path change to the root):

| Item | Value |
|------|--------|
| **API base** | `http://YOUR_SERVER:3000` — no trailing slash; **do not** end with `/api` only (use full paths below). |
| **Login** | `POST {API_BASE}/api/auth/login` |
| **Session (settings / status)** | `GET {API_BASE}/api/auth/session` |
| **Logout (full mobile logout)** | `POST {API_BASE}/api/auth/logout` |
| **List devices (admin)** | `GET {API_BASE}/api/auth/admin/devices?status=pending` |
| **Approve device (admin)** | `POST {API_BASE}/api/auth/admin/devices/{deviceId}/approve` |
| **Disable device (admin)** | `POST {API_BASE}/api/auth/admin/devices/{deviceId}/disable` |

Replace `YOUR_SERVER` with your host (e.g. `192.168.103.219` or `localhost`).

**Headers (except login):**

```http
Content-Type: application/json
Authorization: Bearer <access_token>
```

---

## 1) Login — desktop (unchanged)

**URL:** `POST http://YOUR_SERVER:3000/api/auth/login`

**JSON:**

```json
{
  "user_code": "sysadmin",
  "password": "123456"
}
```

**Response (example):** `data.client_type` is `"desktop"`; no `device_status` requirement.

---

## 2) Login — mobile (required shape)

**URL:** `POST http://YOUR_SERVER:3000/api/auth/login`

**JSON (minimum):**

```json
{
  "user_code": "sysadmin",
  "password": "123456",
  "client_type": "mobile",
  "device_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Optional:** friendly label for admins:

```json
{
  "user_code": "sysadmin",
  "password": "123456",
  "client_type": "mobile",
  "device_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "device_label": "Warehouse tablet 3"
}
```

**Rules:**

- `device_id`: stable UUID string, **same value every launch** (store in secure storage after first generate).
- `client_type`: `"mobile"` (recommended). If you send `device_id` and **not** `client_type: "desktop"`, the server treats it as mobile.
- If `client_type` is `"mobile"` and `device_id` is missing → **400**.

**Success response (example):**

```json
{
  "ok": true,
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "expires_in": 604800,
    "client_type": "mobile",
    "device_status": "pending",
    "user": {
      "user_code": "sysadmin",
      "name": "Administrator"
    }
  }
}
```

- `device_status`: `"pending"` until an admin approves the device; then `"approved"` (checked on each request; user can stay logged in after approval without a new login).
- **`pending`:** only `GET /api/auth/session` and `POST /api/auth/logout` are allowed until the device is approved.

**Already logged in on another phone (409):**

```json
{
  "ok": false,
  "success": false,
  "error": {
    "code": "AUTH_SESSION_EXISTS",
    "message": "This user is already logged in on another mobile device. Log out there first.",
    "active_device_id": "other-device-uuid-here"
  }
}
```

**Disabled device (403):** `error.code` = `DEVICE_DISABLED`.

---

## 3) Session — for “settings only” UI when pending

**URL:** `GET http://YOUR_SERVER:3000/api/auth/session`

**JSON body:** none.

**Example response:**

```json
{
  "ok": true,
  "data": {
    "user_code": "sysadmin",
    "client_type": "mobile",
    "device_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "device_status": "pending",
    "session_active": true
  }
}
```

Use `device_status` and `session_active` to drive menus (hide everything except settings until `device_status === "approved"`).

---

## 4) Logout — end mobile session and release carton locks

**URL:** `POST http://YOUR_SERVER:3000/api/auth/logout`

**JSON body:** `{}` (empty object is fine).

**Response (mobile):**

```json
{ "ok": true, "success": true }
```

**Response (desktop token):** still `200`; message indicates no mobile session to revoke.

After logout, discard `access_token` locally. User can then log in on another approved device.

---

## 5) List registered devices (admin — used by WMS Desktop “Mobile devices” tab)

**URL:** `GET http://YOUR_SERVER:3000/api/auth/admin/devices?status=pending`

Query **`status`:** `pending` (default), `approved`, `disabled`, or `all`.

**Header:** `Authorization: Bearer <admin_access_token>`

**Example response:**

```json
{
  "ok": true,
  "data": {
    "devices": [
      {
        "device_id": "11111111-2222-3333-4444-555555555555",
        "status": "pending",
        "label": "Test phone",
        "created_at": "2026-04-23T12:00:00.000Z",
        "approved_at": null
      }
    ]
  }
}
```

---

## 6) Approve device (admin from desktop or any approved client)

Approves **`pending`** devices, or **re-enables** a previously **`disabled`** device (sets status back to `approved`).

**URL:** `POST http://YOUR_SERVER:3000/api/auth/admin/devices/{deviceId}/approve`

Example: device id `a1b2c3d4-e5f6-7890-abcd-ef1234567890`

`POST http://YOUR_SERVER:3000/api/auth/admin/devices/a1b2c3d4-e5f6-7890-abcd-ef1234567890/approve`

**JSON body:** `{}`

Requires **admin** user (server checks role / user_code — e.g. `sysadmin`, or role containing `admin` / `system`).

**Example response:**

```json
{
  "ok": true,
  "data": {
    "device_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "approved": true
  }
}
```

---

## 7) Disable device (admin — revokes sessions, blocks device)

**URL:** `POST http://YOUR_SERVER:3000/api/auth/admin/devices/{deviceId}/disable`

**JSON body:** `{}`

**Header:** `Authorization: Bearer <admin_access_token>`

Sets status to **`disabled`**, revokes all active mobile sessions for that `device_id`, and removes carton locks held by those sessions. If the device was already disabled, returns success with `disabled: false`.

**Example response:**

```json
{
  "ok": true,
  "data": {
    "device_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "disabled": true
  }
}
```

To allow a **disabled** device again, use **Approve** (same endpoint as for pending) — it sets status to `approved` for rows in `pending` or `disabled`.

---

## 8) Transfer In receive-line (unchanged URL; include `carton_id` for lock)

**URL:** `POST http://YOUR_SERVER:3000/api/transfer-in/{TITLE}/receive-line`

Use the **mobile** token from login. When `carton_id` is sent, the server ties the carton to this session until close/complete/logout.

**Example JSON (receive by carton):**

```json
{
  "carton_id": "CTN-TI-0001-01",
  "received_by": "sysadmin"
}
```

**409 if another session holds the carton:**

```json
{
  "ok": false,
  "error": {
    "code": "CARTON_LOCKED",
    "message": "This carton is being received by another active session.",
    "locked_by": {
      "session_jti": "...",
      "user_code": "OTHER_USER"
    }
  }
}
```

---

## Scripts (copy-paste)

Set your base once:

```bash
# bash / Git Bash
export API=http://YOUR_SERVER:3000
```

**PowerShell:**

```powershell
$API = "http://YOUR_SERVER:3000"
```

### A) Mobile login → save token (PowerShell)

```powershell
$API = "http://192.168.103.219:3000"
$body = @{
  user_code = "sysadmin"
  password  = "123456"
  client_type = "mobile"
  device_id = "11111111-2222-3333-4444-555555555555"
  device_label = "Test phone"
} | ConvertTo-Json

$r = Invoke-RestMethod -Uri "$API/api/auth/login" -Method Post -ContentType "application/json" -Body $body
$token = $r.data.access_token
$r.data | ConvertTo-Json
```

### B) Session (PowerShell)

```powershell
Invoke-RestMethod -Uri "$API/api/auth/session" -Method Get -Headers @{ Authorization = "Bearer $token" }
```

### C) Logout (PowerShell)

```powershell
Invoke-RestMethod -Uri "$API/api/auth/logout" -Method Post -ContentType "application/json" -Body "{}" -Headers @{ Authorization = "Bearer $token" }
```

### D) Approve device (PowerShell, admin token in `$adminToken`)

```powershell
$deviceId = "11111111-2222-3333-4444-555555555555"
Invoke-RestMethod -Uri "$API/api/auth/admin/devices/$deviceId/approve" -Method Post -ContentType "application/json" -Body "{}" -Headers @{ Authorization = "Bearer $adminToken" }
```

### E) curl (bash) — mobile login

```bash
API=http://192.168.103.219:3000
curl -sS -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"user_code":"sysadmin","password":"123456","client_type":"mobile","device_id":"11111111-2222-3333-4444-555555555555"}'
```

### F) curl — session + logout

```bash
TOKEN="paste_access_token_here"
curl -sS "$API/api/auth/session" -H "Authorization: Bearer $TOKEN"
curl -sS -X POST "$API/api/auth/logout" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}'
```

---

## Dev shortcut: auto-approve new devices

On the **API server**, set environment variable then restart:

`WMS_AUTO_APPROVE_DEVICES=1`

New `device_id` rows become **approved** immediately (good for development only).

---

## Mobile app checklist

1. On first install, create `device_id` = UUID v4; persist in secure storage.
2. **Login:** always send `client_type` + `device_id` + `user_code` + `password`.
3. Store `data.access_token`; send `Authorization: Bearer …` on all APIs.
4. If **409** `AUTH_SESSION_EXISTS`, show message and `active_device_id`; do not navigate to main app until user logs out the other device.
5. If **403** `DEVICE_PENDING_APPROVAL`, show “waiting for admin”; only call **session** + **logout**.
6. On user **full logout**, call **`POST /api/auth/logout`** then clear token locally.
7. After server marks device **approved**, next API call (or `GET /session`) sees `device_status: "approved"` — enable full menus without forcing re-login.
