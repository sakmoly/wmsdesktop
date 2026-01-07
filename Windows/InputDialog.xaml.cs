using System.Windows;

namespace Wms.Desktop.Windows;

public partial class InputDialog : Window
{
    public string? InputText { get; private set; }

    public InputDialog(string prompt, string? defaultValue = null)
    {
        InitializeComponent();
        PromptTextBlock.Text = prompt;
        if (!string.IsNullOrEmpty(defaultValue))
        {
            InputTextBox.Text = defaultValue;
        }
        InputTextBox.Focus();
        InputTextBox.SelectAll();
    }

    private void OkButton_Click(object sender, RoutedEventArgs e)
    {
        InputText = InputTextBox.Text;
        DialogResult = true;
    }

    public static string? Show(string prompt, string? defaultValue = null, Window? owner = null)
    {
        var dialog = new InputDialog(prompt, defaultValue)
        {
            Owner = owner ?? Application.Current.MainWindow
        };
        
        if (dialog.ShowDialog() == true)
        {
            return dialog.InputText;
        }
        
        return null;
    }
}

