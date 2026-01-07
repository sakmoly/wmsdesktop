# Mobile App Database Lock Fix

## Issue

**Error:** `database is locked` when saving settings after login

**Symptoms:**

- Login succeeds (200 response)
- Settings save fails with "database is locked" error
- Multiple retry attempts (1-5) all fail
- Error: `Call to function 'NativeStatement.finalizeAsync' has been rejected`

## Root Cause

SQLite database locking in React Native/Expo occurs when:

1. **Multiple concurrent operations** - Multiple database operations happening simultaneously
2. **Unclosed connections** - Database connections not properly closed
3. **Long-running transactions** - Transactions not committed/rolled back quickly
4. **Missing transaction handling** - Operations not wrapped in proper transactions

## Solutions

### Solution 1: Use Database Queue/Serialization

Ensure all database operations are serialized (one at a time):

```typescript
// services/database.ts or similar
import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;
let isInitialized = false;
const operationQueue: Array<() => Promise<void>> = [];
let isProcessing = false;

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync("wms.db");
    isInitialized = true;
  }
  return db;
}

// Serialize all database operations
async function executeWithQueue<T>(
  operation: () => Promise<T>,
  retries = 5
): Promise<T> {
  return new Promise((resolve, reject) => {
    const execute = async () => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const database = await getDatabase();
          const result = await operation();
          resolve(result);
          return;
        } catch (error: any) {
          const isLocked =
            error?.message?.includes("database is locked") ||
            error?.code === "SQLITE_BUSY" ||
            error?.code === "SQLITE_LOCKED";

          if (isLocked && attempt < retries) {
            const delay = Math.min(50 * Math.pow(2, attempt - 1), 1000); // Exponential backoff
            console.warn(
              `⚠️ Database locked (attempt ${attempt}/${retries}), retrying in ${delay}ms...`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          reject(error);
          return;
        }
      }
    };

    if (isProcessing) {
      operationQueue.push(execute);
    } else {
      isProcessing = true;
      execute().finally(() => {
        isProcessing = false;
        if (operationQueue.length > 0) {
          const next = operationQueue.shift();
          if (next) next();
        }
      });
    }
  });
}
```

### Solution 2: Proper Transaction Handling

Wrap operations in transactions and ensure they're committed quickly:

```typescript
// services/settings.service.ts
import { executeWithQueue } from "./database";

export async function saveSettings(settings: any): Promise<void> {
  await executeWithQueue(async () => {
    const db = await getDatabase();

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT OR REPLACE INTO settings 
         (key, value, updated_at) 
         VALUES (?, ?, ?)`,
        ["api_url", settings.api_url, new Date().toISOString()]
      );

      await db.runAsync(
        `INSERT OR REPLACE INTO settings 
         (key, value, updated_at) 
         VALUES (?, ?, ?)`,
        ["device_id", settings.device_id, new Date().toISOString()]
      );

      await db.runAsync(
        `INSERT OR REPLACE INTO settings 
         (key, value, updated_at) 
         VALUES (?, ?, ?)`,
        ["user_id", settings.user_id, new Date().toISOString()]
      );
    });
  });
}
```

### Solution 3: Close Connections Properly

Ensure all statements and connections are closed:

```typescript
// Always use async/await with proper cleanup
async function saveSettings(settings: any): Promise<void> {
  const db = await getDatabase();

  try {
    await db.withTransactionAsync(async () => {
      // Your operations here
      await db.runAsync(/* ... */);
    });
  } catch (error) {
    console.error("Database error:", error);
    throw error;
  }
  // Connection is automatically managed by expo-sqlite
}
```

### Solution 4: Debounce Rapid Saves

If settings are being saved too frequently, add debouncing:

```typescript
let saveTimer: NodeJS.Timeout | null = null;

