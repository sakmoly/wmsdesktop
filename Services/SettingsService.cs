using System;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class SettingsService
{
    private static readonly string SettingsFilePath;
    private static readonly byte[] EncryptionKey = Encoding.UTF8.GetBytes("WMS-PRINTECHS-SETTINGS-2024-KEY-32BYTES!!!"); // 32 bytes for AES256

    static SettingsService()
    {
        var appPath = AppDomain.CurrentDomain.BaseDirectory;
        SettingsFilePath = Path.Combine(appPath, "wms_settings.json");
    }

    /// <summary>
    /// Load settings from the default app directory (wms_settings.json next to the executable).
    /// </summary>
    public static WmsSettings? LoadSettings() => LoadSettingsFromFile(SettingsFilePath);

    /// <summary>
    /// Load settings from an explicit file path (e.g. for CLI test runners).
    /// </summary>
    public static WmsSettings? LoadSettingsFromFile(string filePath)
    {
        try
        {
            if (!File.Exists(filePath))
            {
                return null;
            }

            var json = File.ReadAllText(filePath);
            var settings = JsonSerializer.Deserialize<WmsSettingsDto>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (settings == null)
                return null;

            // Decrypt password if it's encrypted
            var decryptedPassword = string.Empty;
            if (!string.IsNullOrWhiteSpace(settings.EncryptedPassword))
            {
                try
                {
                    // Try to decrypt first (if it's actually encrypted Base64)
                    if (settings.EncryptedPassword.Length > 32 && IsBase64String(settings.EncryptedPassword))
                    {
                        decryptedPassword = DecryptPassword(settings.EncryptedPassword);
                    }
                    else
                    {
                        // If it looks like plain text, use it directly (backward compatibility)
                        decryptedPassword = settings.EncryptedPassword;
                    }
                }
                catch
                {
                    // If decryption fails, use as plain text (backward compatibility)
                    decryptedPassword = settings.EncryptedPassword;
                }
            }
            else if (!string.IsNullOrWhiteSpace(settings.DatabasePassword))
            {
                decryptedPassword = settings.DatabasePassword;
            }

            return new WmsSettings
            {
                Company = settings.Company ?? string.Empty,
                ApiEndpointUrl = settings.ApiEndpointUrl ?? string.Empty,
                ErpNextApiUrl = settings.ErpNextApiUrl ?? string.Empty,
                ApiKey = settings.ApiKey ?? string.Empty,
                ErpNextApiKey = settings.ErpNextApiKey ?? string.Empty,
                SyncFrequencyMinutes = settings.SyncFrequencyMinutes,
                DefaultPickingWarehouse = settings.DefaultPickingWarehouse,
                DefaultReceivingWarehouseForPr = settings.DefaultReceivingWarehouseForPr,
                IntransitWarehouseName = settings.IntransitWarehouseName,
                MaterialRequestForTransferCarton = settings.MaterialRequestForTransferCarton,
                SendCartonIdWithCycleCountPush = settings.SendCartonIdWithCycleCountPush,
                LastSyncTimestamp = settings.LastSyncTimestamp,
                LastItemSyncTimestamp = settings.LastItemSyncTimestamp,
                DatabaseType = settings.DatabaseType ?? "MySQL",
                DatabaseHost = settings.DatabaseHost ?? "localhost",
                DatabaseName = settings.DatabaseName ?? "wms_desktop",
                DatabaseUserName = settings.DatabaseUserName ?? "root",
                DatabasePassword = decryptedPassword,
                DatabasePort = settings.DatabasePort > 0 ? settings.DatabasePort : 3306,
                DatabaseExists = settings.DatabaseExists,
                TablesExist = settings.TablesExist,
                InventoryTrackingMode = settings.InventoryTrackingMode ?? "BinLevel",
                ItemSyncFilters = settings.ItemSyncFilters ?? "{\"custom_dcs\":\"MENFOTSLP\"}",
                ItemSyncAttributeFilters = settings.ItemSyncAttributeFilters ?? "{\"year\":[\"=\",2026]}",
                ItemSyncFields = settings.ItemSyncFields ?? "[\"item_code\",\"item_name\",\"year\",\"season\",\"brand\",\"stock_uom\",\"is_stock\",\"barcode\",\"custom_wms_modified\",\"disabled\"]",
                ItemSyncFlattenAttributes = settings.ItemSyncFlattenAttributes,
                SyncEndpoints = settings.SyncEndpoints != null && settings.SyncEndpoints.Count > 0
                    ? new ObservableCollection<SyncEndpointConfig>(settings.SyncEndpoints.Select(d => new SyncEndpointConfig
                    {
                        Name = d.Name ?? "Endpoint",
                        BaseUrl = d.BaseUrl ?? string.Empty,
                        ApiKey = d.ApiKey ?? string.Empty,
                        Enabled = d.Enabled,
                        SyncType = string.IsNullOrWhiteSpace(d.SyncType) ? SyncTypeNames.All : d.SyncType
                    }))
                    : new ObservableCollection<SyncEndpointConfig>(),
                PushEndpoints = settings.PushEndpoints != null && settings.PushEndpoints.Count > 0
                    ? new ObservableCollection<PushEndpointConfig>(settings.PushEndpoints.Select(p => new PushEndpointConfig
                    {
                        Name = p.Name ?? "Push 1",
                        EndpointType = string.IsNullOrWhiteSpace(p.EndpointType) ? PushEndpointTypeNames.Custom : p.EndpointType,
                        BaseUrl = p.BaseUrl ?? string.Empty,
                        Method = string.IsNullOrWhiteSpace(p.Method) ? PushEndpointMethodNames.Post : p.Method,
                        ApiKey = p.ApiKey ?? string.Empty,
                        Enabled = p.Enabled
                    }))
                    : new ObservableCollection<PushEndpointConfig>(),
                ItemSyncPushUrl = settings.ItemSyncPushUrl ?? string.Empty
            };
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Failed to load settings from file", ex);
            return null;
        }
    }

    /// <summary>
    /// Save settings to file
    /// </summary>
    public static void SaveSettings(WmsSettings settings)
    {
        try
        {
            // Encrypt password before saving
            var encryptedPassword = string.Empty;
            if (!string.IsNullOrWhiteSpace(settings.DatabasePassword))
            {
                encryptedPassword = EncryptPassword(settings.DatabasePassword);
            }

            var settingsDto = new WmsSettingsDto
            {
                Company = settings.Company,
                ApiEndpointUrl = settings.ApiEndpointUrl,
                ErpNextApiUrl = settings.ErpNextApiUrl,
                ApiKey = settings.ApiKey,
                ErpNextApiKey = settings.ErpNextApiKey,
                SyncFrequencyMinutes = settings.SyncFrequencyMinutes,
                DefaultPickingWarehouse = settings.DefaultPickingWarehouse,
                DefaultReceivingWarehouseForPr = settings.DefaultReceivingWarehouseForPr,
                IntransitWarehouseName = settings.IntransitWarehouseName,
                MaterialRequestForTransferCarton = settings.MaterialRequestForTransferCarton,
                SendCartonIdWithCycleCountPush = settings.SendCartonIdWithCycleCountPush,
                LastSyncTimestamp = settings.LastSyncTimestamp,
                LastItemSyncTimestamp = settings.LastItemSyncTimestamp,
                DatabaseType = settings.DatabaseType,
                DatabaseHost = settings.DatabaseHost,
                DatabaseName = settings.DatabaseName,
                DatabaseUserName = settings.DatabaseUserName,
                EncryptedPassword = encryptedPassword,
                DatabasePort = settings.DatabasePort,
                DatabaseExists = settings.DatabaseExists,
                TablesExist = settings.TablesExist,
                InventoryTrackingMode = settings.InventoryTrackingMode,
                ItemSyncFilters = settings.ItemSyncFilters,
                ItemSyncAttributeFilters = settings.ItemSyncAttributeFilters,
                ItemSyncFields = settings.ItemSyncFields,
                ItemSyncFlattenAttributes = settings.ItemSyncFlattenAttributes,
                SyncEndpoints = settings.SyncEndpoints?.Select(e => new SyncEndpointConfigDto
                {
                    Name = e.Name,
                    BaseUrl = e.BaseUrl,
                    ApiKey = e.ApiKey,
                    Enabled = e.Enabled,
                    SyncType = e.SyncType ?? SyncTypeNames.All
                }).ToList() ?? new System.Collections.Generic.List<SyncEndpointConfigDto>(),
                PushEndpoints = settings.PushEndpoints?.Select(p => new PushEndpointConfigDto
                {
                    Name = p.Name,
                    EndpointType = p.EndpointType ?? PushEndpointTypeNames.Custom,
                    BaseUrl = p.BaseUrl,
                    Method = p.Method ?? PushEndpointMethodNames.Post,
                    ApiKey = p.ApiKey,
                    Enabled = p.Enabled
                }).ToList() ?? new System.Collections.Generic.List<PushEndpointConfigDto>(),
                ItemSyncPushUrl = settings.ItemSyncPushUrl ?? string.Empty
            };

            var options = new JsonSerializerOptions
            {
                WriteIndented = true,
                DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
            };

            var json = JsonSerializer.Serialize(settingsDto, options);
            File.WriteAllText(SettingsFilePath, json);
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Failed to save settings to file", ex);
            throw;
        }
    }

    /// <summary>
    /// Encrypt password using AES
    /// </summary>
    private static string EncryptPassword(string password)
    {
        if (string.IsNullOrWhiteSpace(password))
            return string.Empty;

        try
        {
            using var aes = Aes.Create();
            aes.Key = EncryptionKey;
            aes.Mode = CipherMode.CBC;
            aes.GenerateIV();

            using var encryptor = aes.CreateEncryptor();
            var plainBytes = Encoding.UTF8.GetBytes(password);
            var encryptedBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);

            // Combine IV and encrypted data
            var result = new byte[aes.IV.Length + encryptedBytes.Length];
            Array.Copy(aes.IV, 0, result, 0, aes.IV.Length);
            Array.Copy(encryptedBytes, 0, result, aes.IV.Length, encryptedBytes.Length);

            return Convert.ToBase64String(result);
        }
        catch
        {
            // If encryption fails, return as-is (fallback)
            return password;
        }
    }

    /// <summary>
    /// Decrypt password using AES
    /// </summary>
    private static string DecryptPassword(string encryptedPassword)
    {
        if (string.IsNullOrWhiteSpace(encryptedPassword))
            return string.Empty;

        try
        {
            var encryptedBytes = Convert.FromBase64String(encryptedPassword);

            using var aes = Aes.Create();
            aes.Key = EncryptionKey;
            aes.Mode = CipherMode.CBC;

            // Extract IV (first 16 bytes)
            var iv = new byte[16];
            Array.Copy(encryptedBytes, 0, iv, 0, 16);
            aes.IV = iv;

            // Extract encrypted data (rest of the bytes)
            var cipherBytes = new byte[encryptedBytes.Length - 16];
            Array.Copy(encryptedBytes, 16, cipherBytes, 0, cipherBytes.Length);

            using var decryptor = aes.CreateDecryptor();
            var decryptedBytes = decryptor.TransformFinalBlock(cipherBytes, 0, cipherBytes.Length);

            return Encoding.UTF8.GetString(decryptedBytes);
        }
        catch
        {
            // If decryption fails, return as-is (might be plain text from old version)
            return encryptedPassword;
        }
    }

    /// <summary>
    /// Get settings file path
    /// </summary>
    public static string GetSettingsFilePath()
    {
        return SettingsFilePath;
    }

    /// <summary>
    /// Check if string is valid Base64
    /// </summary>
    private static bool IsBase64String(string s)
    {
        if (string.IsNullOrWhiteSpace(s) || s.Length % 4 != 0)
            return false;

        try
        {
            Convert.FromBase64String(s);
            return true;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// DTO for serialization (excludes password, uses encrypted password instead)
    /// </summary>
    private class WmsSettingsDto
    {
        public string Company { get; set; } = string.Empty;
        public string ApiEndpointUrl { get; set; } = string.Empty;
        public string ErpNextApiUrl { get; set; } = string.Empty;
        public string ApiKey { get; set; } = string.Empty;
        public string ErpNextApiKey { get; set; } = string.Empty;
        public int SyncFrequencyMinutes { get; set; } = 15;
        public string? DefaultPickingWarehouse { get; set; }
        public string? DefaultReceivingWarehouseForPr { get; set; }
        public string? IntransitWarehouseName { get; set; }
        public string? MaterialRequestForTransferCarton { get; set; }
        public bool SendCartonIdWithCycleCountPush { get; set; }
        public DateTime? LastSyncTimestamp { get; set; }
        public DateTime? LastItemSyncTimestamp { get; set; }
        public string DatabaseType { get; set; } = "MySQL";
        public string DatabaseHost { get; set; } = "localhost";
        public string DatabaseName { get; set; } = "wms_desktop";
        public string DatabaseUserName { get; set; } = "root";
        
        [JsonIgnore(Condition = JsonIgnoreCondition.Always)]
        public string? DatabasePassword { get; set; } // Not saved directly
        
        public string EncryptedPassword { get; set; } = string.Empty; // Encrypted password is saved
        public int DatabasePort { get; set; } = 3306;
        public bool DatabaseExists { get; set; }
        public bool TablesExist { get; set; }
        public string InventoryTrackingMode { get; set; } = "BinLevel";
        public string ItemSyncFilters { get; set; } = "{\"custom_dcs\":\"MENFOTSLP\"}";
        public string ItemSyncAttributeFilters { get; set; } = "{\"year\":[\"=\",2026]}";
        public string ItemSyncFields { get; set; } = "[\"item_code\",\"item_name\",\"year\",\"season\",\"brand\",\"stock_uom\",\"is_stock\",\"barcode\",\"custom_wms_modified\",\"disabled\"]";
        public bool ItemSyncFlattenAttributes { get; set; } = true;
        public System.Collections.Generic.List<SyncEndpointConfigDto>? SyncEndpoints { get; set; }
        public System.Collections.Generic.List<PushEndpointConfigDto>? PushEndpoints { get; set; }
        public string ItemSyncPushUrl { get; set; } = string.Empty;
    }

    private class SyncEndpointConfigDto
    {
        public string Name { get; set; } = "ERPNext 1";
        public string BaseUrl { get; set; } = string.Empty;
        public string ApiKey { get; set; } = string.Empty;
        public bool Enabled { get; set; } = true;
        public string SyncType { get; set; } = SyncTypeNames.All;
    }

    private class PushEndpointConfigDto
    {
        public string Name { get; set; } = "Push 1";
        public string EndpointType { get; set; } = PushEndpointTypeNames.Custom;
        public string BaseUrl { get; set; } = string.Empty;
        public string Method { get; set; } = PushEndpointMethodNames.Post;
        public string ApiKey { get; set; } = string.Empty;
        public bool Enabled { get; set; } = true;
    }
}

