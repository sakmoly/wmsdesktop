# Impact of Adding Fields to Master Data

## ✅ Answer: Yes, It Will Affect Mobile App

When you add a field to master data (like `tabItem` table), it **will affect the mobile app**, but the impact depends on how you implement it.

---

## 📊 How Master Data Flows

### 1. **Database → API Server → Mobile App**

```
tabItem (Database)
    ↓
GET /api/master/items (API Server)
    ↓
Mobile App (fetches via API)
```

### 2. **Current Flow**

**Desktop App:**
- Syncs items from ERPNext → Saves to `tabItem` table
- Fields synced: `code`, `name`, `item_group`, `brand`, `stock_uom`, `is_stock`, `modified`

**API Server:**
- Reads from `tabItem` table
- Returns: `code`, `name`, `item_group`, `brand`, `default_uom`, `stock_uom`, `barcode`, `maintain_stock`, `stock_qty`, `reserved_qty`, `updated_on`, `created_at`, `updated_at`

**Mobile App:**
- Calls `GET /api/master/items`
- Receives all fields returned by API
- Uses fields it needs (ignores fields it doesn't use)

---

## 🔧 Steps to Add a New Field

### Step 1: Add Field to Database

```sql
ALTER TABLE tabItem 
ADD COLUMN new_field VARCHAR(255) NULL;
```

### Step 2: Update Desktop Sync (if syncing from ERPNext)

**In `ErpNextItemApiService.cs`:**
- Add field to `fields` array in request
- Add property to `ErpNextItem` model
- Add mapping in `ItemSyncService.cs` UPSERT

**In `ItemSyncService.cs`:**
- Add field to INSERT/UPDATE SQL
- Add parameter binding

### Step 3: Update API Endpoint

**In `wms-api/src/modules/master/masterController.js`:**
- Add field to SELECT query
- Add field to response mapping

**Example:**
```javascript
const [rows] = await connection.execute(`
  SELECT 
    code,
    name,
    item_group,
    brand,
    new_field,  // ← Add new field
    ...
  FROM tabItem
  ORDER BY code
`);

const items = rows.map(row => ({
  code: row.code,
  name: row.name,
  new_field: row.new_field || null,  // ← Add to response
  ...
}));
```

### Step 4: Update Mobile App (Optional)

**If mobile app needs the new field:**
- Update mobile app code to read/use the new field
- Field will be available in API response automatically

**If mobile app doesn't need it:**
- No changes needed - mobile app will ignore the field
- Field will still be in API response (backward compatible)

---

## ✅ Impact Summary

| Change | Desktop App | API Server | Mobile App |
|--------|-------------|------------|------------|
| Add field to DB | ✅ Update sync code | ✅ Update API query | ⚠️ Optional (if using field) |
| Remove field | ✅ Update sync code | ✅ Update API query | ⚠️ Breaking (if using field) |
| Change field type | ✅ Update sync code | ✅ Update API query | ⚠️ Breaking (if using field) |

---

## 🎯 Best Practices

### 1. **Backward Compatibility**
- Add new fields as **nullable** (allows existing data)
- Don't remove fields (or mark as deprecated first)
- Mobile app can ignore new fields it doesn't use

### 2. **API Versioning** (Future)
- Consider API versioning for breaking changes
- Current: Single version (`/api/master/items`)
- Future: `/api/v1/master/items`, `/api/v2/master/items`

### 3. **Documentation**
- Update API documentation when adding fields
- Update mobile app documentation if field is required

---

## 📝 Example: Adding a New Field

### Scenario: Add `description` field to items

**Step 1: Database**
```sql
ALTER TABLE tabItem 
ADD COLUMN description TEXT NULL;
```

**Step 2: Desktop Sync** (if syncing from ERPNext)
```csharp
// In ErpNextItemApiService.cs - Add to fields array
fields = new[] {
    "item_code",
    "item_name",
    "description",  // ← New field
    ...
}

// In ErpNextItem model
[JsonPropertyName("description")]
public string? Description { get; set; }

// In ItemSyncService.cs - Add to SQL
INSERT INTO tabItem (code, name, description, ...)
VALUES (@code, @name, @description, ...)
ON DUPLICATE KEY UPDATE
    description = @description, ...
```

**Step 3: API Endpoint**
```javascript
// In masterController.js
const [rows] = await connection.execute(`
  SELECT 
    code,
    name,
    description,  // ← Add to SELECT
    ...
  FROM tabItem
`);

const items = rows.map(row => ({
  code: row.code,
  name: row.name,
  description: row.description || null,  // ← Add to response
  ...
}));
```

**Step 4: Mobile App** (if needed)
```javascript
// Mobile app can now access description
item.description  // Available in API response
```

---

## ✅ Summary

**Question:** "if i add a field in the master data will this effect on mobile app?"

**Answer:** 
- ✅ **Yes, but it's safe** - New fields are automatically included in API response
- ✅ **Mobile app can ignore** fields it doesn't use (backward compatible)
- ⚠️ **Mobile app must update** if it wants to use the new field
- ⚠️ **Breaking changes** if you remove or change existing fields mobile app uses

**Recommendation:**
- Add new fields as nullable
- Update API endpoint to include new field
- Mobile app will receive it automatically
- Update mobile app only if it needs to use the new field
