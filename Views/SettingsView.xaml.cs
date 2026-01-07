using System.Windows;
using System.Windows.Controls;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop.Views;

public partial class SettingsView : UserControl
{
    private bool _isUpdatingPassword = false;

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

            // Subscribe to settings changes to update password box if settings change externally
            viewModel.Settings.PropertyChanged += (s, args) =>
            {
                if (args.PropertyName == nameof(viewModel.Settings.DatabasePassword) && !_isUpdatingPassword)
                {
                    _isUpdatingPassword = true;
                    PasswordBox.Password = viewModel.Settings.DatabasePassword ?? string.Empty;
                    _isUpdatingPassword = false;
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
}


