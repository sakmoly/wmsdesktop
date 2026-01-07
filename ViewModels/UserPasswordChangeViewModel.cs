using System;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Wms.Desktop.Models;
using Wms.Desktop.Services;

namespace Wms.Desktop.ViewModels;

public partial class UserPasswordChangeViewModel : ObservableObject
{
    [ObservableProperty]
    private WmsUser? user;

    [ObservableProperty]
    private string currentPassword = string.Empty;

    [ObservableProperty]
    private string newPassword = string.Empty;

    [ObservableProperty]
    private string confirmPassword = string.Empty;

    [ObservableProperty]
    private bool isCurrentUser;

    [ObservableProperty]
    private string errorMessage = string.Empty;

    [ObservableProperty]
    private bool hasError;

    [ObservableProperty]
    private bool canChangePassword;

    [ObservableProperty]
    private string passwordMatchMessage = string.Empty;

    [ObservableProperty]
    private string passwordMatchColor = "#6B7280";

    [ObservableProperty]
    private bool showPasswordMatch;

    public string UserInfo => User != null 
        ? $"{User.Username} ({User.FirstName} {User.LastName})" 
        : string.Empty;

    public bool ShowCurrentPassword => IsCurrentUser;

    public event EventHandler<bool>? PasswordChanged;

    partial void OnNewPasswordChanged(string value)
    {
        ValidatePassword();
        CheckPasswordMatch();
    }

    partial void OnConfirmPasswordChanged(string value)
    {
        CheckPasswordMatch();
    }

    partial void OnCurrentPasswordChanged(string value)
    {
        ValidatePassword();
    }

    public void CheckPasswordMatch()
    {
        if (string.IsNullOrEmpty(NewPassword) && string.IsNullOrEmpty(ConfirmPassword))
        {
            ShowPasswordMatch = false;
            return;
        }

        ShowPasswordMatch = true;

        if (NewPassword == ConfirmPassword)
        {
            PasswordMatchMessage = "✓ Passwords match";
            PasswordMatchColor = "#10B981";
        }
        else
        {
            PasswordMatchMessage = "✗ Passwords do not match";
            PasswordMatchColor = "#DC2626";
        }

        ValidatePassword();
    }

    private void ValidatePassword()
    {
        HasError = false;
        ErrorMessage = string.Empty;

        // Validate current password if changing own password
        if (IsCurrentUser && string.IsNullOrWhiteSpace(CurrentPassword))
        {
            CanChangePassword = false;
            return;
        }

        // Validate new password
        if (string.IsNullOrWhiteSpace(NewPassword))
        {
            CanChangePassword = false;
            return;
        }

        if (NewPassword.Length < 6)
        {
            HasError = true;
            ErrorMessage = "Password must be at least 6 characters long";
            CanChangePassword = false;
            return;
        }

        // Check password match
        if (NewPassword != ConfirmPassword)
        {
            CanChangePassword = false;
            return;
        }

        CanChangePassword = true;
    }

    [RelayCommand]
    private async Task ChangePasswordAsync()
    {
        try
        {
            if (!CanChangePassword)
            {
                return;
            }

            var settings = SettingsService.LoadSettings();
            if (settings == null || !settings.DatabaseExists || !settings.TablesExist)
            {
                MessageBox.Show("Database connection not available.", "Error", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            // Hash the new password (SHA256 for now - can be upgraded to bcrypt later)
            var passwordHash = HashPassword(NewPassword);

            // Update password in database
            var success = await UserDataService.UpdateUserPasswordAsync(
                settings, 
                User!.Username, 
                passwordHash);

            if (success)
            {
                MessageBox.Show(
                    $"Password changed successfully for user {User.Username}.",
                    "Success",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information);

                PasswordChanged?.Invoke(this, true);
            }
            else
            {
                MessageBox.Show(
                    "Failed to change password. Please try again.",
                    "Error",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);

                PasswordChanged?.Invoke(this, false);
            }
        }
        catch (Exception ex)
        {
            ErrorLogService.LogError("Error changing password", ex);
            MessageBox.Show(
                $"An error occurred while changing password: {ex.Message}",
                "Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);

            PasswordChanged?.Invoke(this, false);
        }
    }

    private static string HashPassword(string password)
    {
        // Use SHA256 for now - can be upgraded to bcrypt for production
        using var sha256 = SHA256.Create();
        var bytes = Encoding.UTF8.GetBytes(password);
        var hash = sha256.ComputeHash(bytes);
        return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
    }
}

