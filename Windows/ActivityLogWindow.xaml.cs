using System.Windows;
using System.Windows.Media;
using Wms.Desktop.Services;

namespace Wms.Desktop.Windows;

public partial class ActivityLogWindow : Window
{
    public ActivityLogWindow()
    {
        InitializeComponent();
        LoadLogs();
        ErrorLogService.LogAdded += OnLogAdded;
        Closed += (_, _) => ErrorLogService.LogAdded -= OnLogAdded;
    }

    private void LoadLogs()
    {
        LogListBox.Items.Clear();
        foreach (var entry in ErrorLogService.GetRecentLogs())
        {
            AddLogEntry(entry);
        }
        ScrollToBottom();
    }

    private void OnLogAdded(LogEntry entry)
    {
        if (!Dispatcher.CheckAccess())
        {
            Dispatcher.Invoke(() => OnLogAdded(entry));
            return;
        }
        AddLogEntry(entry);
        ScrollToBottom();
    }

    private void AddLogEntry(LogEntry entry)
    {
        var text = entry.FullLine;
        var item = new System.Windows.Controls.TextBlock
        {
            Text = text,
            TextWrapping = TextWrapping.NoWrap,
            Foreground = entry.Level == "ERROR" ? Brushes.DarkRed : Brushes.Black
        };
        LogListBox.Items.Add(item);
    }

    private void ScrollToBottom()
    {
        if (LogListBox.Items.Count > 0)
        {
            LogListBox.ScrollIntoView(LogListBox.Items[LogListBox.Items.Count - 1]);
        }
    }
}
