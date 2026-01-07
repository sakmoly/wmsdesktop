# Desktop App Putaway Lines Debug Guide

## Problem
Backend API returns lines correctly (`lines_count: 1`, `items` array populated), but desktop app shows "Lines: 0".

## Added Debug Logging

I've added logging to `PutawayTaskDataService.cs` to track:
1. Which tasks are being queried for lines
2. How many lines are read from database
3. Which lines are added to each task
4. Final line count per task

## Steps to Debug

### 1. Rebuild and Restart Desktop App
```bash
# Rebuild the C# project
dotnet build

# Or rebuild in Visual Studio
```

### 2. Check Error Logs
Look for log messages like:
```
PutawayTaskDataService: Querying lines for X tasks: PUT-20260101-0007, ...
PutawayTaskDataService: Added line for PUT-20260101-0007: SKU-HAT-301-BLU-OS (Qty: 25, Carton: BOX-WHMAIN-383712)
PutawayTaskDataService: Total lines read from database: 1, Unique parent titles with lines: 1
PutawayTaskDataService: Task PUT-20260101-0007 has 1 line(s)
```

### 3. Possible Issues

#### Issue 1: Empty String vs NULL
The database stores `rack = ''` and `bin = ''` (empty strings), not NULL.
The C# code handles this correctly, but verify:
```csharp
var rack = linesReader.IsDBNull(4) ? string.Empty : linesReader.GetString(4);
var bin = linesReader.IsDBNull(5) ? string.Empty : linesReader.GetString(5);
```

#### Issue 2: Cached Data
The desktop app might be showing cached data. Try:
- Close and reopen the Putaway Tasks window
- Restart the desktop app
- Clear any cached data

#### Issue 3: Query Parameters
Verify the SQL query is using correct parameters. The query should be:
```sql
SELECT pl.parent_title, pl.carton_id, pl.item_code, pl.qty, pl.rack, pl.bin, NULL as location_id
FROM tabPutawayLine pl
WHERE pl.parent_title IN (@title0, @title1, ...)
ORDER BY pl.parent_title, pl.item_code
```

With parameters:
- @title0 = 'PUT-20260101-0007'
- etc.

### 4. Manual Database Check
Run this query in your database:
```sql
SELECT * FROM tabPutawayLine WHERE parent_title = 'PUT-20260101-0007';
```

Should return:
- id: 30
- parent_title: PUT-20260101-0007
- item_code: SKU-HAT-301-BLU-OS
- carton_id: BOX-WHMAIN-383712
- qty: 25.00
- rack: '' (empty string)
- bin: '' (empty string)

### 5. Test the Query Directly
Run the exact query the C# code uses:
```sql
SELECT pl.parent_title, pl.carton_id, pl.item_code, pl.qty, pl.rack, pl.bin, NULL as location_id
FROM tabPutawayLine pl
WHERE pl.parent_title IN ('PUT-20260101-0007')
ORDER BY pl.parent_title, pl.item_code;
```

Should return 1 row.

## Next Steps

1. **Rebuild desktop app** with new logging
2. **Restart desktop app**
3. **Open Putaway Tasks window**
4. **Check error logs** for the new debug messages
5. **Share the log output** if lines still don't show

The logging will tell us exactly what's happening - whether:
- Lines aren't being queried
- Lines are queried but not added to the dictionary
- Lines are added but not assigned to tasks
- Lines are assigned but UI isn't displaying them

