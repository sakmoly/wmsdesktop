# Payload Size Limit Fix

## Issue

**Error:** `PayloadTooLargeError: request entity too large`

The Express body parser had a default limit of 100KB, but the mobile app was sending requests larger than this (125KB in this case).

```
expected: 125349,
length: 125349,
limit: 102400,  // 100KB default limit
type: 'entity.too.large'
```

## Solution Implemented

Increased the body parser limit from 100KB (default) to 5MB to handle:
- Large batch requests (e.g., receive lines with many items)
- Event logging with multiple events
- Large receive line updates

## Changes Made

### File: `wms-api/src/server.js`

**Before:**
```javascript
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
```

**After:**
```javascript
// Increase body size limit to 5MB to handle large batch requests
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
```

## Why 5MB?

- **Current request:** ~125KB (needs at least 200KB)
- **Future-proof:** 5MB allows for:
  - Large batch receive line updates (1000+ items)
  - Multiple event logs in a single request
  - Large file uploads if needed in the future
- **Reasonable limit:** Prevents abuse while allowing legitimate large requests

## Impact

### Before Fix:
- ❌ Requests > 100KB failed with `PayloadTooLargeError`
- ❌ Large batch operations couldn't be completed
- ❌ Mobile app had to split large requests into smaller chunks

### After Fix:
- ✅ Requests up to 5MB are accepted
- ✅ Large batch operations work seamlessly
- ✅ Mobile app can send complete data in single request
- ✅ Better performance (fewer HTTP requests)

## Testing

### Test with Large Batch Request

```bash
curl -X POST http://localhost:3000/api/inbound/receive-lines \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @large-batch-request.json  # File with 1000+ items
```

**Expected:** Request succeeds without `PayloadTooLargeError`

## Common Use Cases That Benefit

1. **Batch Receive Lines**
   - Multiple cartons with many items each
   - Single request with all receive lines

2. **Event Logging**
   - Multiple events in a single batch
   - Reduces number of API calls

3. **Carton Status Updates**
   - Batch updates for multiple cartons
   - All status changes in one request

## Next Steps

1. **Restart Backend Server**
   ```bash
   cd wms-api
   # Stop current server (Ctrl+C)
   npm start
   ```

2. **Verify Large Requests**
   - Mobile app should now be able to send large batch requests
   - No more `PayloadTooLargeError` for legitimate requests

## Notes

- The limit applies to both JSON and URL-encoded bodies
- 5MB is a reasonable limit for most WMS operations
- If you need larger limits in the future, simply increase the `limit` value
- Consider monitoring request sizes to identify unusually large requests

## Alternative Limits (if needed)

If 5MB is not enough, you can adjust:

```javascript
// For 10MB
app.use(express.json({ limit: '10mb' }));

// For 50MB
app.use(express.json({ limit: '50mb' }));

// For unlimited (not recommended)
app.use(express.json({ limit: Infinity }));
```

**Recommendation:** Start with 5MB and increase only if needed.

