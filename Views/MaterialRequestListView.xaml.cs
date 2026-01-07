using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Wms.Desktop.Models;

namespace Wms.Desktop.Views;

public partial class MaterialRequestListView : UserControl
{
    public MaterialRequestListView()
    {
        InitializeComponent();
    }

    private void MaterialRequestGrid_OnMouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (MaterialRequestGrid.SelectedItem is not MaterialRequest materialRequest)
        {
            return;
        }

        var detailWindow = new MaterialRequestDetailWindow(materialRequest)
        {
            Owner = Window.GetWindow(this)
        };
        detailWindow.ShowDialog();
    }
}

