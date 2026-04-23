-- Run this in your MySQL client (e.g. MySQL Workbench) to verify purchase_receipt_no in the DB.
-- Database: wms_desktop (or your WMS database name)

USE wms_desktop;

SELECT title, purchase_receipt_no, shipment_type, wms_export_status, status
FROM tabAdvanceShippingNotice
ORDER BY title;

-- If you see PR-ASN-ASN-0003 for ASN-0003 here but the desktop shows "—",
-- check ErrorLogs folder after opening ASN list for: "GetAsns FieldCount=" and "purchase_receipt_no ordinal=".
