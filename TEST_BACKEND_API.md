# Test Backend API - Quick Verification

## 🔍 Quick Test

Test your backend API directly to see what it's actually returning:

```bash
curl -X GET "http://localhost:3000/api/master/asns" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.[0]'
```

## ✅ Expected Response

```json
{
  "asn_no": "ASN-0001",  // ✅ 4-digit format (matches database)
  "status": "Submitted",
  "purchase_order": "PO-2024-001",
  "supplier": "Supplier ABC",
  ...
}
```

## ❌ If Returns 5-Digit Format

If the API returns `"asn_no": "ASN-00001"` (5-digit), then:

1. **Backend code not deployed** - Copy files to actual backend location
2. **Normalization still happening** - Remove normalization code
3. **Wrong endpoint** - Check if mobile is calling correct endpoint

## 📋 What to Check

1. **Backend API Response:** What format does it return?
2. **Backend Logs:** Any errors or warnings?
3. **Route Registration:** Is route registered in main app?
4. **Normalization:** Is there any normalization code?

---

**Action:** Test the backend API first to see what it's actually returning.

