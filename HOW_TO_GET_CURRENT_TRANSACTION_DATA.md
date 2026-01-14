# How to Get Current/Updated Transaction Data

## 🔄 Methods to Get Latest Transaction Data

### Method 1: **Refresh Button** (Easiest)

**Location:** Bottom of Transaction History view

**Steps:**
1. Open Transaction History view (click "Transaction History" menu button)
2. Click **"Refresh"** button at the bottom
3. Data will reload from the API with latest transactions

**What it does:**
- Calls `RefreshCommand` in ViewModel
- Fetches latest data from `GET /api/transaction-history`
- Updates the display with new transactions

---

### Method 2: **Search Button** (Refreshes with Filters)

**Location:** Top filter section

**Steps:**
1. Apply any filters (Item Code, Warehouse, Date, etc.)
2. Click **"Search"** button
3. Data refreshes with latest transactions matching your filters

**What it does:**
- Applies current filters
- Fetches fresh data from API
- Shows only matching transactions

---

### Method 3: **Clear Filters** (Resets and Refreshes)

**Location:** Top filter section

**Steps:**
1. Click **"Clear"** button
2. Filters reset to default (last 30 days)
3. Data automatically refreshes

**What it does:**
- Resets all filters to defaults
- Automatically triggers refresh
- Shows last 30 days of transactions

---

### Method 4: **Change Date Range** (Auto-Refresh)

**Steps:**
1. Change "From Date" or "To Date" in filters
2. Click **"Search"** button
3. Data refreshes for the new date range

**Tip:** To see today's transactions, set:
- **From Date:** Today
- **To Date:** Today
- Click **"Search"**

---

## 📊 Understanding Data Flow

### How Data Gets Updated:

```
1. Mobile App → Backend API → tabStockTransaction
   ↓
2. Database Trigger → tabTransactionHistory (automatic)
   ↓
3. Desktop App → API Call → GET /api/transaction-history
   ↓
4. View Displays Latest Data
```

### Important Notes:

1. **Automatic Capture:**
   - Transactions are **automatically** captured when mobile app sends data
   - No manual intervention needed
   - Trigger fires immediately when transaction is inserted

2. **Desktop App Refresh:**
   - Desktop app does **NOT** auto-refresh automatically
   - You need to click **"Refresh"** button to see new transactions
   - Or click **"Search"** to refresh with current filters

3. **Real-Time vs. On-Demand:**
   - Data capture: **Real-time** (automatic via trigger)
   - Data display: **On-demand** (manual refresh required)

---

## 🎯 Best Practices

### To See Latest Transactions:

1. **After Mobile App Transaction:**
   - Perform transaction in mobile app
   - Open Transaction History in desktop app
   - Click **"Refresh"** button
   - New transaction should appear

2. **To See Today's Transactions:**
   - Set **From Date:** Today
   - Set **To Date:** Today
   - Click **"Search"**
   - All today's transactions will show

3. **To See All Recent Transactions:**
   - Click **"Clear"** (resets to last 30 days)
   - Or manually set date range
   - Click **"Search"**

---

## 🔍 Troubleshooting

### If New Transactions Don't Appear:

1. **Check Date Range:**
   - New transactions might be outside current date filter
   - Click **"Clear"** to reset to last 30 days
   - Or set date range to include today

2. **Check Filters:**
   - Item Code, Warehouse, or other filters might be hiding transactions
   - Click **"Clear"** to remove all filters
   - Click **"Search"** to refresh

3. **Verify API Connection:**
   - Check Settings → API Endpoint URL is correct
   - Check API Key is valid
   - Verify API server is running

4. **Check Database:**
   - Verify trigger is active: `SHOW TRIGGERS WHERE Trigger = 'trg_log_transaction_history_insert';`
   - Check if transactions exist: `SELECT COUNT(*) FROM tabTransactionHistory;`

---

## ⚡ Quick Reference

| Action | Button | What It Does |
|--------|--------|--------------|
| **Refresh Data** | "Refresh" (bottom) | Reloads data with current filters |
| **Search/Filter** | "Search" (top) | Applies filters and refreshes |
| **Reset Filters** | "Clear" (top) | Clears filters and refreshes |
| **Export** | "Export to Excel" | Exports current filtered data |

---

## 💡 Pro Tips

1. **Set Date Range to Today:**
   - To see only today's transactions
   - Set From Date = Today, To Date = Today

2. **Use Filters Before Export:**
   - Apply filters (Item, Location, Date, etc.)
   - Click "Search" to refresh
   - Click "Export to Excel" to export filtered data

3. **Refresh After Mobile Transactions:**
   - After mobile app sends transaction
   - Click "Refresh" in desktop app
   - New transaction should appear immediately

---

**Summary:** Click the **"Refresh"** button at the bottom of the Transaction History view to get the latest data!
