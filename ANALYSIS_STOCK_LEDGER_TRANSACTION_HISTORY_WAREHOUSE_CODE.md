# Analysis: Stock Ledger & Transaction History – Show Warehouse Code (WH-MAIN)

**Goal:** Make the **Warehouse** column show warehouse **code** (e.g. WH-MAIN) instead of warehouse **name** (e.g. Main Warehouse - MAATC) in:
1. **Stock Ledger (Real-Time Stock)**
2. **Transaction History**

---

## 1. Current behavior

| Screen | Data source | Warehouse value today |
|--------|-------------|------------------------|
| **Stock Ledger** | Desktop MySQL: **tabStockLedger** | Whatever was written when the row was created (putaway now uses code after fix; receiving/other flows may still write name). |
| **Transaction History** | WMS API: GET `/api/transaction-history` | Whatever the API returns in `warehouse` (often name). Model also has `warehouse_name`. |

So the column can show either **name** or **code** depending on the source, and the user wants it to always show **code**.

---

## 2. Stock Ledger – where warehouse comes from

- **Read path:** `StockLedgerService.GetStockLedgerPagedAsync` (and `GetAllStockLedgerAsync`) reads from **tabStockLedger** and maps `reader.GetString(1)` to `StockLedger.Warehouse`.
- **Write path:** Various flows write to tabStockLedger with a `warehouse` value:
  - **Putaway (ApplyPutawayTaskToLocalStockAsync):** Now uses **code** (WH-MAIN) after the recent fix.
  - **Cycle count (ApplyCycleCountFromTaskAsync):** Uses `task.Warehouse` from the task (typically **code** from API).
  - **Receiving, Picking, etc.:** May pass warehouse from settings or UI (name or code).

So the **DB** can contain a mix of names and codes. To make the **column** always show code, we resolve at **read** time: when building the list, convert each row’s warehouse string to code using the warehouse list (match by name or code → use code).

---

## 3. Transaction History – where warehouse comes from

- **Read path:** `TransactionHistoryService.GetTransactionHistoryAsync` calls the **WMS API**; response is deserialized into `TransactionHistory` with `Warehouse` and `WarehouseName`.
- The desktop does **not** write this data; it only displays what the API returns. So we cannot change the stored value. To show code in the UI we must **resolve on the client** after fetching: use the desktop’s warehouse list (from WarehouseDataService) and map each transaction’s `Warehouse` or `WarehouseName` to code for display.

---

## 4. Approach

| Screen | Approach |
|--------|----------|
| **Stock Ledger** | In `StockLedgerService.GetStockLedgerPagedAsync` (and `GetAllStockLedgerAsync`): load warehouses once, then when building each `StockLedger`, set `Warehouse = ResolveWarehouseToCode(rawWarehouse, warehouses)` so the bound column shows code. |
| **Transaction History** | After loading from API, resolve each item’s warehouse to code using the same resolver and show that in the grid (e.g. via a display model or a resolved property so the Warehouse column binds to code). |

**Resolver:** Given a string that may be warehouse **name** or **code**, and a list of `Warehouse` (Code, Name), return the **code**: if the string equals a warehouse’s Name or Code, return that warehouse’s Code; otherwise return the original string (no change).

---

## 5. Implementation summary

1. **WarehouseDataService** (or a small helper): Add `ResolveToCode(string? nameOrCode, List<Warehouse> warehouses)`.
2. **StockLedgerService:** In both paged and non-paged get methods, load warehouses, then when creating each `StockLedger`, set `Warehouse = ResolveToCode(reader.GetString(1), warehouses)`.
3. **Transaction History:** Use a display wrapper (e.g. `TransactionHistoryDisplay`) that holds the API model and a `WarehouseDisplay` (resolved code), and bind the Warehouse column to `WarehouseDisplay`. When loading, fetch warehouses, then for each transaction set `WarehouseDisplay = ResolveToCode(transaction.Warehouse ?? transaction.WarehouseName, warehouses)`.

Result: both screens show **warehouse code** (e.g. WH-MAIN) in the Warehouse column without changing how data is stored or what the API returns.
