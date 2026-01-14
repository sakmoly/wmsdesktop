# Transaction History - Double /api/api/ URL Fix

## 🔍 Problem Identified

The error log shows the API URL being called is:
```
https://erpnext.printechs.example.com/api/api/transaction-history?limit=10000
```

**Notice the double `/api/api/`** - this is incorrect!

The error is:
```
The requested name is valid, but no data of the requested type was found. (erpnext.printechs.example.com:443)
```

## 🐛 Root Cause

The `ApiEndpointUrl` in settings is: `https://erpnext.printechs.example.com/api`

The service code was doing:
```csharp
var baseUrl = settings.ApiEndpointUrl.TrimEnd('/'); // "https://erpnext.printechs.example.com/api"
var url = $"{baseUrl}/api/transaction-history?{queryString}"; // Adds /api/ again!
```

Result: `https://erpnext.printechs.example.com/api/api/transaction-history` ❌

## ✅ Fix Applied

The service now checks if the base URL already ends with `/api`:

```csharp
var baseUrl = settings.ApiEndpointUrl.TrimEnd('/');

// Handle base URL that already includes /api
string endpointPath;
if (baseUrl.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
{
    // Base URL already has /api, just append the endpoint
    endpointPath = "/transaction-history";
}
else
{
    // Base URL doesn't have /api, add it
    endpointPath = "/api/transaction-history";
}

var url = $"{baseUrl}{endpointPath}?{queryString}";
```

**Result:**
- If base URL is `https://erpnext.printechs.example.com/api` → `https://erpnext.printechs.example.com/api/transaction-history` ✅
- If base URL is `https://erpnext.printechs.example.com` → `https://erpnext.printechs.example.com/api/transaction-history` ✅

## 🧪 Testing

After rebuild, the Error Log should show:
```
TransactionHistoryService: Calling API: https://erpnext.printechs.example.com/api/transaction-history?limit=10000
```

**NOT:**
```
TransactionHistoryService: Calling API: https://erpnext.printechs.example.com/api/api/transaction-history?limit=10000
```

## 📋 Next Steps

1. **Rebuild desktop app** to include the fix
2. **Open Transaction History view**
3. **Click "Load All" button**
4. **Check Error Log** - should show correct URL without double `/api/api/`
5. **Data should appear** if API is accessible

## 🔧 If Still Not Working

If you still get network errors after the fix:

1. **Verify API Endpoint URL in Settings:**
   - Should be: `https://erpnext.printechs.example.com/api`
   - Or: `https://erpnext.printechs.example.com` (without /api)

2. **Test API Directly:**
   ```bash
   # Test with browser or Postman
   GET https://erpnext.printechs.example.com/api/transaction-history?limit=10
   Authorization: Bearer YOUR_API_KEY
   ```

3. **Check Network Connectivity:**
   - Can you access `https://erpnext.printechs.example.com` from your machine?
   - Is the server running?
   - Is there a firewall blocking the connection?

4. **Check DNS Resolution:**
   - Can you resolve `erpnext.printechs.example.com`?
   - Try: `ping erpnext.printechs.example.com`

## ✅ Expected Result

After the fix:
- URL should be: `https://erpnext.printechs.example.com/api/transaction-history?limit=10000`
- No more double `/api/api/` in the URL
- API should be reachable (if server is accessible)
- Data should load successfully
