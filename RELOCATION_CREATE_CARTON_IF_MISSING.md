# Relocation: Create carton if missing

## When you see this error

**"Target carton 'CTN-xxxxx' does not exist. Please scan an existing carton or enable create_carton_if_missing."**

This happens when the **mobile app** (RelocationExecute) completes a relocation and the **destination (target) carton** does not yet exist in the system.

## How to enable it

The option is **not** a server-wide setting. The **client** that calls the API must send a parameter in the request.

### Mobile app (RelocationExecute)

The mobile app uses the **one-shot** endpoint:

- **POST** `/api/relocation/complete-partial`

That endpoint accepts a body parameter:

- **`create_carton_if_missing`** (boolean): when `true`, the API will **create the target carton** if it does not exist, then complete the relocation.

So you **do need to enable it from the mobile app**, by having the app send this in the request body:

```json
{
  "mode": "CARTON_TO_CARTON",
  "warehouse_id": "...",
  "from_bin": "...",
  "from_carton": "...",
  "to_bin": "...",
  "to_carton": "CTN-555445",
  "lines": [ { "item_code": "...", "qty": 10 } ],
  "user_id": "...",
  "create_carton_if_missing": true
}
```

**Ways to enable it in the mobile app:**

1. **Option A – Always create if missing**  
   In the mobile app code that builds the request for `POST /api/relocation/complete-partial`, add:
   - `create_carton_if_missing: true`  
   so every call allows creating the target carton when it does not exist.

2. **Option B – User setting**  
   Add a setting or checkbox in the RelocationExecute screen (e.g. “Create carton if missing”). When the user enables it, include `create_carton_if_missing: true` in the same request body. When disabled, omit it or set it to `false`.

### Desktop app (session-based flow)

The desktop app uses:

- **POST** `/api/relocation/session/:session_id/commit-partial`

That **session-based** endpoint **already creates the target carton** if it is missing; no extra parameter is needed. So the “create carton if missing” behaviour is only required for the **mobile** flow that uses **complete-partial**.

## Summary

| Client   | Endpoint                          | Create carton if missing |
|----------|-----------------------------------|---------------------------|
| Mobile   | POST /api/relocation/complete-partial | Send `create_carton_if_missing: true` in body |
| Desktop  | POST /api/relocation/session/:id/commit-partial | Done automatically by API |

**Yes, it is required to enable from the mobile app** (by sending `create_carton_if_missing: true` in the request body). There is no server-side global switch; the API only creates the carton when the client sends this flag for the complete-partial flow.
