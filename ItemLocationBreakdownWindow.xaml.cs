using System.Threading.Tasks;
using System.Windows;
using Wms.Desktop.Models;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop;

public partial class ItemLocationBreakdownWindow : Window
{
    private readonly Item _item;
    
    public ItemLocationBreakdownWindow(Item item)
    {
        InitializeComponent();
        _item = item;
        DataContext = new ItemLocationBreakdownViewModel(item);
        
        // Load data when window is loaded
        this.Loaded += ItemLocationBreakdownWindow_Loaded;
    }
    
    private async void ItemLocationBreakdownWindow_Loaded(object sender, RoutedEventArgs e)
    {
        await RefreshDataAsync();
    }
    
    private async void RefreshButton_Click(object sender, RoutedEventArgs e)
    {
        await RefreshDataAsync();
    }
    
    private async Task RefreshDataAsync()
    {
        if (DataContext is ItemLocationBreakdownViewModel viewModel)
        {
            // Clear existing data first
            viewModel.Locations.Clear();
            
            // Load fresh data (this will reset TotalQty internally)
            await viewModel.LoadLocationDataAsync(_item);
        }
    }
}


