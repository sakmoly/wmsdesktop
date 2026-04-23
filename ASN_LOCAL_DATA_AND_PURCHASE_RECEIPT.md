# ASN data: local DB vs ERPNext, and Purchase Receipt items

## Where does the desktop get ASN data?

When you open an ASN and click **"Update Received Qty to ERPNext"**, the desktop builds the payload from:

- **Local MySQL database:** `tabAdvanceShippingNotice`, `tabAsnItemDetails`, `tabInboundReceiveLine`, `tabReceivingCarton`
- **No JSON file** – ASN/PR payloads are not stored in a JSON file; they are built from the local DB at click time.

So the **item list** (which items and how many lines we send) was coming from **local** `tabAsnItemDetails`. If you deleted items in **ERPNext** but had not run **Push & Pull** after that, the local table still had the old rows, and we sent those old items to the API. That’s why the Purchase Receipt could show “many items” and “previous items which I have already deleted.”

## What we changed (use ERPNext as source of truth for “which items”)

Before sending **ASN received qty** or **Create Purchase Receipt**:

1. We call **get_asn_items_for_wms** on ERPNext for that ASN and get the **current list of item codes** in the ASN.
2. We **filter** local ASN details to only those item codes.
3. We build the payload from this filtered list (and still aggregate by item_code).

So we now send **only items that exist in the current ERPNext ASN**. Deleted items in ERPNext are no longer sent, even if they still exist in the local DB.

- If the fetch from ERPNext fails (e.g. network), we fall back to using all local details (previous behaviour).

## What you should do

1. **Run Push & Pull** after you change an ASN in ERPNext (add/remove items, change qty). That updates the local DB (`tabAsnItemDetails` is replaced for that ASN) so the desktop UI and any fallback logic stay in sync.
2. With the new logic, **even if local is stale**, we first fetch the current ASN items from ERPNext and only send those. So the Purchase Receipt should now show only the 2 items (108226, 108227) that are in the ASN in ERPNext.

## Summary

| Question | Answer |
|--------|--------|
| Is data saved locally? | Yes – in **MySQL** (tabAdvanceShippingNotice, tabAsnItemDetails, etc.). |
| Is there any JSON? | No – payloads are built from the DB at click time, not from a JSON file. |
| Why did PR show old/deleted items? | We used to send whatever was in local tabAsnItemDetails; if you hadn’t synced after deleting in ERPNext, old items were still sent. |
| What’s the fix? | We now fetch current ASN items from ERPNext and **filter** the payload to only those items, so the PR matches the ASN (e.g. only 2 items). |
