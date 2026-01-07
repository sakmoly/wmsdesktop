using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Wms.Desktop.Models;

namespace Wms.Desktop.Views;

public partial class WmsContainerListView : UserControl
{
    public WmsContainerListView()
    {
        InitializeComponent();
    }

    private void ContainersGrid_OnMouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (ContainersGrid.SelectedItem is not WmsContainer container)
        {
            return;
        }

        var window = new WmsContainerDetailWindow(container)
        {
            Owner = Window.GetWindow(this)
        };
        window.ShowDialog();
    }
}


