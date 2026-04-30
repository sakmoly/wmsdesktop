using System.Windows;

namespace Wms.Desktop.Windows;

public partial class MobileSessionReleaseReasonWindow : Window
{
    public string? Reason { get; private set; }

    public MobileSessionReleaseReasonWindow(string summaryForSupervisor)
    {
        InitializeComponent();
        SummaryText.Text = summaryForSupervisor;
        ReasonBox.Focus();
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
    }

    private void Release_Click(object sender, RoutedEventArgs e)
    {
        var r = ReasonBox.Text?.Trim() ?? "";
        if (r.Length < 3)
        {
            ValidationText.Text = "Enter a reason with at least 3 characters.";
            ValidationText.Visibility = Visibility.Visible;
            return;
        }

        if (r.Length > 2000)
        {
            ValidationText.Text = "Reason must be 2000 characters or less.";
            ValidationText.Visibility = Visibility.Visible;
            return;
        }

        Reason = r;
        DialogResult = true;
    }
}
