# ASN Format Clarification

## ✅ Current Status

**Mobile App:** Shows 5-digit format (ASN-00005, ASN-00001, ASN-00002) ✅ **CORRECT**  
**Backend API:** Returns 5-digit format (ASN-00005) ✅ **CORRECT**  
**Desktop App:** Shows 4-digit format (ASN-0001, ASN-0002) ❌ **NEEDS FIX**

## 🔍 Why Mobile Shows 5 Digits

The mobile app shows 5-digit format because:

1. **Database stores:** 5-digit format (ASN-00005, ASN-00001, ASN-00002)
2. **Backend returns:** 5-digit format (preserves original from database) ✅
3. **Mobile displays:** 5-digit format (exactly as received from backend) ✅

**This is CORRECT behavior!** The mobile app is working as expected.

## ❌ Why Desktop Shows 4 Digits

The desktop app shows 4-digit format because it's either:

1. **Reading from database that has 4-digit format** (unlikely - database should have 5-digit)
2. **Normalizing/formatting ASN when displaying** (more likely)
3. **Using old data that was stored in 4-digit format**

## 🔧 Solution

### Option 1: Check Database Format (First Step)

Verify what format is actually stored in the database:

```sql
SELECT title FROM tabAdvanceShippingNotice ORDER BY title LIMIT 5;
```

**Expected:** `ASN-00001`, `ASN-00002`, `ASN-00003`, `ASN-00004`, `ASN-00005` (5-digit)  
**If shows:** `ASN-0001`, `ASN-0002`, etc. (4-digit) → Database has 4-digit format

### Option 2: Fix Desktop App (If Database Has 5-Digit)

If database has 5-digit format but desktop shows 4-digit, the desktop app is normalizing it. Check:

1. **ViewModel:** No formatting in `AsnListViewModel.cs` ✅ (already checked - no formatting)
2. **View/XAML:** No converter or formatting in `AsnListView.xaml` ✅ (already checked - direct binding)
3. **Data Service:** No normalization in `AsnDataService.cs` ✅ (already checked - uses `a.title` directly)

**If all are correct, the issue might be:**
- Database actually has 4-digit format stored
- Or there's cached/old data being displayed

### Option 3: Update Database to 5-Digit Format (If Database Has 4-Digit)

If the database has 4-digit format, update it to 5-digit to match mobile app:

```sql
-- Update ASN format from 4-digit to 5-digit
UPDATE tabAdvanceShippingNotice 
SET title = CONCAT('ASN-', LPAD(SUBSTRING_INDEX(title, '-', -1), 5, '0'))
WHERE title LIKE 'ASN-____'  -- 4-digit format
  AND LENGTH(SUBSTRING_INDEX(title, '-', -1)) = 4;
```

## 🎯 Expected Result

After fix:
- ✅ **Database:** 5-digit format (ASN-00005, ASN-00001, ASN-00002)
- ✅ **Backend:** Returns 5-digit format (ASN-00005) ✅ Already correct
- ✅ **Mobile:** Shows 5-digit format (ASN-00005) ✅ Already correct
- ✅ **Desktop:** Shows 5-digit format (ASN-00005) ✅ Should match after fix

## 📝 Summary

**Mobile app is CORRECT** - it shows 5-digit format because:
1. Backend returns 5-digit format (correct)
2. Database stores 5-digit format (correct)
3. Mobile displays exactly what backend returns (correct)

**Desktop app needs to be fixed** to show 5-digit format to match:
- Database format
- Backend format
- Mobile app format

The first step is to verify what format is actually stored in the database.

