using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Wms.Desktop.Models;

namespace Wms.Desktop.Views;

public partial class DistributionPlanListView : UserControl
{
    public DistributionPlanListView()
    {
        InitializeComponent();
    }

    private void DistributionPlansGrid_OnMouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (DistributionPlansGrid.SelectedItem is not DistributionPlan dp)
        {
            return;
        }

        var detailWindow = new DistributionPlanDetailWindow(dp)
        {
            Owner = Window.GetWindow(this)
        };
        detailWindow.ShowDialog();
    }
}

