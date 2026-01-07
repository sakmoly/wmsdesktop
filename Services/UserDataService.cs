using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MySql.Data.MySqlClient;
using Wms.Desktop.Models;

namespace Wms.Desktop.Services;

public static class UserDataService
{
    /// <summary>
    /// Get all Users from database
    /// </summary>
    public static async Task<List<WmsUser>> GetUsersAsync(WmsSettings settings)
    {
        var users = new List<WmsUser>();
        
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            // Note: tabUser table has: user_code, name, role, active
            // WmsUser model expects: Username, Email, FirstName, LastName, MobileNo, Enabled, LastLogin, Roles
            // We'll map user_code -> Username, name -> FirstName (and parse for LastName if needed), active -> Enabled
            var sql = @"SELECT user_code, name, role, active, created_at, updated_at
                        FROM tabUser
                        ORDER BY user_code";
            
            await using var cmd = new MySqlCommand(sql, connection);
            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var userCode = reader.GetString(0);
                var name = reader.GetString(1);
                var nameParts = name.Split(' ', 2);
                var firstName = nameParts.Length > 0 ? nameParts[0] : string.Empty;
                var lastName = nameParts.Length > 1 ? nameParts[1] : string.Empty;

                var roles = new List<string>();
                if (!reader.IsDBNull(2))
                {
                    var roleValue = reader.GetString(2);
                    if (!string.IsNullOrWhiteSpace(roleValue))
                    {
                        roles.Add(roleValue);
                    }
                }

                users.Add(new WmsUser
                {
                    Username = userCode, // user_code
                    Email = $"{userCode}@printechs.com", // Generate email from user_code
                    FirstName = firstName,
                    LastName = lastName,
                    MobileNo = null, // Not in database schema
                    Enabled = reader.GetBoolean(3), // active
                    LastLogin = null, // Not in database schema
                    Roles = roles
                });
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error loading Users from database", ex);
        }

        return users;
    }

    /// <summary>
    /// Get User by user_code from database
    /// </summary>
    public static async Task<WmsUser?> GetUserByCodeAsync(WmsSettings settings, string userCode)
    {
        var users = await GetUsersAsync(settings);
        return users.FirstOrDefault(u => u.Username == userCode);
    }

    /// <summary>
    /// Update user password in database
    /// </summary>
    public static async Task<bool> UpdateUserPasswordAsync(WmsSettings settings, string userCode, string passwordHash)
    {
        try
        {
            var connectionString = DatabaseService.BuildConnectionString(settings);
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync();

            var sql = @"UPDATE tabUser 
                       SET password_hash = ?, 
                           updated_at = CURRENT_TIMESTAMP
                       WHERE user_code = ?";

            await using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@password_hash", passwordHash);
            cmd.Parameters.AddWithValue("@user_code", userCode);

            var rowsAffected = await cmd.ExecuteNonQueryAsync();

            if (rowsAffected > 0)
            {
                ErrorLogService.LogInfo($"UserDataService: Password updated for user {userCode}");
                return true;
            }
            else
            {
                ErrorLogService.LogInfo($"UserDataService: User {userCode} not found");
                return false;
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError($"Error updating password for user {userCode}", ex);
            return false;
        }
    }
}

