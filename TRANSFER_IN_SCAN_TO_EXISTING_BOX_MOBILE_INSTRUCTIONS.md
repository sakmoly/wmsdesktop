# Transfer In Putaway – Scan to Existing Box (Option B: User Chooses)

Instructions for the **Mobile App** so the user can choose whether to allow scanning to an existing box when it is not yet linked to the Transfer In.

---

## 1. API behaviour (reference)

- **Endpoint:** `POST /api/transfer-in/:title/validate-carton`
- **Body:**
  - `box_id` or `carton_id` (required) – scanned carton ID
  - `create_carton_if_missing` (optional, boolean) – when `true`, if the box exists in the system but is not in this Transfer In, the API adds it and validation succeeds.

If the box is not in the Transfer In and the app does **not** send `create_carton_if_missing: true`, the API returns **404** with code `BOX_NOT_FOUND`.

---

## 2. UI: “Use existing box” option

### 2.1 Where to show it

- On the **Transfer In Putaway** screen where the user scans the **box/carton** (before or after the first scan).
- Recommended: show a **toggle** or **checkbox** that the user can turn on when they want to “scan to an existing box”.

### 2.2 Labels (pick one set)

- **Toggle:** `Use existing box` (short) or `Allow scanning to existing box (not yet linked to this Transfer In)`
- **Checkbox:** `Scan to existing box` or `Link this box to Transfer In if not already linked`

Use the short label for the main control; you can add a short help text or tooltip with the longer explanation.

### 2.3 Default state

- **Default: OFF** – `create_carton_if_missing` is not sent (or send `false`).
- User turns it **ON** only when they intend to scan a box that may already exist in the warehouse but is not yet linked to this Transfer In.

---

## 3. Request body logic

When calling validate-carton:

- **If “Use existing box” is OFF:**  
  Send only `box_id` (or `carton_id`).
- **If “Use existing box” is ON:**  
  Send `box_id` (or `carton_id`) **and** `create_carton_if_missing: true`.

Example (same `box_id`, different behaviour by toggle):

```json
// User has "Use existing box" OFF (default)
{
  "box_id": "CTN-A1-R01-L3-B1-20260301-115427-003"
}

// User has "Use existing box" ON
{
  "box_id": "CTN-A1-R01-L3-B1-20260301-115427-003",
  "create_carton_if_missing": true
}
```

Use the same URL and method; only the body changes.

---

## 4. User flow (recommended)

### Flow A: Toggle visible before scan

1. User opens Transfer In putaway and sees the box scan step.
2. User sees toggle: **“Use existing box”** (default OFF).
3. User scans the box.
4. App calls validate-carton with:
   - `box_id` = scanned value  
   - `create_carton_if_missing` = value of the toggle (true/false).
5. If success → continue to next step (e.g. location scan / putaway).
6. If 404 BOX_NOT_FOUND and toggle was OFF → show message (see section 5) and optionally suggest turning “Use existing box” ON and scanning again.

### Flow B: Offer after first failure

1. User scans the box; app calls validate-carton **without** `create_carton_if_missing`.
2. If 404 BOX_NOT_FOUND → show message:  
   *“This box is not linked to this Transfer In. Do you want to link it and continue?”*  
   Buttons: **“Link and use this box”** | **“Cancel”**.
3. If user taps **“Link and use this box”** → call validate-carton again with the **same** `box_id` and **`create_carton_if_missing: true`**.
4. If success → continue; if error → show API error.

You can combine both: show the toggle on the screen and, on 404, remind the user they can turn “Use existing box” ON and scan again.

---

## 5. Messages to show in the app

- **When 404 and user had “Use existing box” OFF:**  
  *“Box not found in this Transfer In. To use a box that’s already in the warehouse, turn on ‘Use existing box’ and scan again.”*

- **When user turns “Use existing box” ON (optional hint):**  
  *“When on, scanning a box that exists in the system but isn’t linked to this Transfer In will link it and allow putaway.”*

- **After successful validation with `create_carton_if_missing: true`:**  
  *“Box linked to Transfer In. You can continue putaway.”* (or no extra message if your normal success flow is clear.)

---

## 6. Summary checklist for mobile

| # | Item |
|---|------|
| 1 | Add a toggle/checkbox: **“Use existing box”** (default OFF) on the Transfer In putaway box-scan step. |
| 2 | When calling `POST /api/transfer-in/:title/validate-carton`, set body `create_carton_if_missing` from this control (true when ON, false/omit when OFF). |
| 3 | On 404 BOX_NOT_FOUND when toggle was OFF, show the message in section 5 and optionally suggest turning the option ON and scanning again. |
| 4 | (Optional) Add short help text explaining that “Use existing box” links an existing warehouse box to this Transfer In. |

No other API or backend changes are required; the API already supports this when `create_carton_if_missing: true` is sent.
