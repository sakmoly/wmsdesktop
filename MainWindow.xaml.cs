using System.Linq;
using System.Windows;
using System.Windows.Controls;
using Wms.Desktop.Services;
using Wms.Desktop.Views;
using Wms.Desktop.Windows;

namespace Wms.Desktop;

public partial class MainWindow : Window
{
    private Button? _selectedButton;
    
    public MainWindow()
    {
        InitializeComponent();
        
        // Load and display logged-in user info
        LoadUserInfo();
        
        // Default view
        MainContent.Content = new SettingsView();
        // Set Settings as default selected
        _selectedButton = SettingsButton;
        UpdateButtonSelection(SettingsButton);
        
        // Preserve selection when window regains focus (e.g., after dialog closes)
        this.Activated += (s, e) =>
        {
            if (_selectedButton != null)
            {
                UpdateButtonSelection(_selectedButton);
            }
        };
    }
    
    private void LoadUserInfo()
    {
        var settings = SettingsService.LoadSettings();
        if (settings != null)
        {
            LoggedInUserName.Text = settings.LoggedInUserName ?? settings.LoggedInUserCode ?? "User";
            LoggedInUserRole.Text = settings.LoggedInUserRole ?? "User";
        }
    }
    
    private void LogoutButton_Click(object sender, RoutedEventArgs e)
    {
        var result = MessageBox.Show(
            "Are you sure you want to logout?",
            "Confirm Logout",
            MessageBoxButton.YesNo,
            MessageBoxImage.Question);

        if (result == MessageBoxResult.Yes)
        {
            // Clear token and user info from settings
            var settings = SettingsService.LoadSettings();
            if (settings != null)
            {
                settings.ApiKey = string.Empty;
                settings.LoggedInUserCode = null;
                settings.LoggedInUserName = null;
                settings.LoggedInUserRole = null;
                // Keep RememberedUsername if set
                SettingsService.SaveSettings(settings);
            }

            // Show login window
            var loginWindow = new LoginWindow();
            var loginResult = loginWindow.ShowDialog();

            if (loginResult == true && loginWindow.LoginSuccessful)
            {
                // Reload user info after successful re-login
                LoadUserInfo();
            }
            else
            {
                // User cancelled login - close application
                Application.Current.Shutdown();
            }
        }
    }

    private void UpdateButtonSelection(Button selectedButton)
    {
        // Reset all navigation buttons to default style
        // Find all buttons in the navigation Grid -> StackPanel (Row 0)
        var mainGrid = (System.Windows.Controls.Grid)this.Content;
        var navigationGrid = (System.Windows.Controls.Grid)mainGrid.Children[0];
        var navigationPanel = (System.Windows.Controls.StackPanel)navigationGrid.Children[0];
        
        foreach (var expander in navigationPanel.Children.OfType<System.Windows.Controls.Expander>())
        {
            if (expander.Content is System.Windows.Controls.StackPanel panel)
            {
                foreach (var button in panel.Children.OfType<Button>())
                {
                    button.Background = new System.Windows.Media.SolidColorBrush(
                        System.Windows.Media.Color.FromRgb(17, 24, 39)); // #111827
                }
            }
        }
        
        // Highlight selected button
        if (selectedButton != null)
        {
            selectedButton.Background = new System.Windows.Media.SolidColorBrush(
                System.Windows.Media.Color.FromRgb(59, 130, 246)); // #3B82F6 - Attractive blue
            _selectedButton = selectedButton;
        }
    }

    private void SettingsButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new SettingsView();
    }

    private void WarehousesButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new WarehouseListView();
    }

    private void ItemsButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new ItemListView();
    }

    private void ItemGroupsButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new ItemGroupListView();
    }

    private void BrandsButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new BrandListView();
    }

    private void SuppliersButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new SupplierListView();
    }

    private void AsnsButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new AsnListView();
    }

    private void DistributionPlansButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new DistributionPlanListView();
    }

    private void TransferOrdersButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new TransferOrderListView();
    }

    private void PurchaseOrdersButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new PurchaseOrderListView();
    }

    private void WmsTransactionsButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new WmsTransactionListView();
    }

    private void WmsContainersButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new WmsContainerListView();
    }

    private void RolesButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new RoleListView();
    }

    private void UsersButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new UserListView();
    }

    private void ZonesButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new ZoneListView();
    }

    private void AislesButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new AisleListView();
    }

    private void RacksButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new RackListView();
    }

    private void LocationsButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new LocationListView();
    }

    private void InboundSessionsButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new InboundSessionListView();
    }

    private void SortBoxesButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new SortBoxListView();
    }

    private void TransferCartonsButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new TransferCartonListView();
    }

    private void PutawayTasksButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new PutawayTaskListView();
    }

    private void TransferInButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new TransferInListView();
    }

    private void MaterialRequestsButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new MaterialRequestListView();
    }

    private void StockLedgerButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new StockLedgerView();
    }

    private void TransactionHistoryButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new TransactionHistoryView();
    }

    private void CycleCountButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new CycleCountTaskListView();
    }

    private void RelocationButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button button)
        {
            UpdateButtonSelection(button);
        }
        MainContent.Content = new RelocationListView();
    }
}


