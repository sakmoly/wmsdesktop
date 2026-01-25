using System;
using System.Windows;
using Wms.Desktop.Services;
using Wms.Desktop.Windows;

namespace Wms.Desktop;

public partial class App : Application
{
    private void Application_Startup(object sender, StartupEventArgs e)
    {
        try
        {
            // Ensure settings exist
            var settings = SettingsService.LoadSettings();
            
            // Show login window
            var loginWindow = new LoginWindow();
            var loginResult = loginWindow.ShowDialog();

            if (loginResult == true && loginWindow.LoginSuccessful)
            {
                try
                {
                    // Login successful - show main window
                    var mainWindow = new MainWindow();
                    MainWindow = mainWindow;
                    
                    // Switch to normal shutdown mode so app closes when main window closes
                    ShutdownMode = ShutdownMode.OnMainWindowClose;
                    
                    mainWindow.Show();
                }
                catch (Exception ex)
                {
                    ErrorLogService.LogError($"App: Failed to open MainWindow: {ex.Message}", ex);
                    MessageBox.Show($"Failed to open main window: {ex.Message}\n\nCheck error log for details.", 
                        "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                    Shutdown();
                }
            }
            else
            {
                // Login cancelled or failed - exit application
                Shutdown();
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Application startup error: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            Shutdown();
        }
    }
}


