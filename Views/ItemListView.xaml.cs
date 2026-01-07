using System.Windows;
using System.Windows.Controls;
using Wms.Desktop.Models;

namespace Wms.Desktop.Views;

public partial class ItemListView : UserControl
{
    public ItemListView()
    {
        InitializeComponent();
        // Initially disable the button
        ShowLocationsButton.IsEnabled = false;
    }

    private void ItemsGrid_OnSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        // Enable button only when an item is selected
        ShowLocationsButton.IsEnabled = ItemsGrid.SelectedItem is Item;
    }

    private void ShowLocationsButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (ItemsGrid.SelectedItem is not Item item)
        {
            MessageBox.Show("Please select an item first.", "Item Location Breakdown",
                MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var parentWindow = Window.GetWindow(this);
        var window = new ItemLocationBreakdownWindow(item)
        {
            Owner = parentWindow
        };
        
        // Show dialog - this will block until closed
        window.ShowDialog();
        
        // After dialog closes, ensure parent window regains focus properly
        // This prevents navigation selection from changing unintentionally
        if (parentWindow != null)
        {
            parentWindow.Focus();
            parentWindow.Activate();
        }
    }
}


