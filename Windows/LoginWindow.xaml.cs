using System.Windows;
using System.Windows.Input;
using Wms.Desktop.Services;

namespace Wms.Desktop.Windows;

public partial class LoginWindow : Window
{
    public bool LoginSuccessful { get; private set; }

    public LoginWindow()
    {
        InitializeComponent();
        
        // Load remembered username if exists
        var settings = SettingsService.LoadSettings();
        if (settings != null && !string.IsNullOrEmpty(settings.RememberedUsername))
        {
            UsernameTextBox.Text = settings.RememberedUsername;
            RememberMeCheckBox.IsChecked = true;
            PasswordBox.Focus();
        }
        else
        {
            UsernameTextBox.Focus();
        }
    }

    private async void LoginButton_Click(object sender, RoutedEventArgs e)
    {
        await PerformLoginAsync();
    }

    private async System.Threading.Tasks.Task PerformLoginAsync()
    {
        var username = UsernameTextBox.Text?.Trim();
        var password = PasswordBox.Password;

        // Validate inputs
        if (string.IsNullOrWhiteSpace(username))
        {
            ShowError("Please enter your username.");
            UsernameTextBox.Focus();
            return;
        }

        if (string.IsNullOrWhiteSpace(password))
        {
            ShowError("Please enter your password.");
            PasswordBox.Focus();
            return;
        }

        // Show loading state
        SetLoadingState(true);
        HideError();

        try
        {
            var settings = SettingsService.LoadSettings();
            if (settings == null)
            {
                ShowError("Settings not found. Please configure the application first.");
                return;
            }

            // Perform login
            var result = await AuthService.LoginAsync(settings, username, password);

            if (result.Success)
            {
                // Update settings with token and user info
                settings.ApiKey = result.Token!;
                settings.LoggedInUserCode = result.UserCode;
                settings.LoggedInUserName = result.UserName;
                settings.LoggedInUserRole = result.Role;

                // Handle remember me
                if (RememberMeCheckBox.IsChecked == true)
                {
                    settings.RememberedUsername = username;
                }
                else
                {
                    settings.RememberedUsername = null;
                }

                // Save settings
                SettingsService.SaveSettings(settings);

                LoginSuccessful = true;
                DialogResult = true;
                Close();
            }
            else
            {
                ShowError(result.ErrorMessage ?? "Login failed. Please check your credentials.");
                PasswordBox.Clear();
                PasswordBox.Focus();
            }
        }
        catch (System.Exception ex)
        {
            ErrorLogService.LogError($"LoginWindow: Unexpected error: {ex.Message}", ex);
            ShowError($"An error occurred: {ex.Message}");
        }
        finally
        {
            SetLoadingState(false);
        }
    }

    private void TextBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            PasswordBox.Focus();
        }
    }

    private async void PasswordBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            await PerformLoginAsync();
        }
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }

    private void ShowError(string message)
    {
        ErrorMessage.Text = message;
        ErrorMessage.Visibility = Visibility.Visible;
    }

    private void HideError()
    {
        ErrorMessage.Visibility = Visibility.Collapsed;
    }

    private void SetLoadingState(bool isLoading)
    {
        LoginButton.Visibility = isLoading ? Visibility.Collapsed : Visibility.Visible;
        LoadingPanel.Visibility = isLoading ? Visibility.Visible : Visibility.Collapsed;
        UsernameTextBox.IsEnabled = !isLoading;
        PasswordBox.IsEnabled = !isLoading;
        RememberMeCheckBox.IsEnabled = !isLoading;
    }
}
