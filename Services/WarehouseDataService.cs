using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class WarehouseDataService
{
    /// <summary>
    /// Get all Warehouses from database
    /// </summary>
    public static async Task<List<Warehouse>> GetWarehousesAsync(WmsSettings settings)
    {
        var warehouses = new List<Warehouse>();
        
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            var sql = @"SELECT code, name, warehouse_type, is_group, parent_warehouse
                        FROM tabWarehouse
                        ORDER BY code";
            
            await using var cmd = new MySqlCommand(sql, connection);
            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var warehouseType = reader.IsDBNull(2) ? null : reader.GetString(2);
                var isStore = warehouseType == "Store";
                
                warehouses.Add(new Warehouse
                {
                    Code = reader.GetString(0),
                    Name = reader.GetString(1),
                    IsStore = isStore
                });
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Warehouses from database", ex);
        }

        return warehouses;
    }

    /// <summary>
    /// Resolve warehouse name or code to the canonical code (e.g. WH-MAIN) for display in Stock Ledger and Transaction History.
    /// </summary>
    public static string ResolveToCode(string? nameOrCode, List<Warehouse> warehouses)
    {
        if (string.IsNullOrWhiteSpace(nameOrCode))
            return nameOrCode ?? string.Empty;
        // Exact match (code or name)
        var match = warehouses.FirstOrDefault(w =>
            string.Equals(w.Code, nameOrCode, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(w.Name, nameOrCode, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrEmpty(match?.Code))
            return match.Code;
        var trimmed = nameOrCode.Trim();
        // ERPNext link / full name often contains the short warehouse code (e.g. "001-Unaizah" inside document title)
        match = warehouses.FirstOrDefault(w =>
            !string.IsNullOrEmpty(w.Code) &&
            w.Code.Length >= 3 &&
            trimmed.IndexOf(w.Code, StringComparison.OrdinalIgnoreCase) >= 0);
        if (!string.IsNullOrEmpty(match?.Code))
            return match.Code;
        // Fallback: name in DB might be truncated — match if Name starts with or contains key part
        match = warehouses.FirstOrDefault(w =>
            (!string.IsNullOrEmpty(w.Name) && (w.Name.StartsWith(trimmed, StringComparison.OrdinalIgnoreCase) || trimmed.StartsWith(w.Name, StringComparison.OrdinalIgnoreCase))) ||
            (!string.IsNullOrEmpty(w.Code) && w.Name != null && w.Name.IndexOf(trimmed, StringComparison.OrdinalIgnoreCase) >= 0));
        return !string.IsNullOrEmpty(match?.Code) ? match.Code : nameOrCode;
    }

    /// <summary>
    /// Resolve warehouse code or name to the ERPNext document name (e.g. WH-MAIN -> "Main Warehouse - MAATC").
    /// Use when sending warehouse to ERPNext APIs that expect a Link/name.
    /// </summary>
    public static string ResolveToName(string? codeOrName, List<Warehouse> warehouses)
    {
        if (string.IsNullOrWhiteSpace(codeOrName))
            return codeOrName ?? string.Empty;
        var match = warehouses.FirstOrDefault(w =>
            string.Equals(w.Code, codeOrName, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(w.Name, codeOrName, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrEmpty(match?.Name))
            return match.Name;
        var trimmed = codeOrName.Trim();
        match = warehouses.FirstOrDefault(w =>
            (!string.IsNullOrEmpty(w.Name) && (w.Name.StartsWith(trimmed, StringComparison.OrdinalIgnoreCase) || trimmed.StartsWith(w.Name ?? "", StringComparison.OrdinalIgnoreCase))) ||
            (!string.IsNullOrEmpty(w.Code) && w.Name != null && w.Name.IndexOf(trimmed, StringComparison.OrdinalIgnoreCase) >= 0));
        return !string.IsNullOrEmpty(match?.Name) ? match.Name : codeOrName;
    }

    /// <summary>ERPNext expects full warehouse document name (e.g. "Main Warehouse - MAATC"). Normalize short names so API finds the doc.</summary>
    public static string NormalizeWarehouseNameForErpNext(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return name ?? string.Empty;
        var t = name.Trim();
        if (string.Equals(t, "Main Warehouse", StringComparison.OrdinalIgnoreCase))
            return "Main Warehouse - MAATC";
        // If name does not already end with company suffix, append so ERPNext Link finds the doc (e.g. "001 - Unaizah - Almoosa" -> "001 - Unaizah - Almoosa - MAATC").
        const string suffix = " - MAATC";
        if (t.Length > suffix.Length && t.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
            return t;
        return t + suffix;
    }
}