export async function saveSettingsDebounced(settings: any): Promise<void> {
  // Clear existing timer
  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  // Wait 500ms before saving (debounce)
  return new Promise((resolve, reject) => {
    saveTimer = setTimeout(async () => {
      try {
        await saveSettings(settings);
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 500);
  });
}
```

### Solution 5: Use Batch Operations

Instead of multiple separate INSERT/UPDATE operations, use a single batch:

```typescript
export async function saveSettings(settings: any): Promise<void> {
  await executeWithQueue(async () => {
    const db = await getDatabase();

    await db.withTransactionAsync(async () => {
      // Batch all settings in one operation
      const settingsArray = [
        ["api_url", settings.api_url],
        ["device_id", settings.device_id],
        ["user_id", settings.user_id],
      ];

      // Use prepared statement for better performance
      const statement = await db.prepareAsync(
        `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`
      );

      for (const [key, value] of settingsArray) {
        await statement.executeAsync([key, value, new Date().toISOString()]);
      }

      await statement.finalizeAsync();
    });
  });
}
```

## Recommended Implementation

### Complete Fix Example

```typescript
// services/database.ts
import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;
let operationQueue: Array<() => Promise<any>> = [];
let isProcessing = false;

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync("wms.db");
  }
  return db;
}

export async function executeDbOperation<T>(
  operation: (db: SQLite.SQLiteDatabase) => Promise<T>,
  retries = 5
): Promise<T> {
  return new Promise((resolve, reject) => {
    const execute = async () => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const database = await getDatabase();
          const result = await operation(database);
          resolve(result);
          return;
        } catch (error: any) {
          const isLocked =
            error?.message?.includes("database is locked") ||
            error?.message?.includes("SQLITE_BUSY") ||
            error?.message?.includes("SQLITE_LOCKED") ||
            error?.code === "SQLITE_BUSY" ||
            error?.code === "SQLITE_LOCKED";

          if (isLocked && attempt < retries) {
            const delay = Math.min(50 * Math.pow(2, attempt - 1), 1000);
            console.warn(
              `⚠️ Database locked (attempt ${attempt}/${retries}), retrying in ${delay}ms...`
            );
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }

          console.error("❌ Database operation failed:", error);
          reject(error);
          return;
        }
      }
    };

    if (isProcessing) {
      operationQueue.push(() => execute().then(resolve).catch(reject));
    } else {
      isProcessing = true;
      execute()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          isProcessing = false;
          if (operationQueue.length > 0) {
            const next = operationQueue.shift();
            if (next) next();
          }
        });
    }
  });
}

// services/settings.service.ts
import { executeDbOperation } from "./database";

export async function saveSettings(settings: {
  api_url: string;
  device_id: string;
  user_id: string;
}): Promise<void> {
  console.log("saveSettings - Saving to database:", {
    api_url: settings.api_url,
    device_id: settings.device_id,
    user_id: settings.user_id,
  });

  await executeDbOperation(async (db) => {
    await db.withTransactionAsync(async () => {
      const now = new Date().toISOString();

      // Use single statement for all updates
      const statement = await db.prepareAsync(
        `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`
      );

      await statement.executeAsync(["api_url", settings.api_url, now]);
      await statement.executeAsync(["device_id", settings.device_id, now]);
      await statement.executeAsync(["user_id", settings.user_id, now]);

      await statement.finalizeAsync();
    });
  });
}
```

## Key Points

1. **Serialize Operations** - Use a queue to ensure only one database operation at a time
2. **Use Transactions** - Wrap related operations in transactions
3. **Proper Cleanup** - Always finalize statements and close connections
4. **Exponential Backoff** - Retry with increasing delays (50ms, 100ms, 200ms, 400ms, 800ms)
5. **Error Handling** - Catch and handle SQLITE_BUSY/SQLITE_LOCKED errors specifically

## Testing

After implementing the fix:

1. Test login flow
2. Verify settings save successfully
3. Check logs for any remaining lock errors
4. Test concurrent operations (if applicable)

## Additional Notes

- **expo-sqlite** manages connections automatically, but you still need to:

  - Finalize prepared statements
  - Use transactions for related operations
  - Serialize concurrent operations

- **Database locking** is normal in SQLite when:
  - Multiple threads/processes access the database
  - Long-running transactions
  - Unclosed statements

The fix ensures operations are serialized and properly handled.
