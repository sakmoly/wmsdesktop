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
        if (DataContext is ItemLocationBreakdownViewModel viewModel)
        {
            await viewModel.LoadLocationDataAsync(_item);
        }
    }
}


