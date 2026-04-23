using System.Windows;
using System.Windows.Controls;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop.Views;

public partial class SettingsView : UserControl
{
    private bool _isUpdatingPassword = false;
    private bool _isUpdatingApiKey = false;
    private bool _isUpdatingErpNextApiKey = false;

    public SettingsView()
    {
        InitializeComponent();
        this.Loaded += SettingsView_Loaded;
    }

    private void SettingsView_Loaded(object sender, RoutedEventArgs e)
    {
        // Initialize password box when view loads
        if (DataContext is SettingsViewModel viewModel)
        {
            _isUpdatingPassword = true;
            PasswordBox.Password = viewModel.Settings.DatabasePassword ?? string.Empty;
            _isUpdatingPassword = false;

            // Initialize API Key password box
            _isUpdatingApiKey = true;
            ApiKeyPasswordBox.Password = viewModel.Settings.ApiKey ?? string.Empty;
            _isUpdatingApiKey = false;

            // Initialize ERPNext API Key password box
            _isUpdatingErpNextApiKey = true;
            ErpNextApiKeyPasswordBox.Password = viewModel.Settings.ErpNextApiKey ?? string.Empty;
            _isUpdatingErpNextApiKey = false;

            // Subscribe to settings changes to update password box if settings change externally
            viewModel.Settings.PropertyChanged += (s, args) =>
            {
                if (args.PropertyName == nameof(viewModel.Settings.DatabasePassword) && !_isUpdatingPassword)
                {
                    _isUpdatingPassword = true;
                    PasswordBox.Password = viewModel.Settings.DatabasePassword ?? string.Empty;
                    _isUpdatingPassword = false;
                }
                else if (args.PropertyName == nameof(viewModel.Settings.ApiKey) && !_isUpdatingApiKey)
                {
                    _isUpdatingApiKey = true;
                    ApiKeyPasswordBox.Password = viewModel.Settings.ApiKey ?? string.Empty;
                    _isUpdatingApiKey = false;
                }
                else if (args.PropertyName == nameof(viewModel.Settings.ErpNextApiKey) && !_isUpdatingErpNextApiKey)
                {
                    _isUpdatingErpNextApiKey = true;
                    ErpNextApiKeyPasswordBox.Password = viewModel.Settings.ErpNextApiKey ?? string.Empty;
                    _isUpdatingErpNextApiKey = false;
                }
            };
        }
    }

    private void PasswordBox_OnPasswordChanged(object sender, RoutedEventArgs e)
    {
        if (_isUpdatingPassword)
            return;

        if (DataContext is SettingsViewModel viewModel && sender is PasswordBox passwordBox)
        {
            _isUpdatingPassword = true;
            viewModel.Settings.DatabasePassword = passwordBox.Password;
            _isUpdatingPassword = false;
        }
    }

    private void ApiKeyPasswordBox_OnPasswordChanged(object sender, RoutedEventArgs e)
    {
        if (_isUpdatingApiKey)
            return;

        if (DataContext is SettingsViewModel viewModel && sender is PasswordBox passwordBox)
        {
            _isUpdatingApiKey = true;
            viewModel.Settings.ApiKey = passwordBox.Password;
            _isUpdatingApiKey = false;
        }
    }

    private void ErpNextApiKeyPasswordBox_OnPasswordChanged(object sender, RoutedEventArgs e)
    {
        if (_isUpdatingErpNextApiKey)
            return;

        if (DataContext is SettingsViewModel viewModel && sender is PasswordBox passwordBox)
        {
            _isUpdatingErpNextApiKey = true;
            viewModel.Settings.ErpNextApiKey = passwordBox.Password;
            _isUpdatingErpNextApiKey = false;
        }
    }
}


