using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Wms.Desktop.Models;

namespace Wms.Desktop.Views;

public partial class CycleCountTaskListView : UserControl
{
    public CycleCountTaskListView()
    {
        InitializeComponent();
    }

    private void CycleCountTaskGrid_OnMouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (CycleCountTaskGrid.SelectedItem is not CycleCountTask task)
        {
            return;
        }

        var detailWindow = new CycleCountTaskDetailWindow(task)
        {
            Owner = Window.GetWindow(this)
        };
        detailWindow.ShowDialog();
    }
}

