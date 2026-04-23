-- Migration 008: Add ERP reference and sync timestamp to Cycle Count Task
-- Used to store ERPNext document reference after pushing to sync_task_capture_only
-- Date: 2026-01-26

ALTER TABLE tabCycleCountTask
  ADD COLUMN erp_reference VARCHAR(255) NULL AFTER items_with_discrepancy,
  ADD COLUMN erp_synced_at TIMESTAMP NULL AFTER erp_reference;
