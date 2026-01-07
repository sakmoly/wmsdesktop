using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Wms.Desktop.Models;

namespace Wms.Desktop.Views;

public partial class AsnListView : UserControl
{
    public AsnListView()
    {
        InitializeComponent();
    }

    private void AsnGrid_OnMouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (AsnGrid.SelectedItem is not Asn asn)
        {
            return;
        }

        var detailWindow = new AsnDetailWindow(asn)
        {
            Owner = Window.GetWindow(this)
        };
        detailWindow.ShowDialog();
    }
}

