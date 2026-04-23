using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace Wms.Desktop.Converters;

public class StringToVisibilityConverter : IValueConverter
{
    public static readonly StringToVisibilityConverter Instance = new();

    /// <param name="parameter">"Inverse" = Visible when string is empty, Collapsed when non-empty.</param>
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var empty = !(value is string str) || string.IsNullOrWhiteSpace(str);
        var inverse = "Inverse".Equals(parameter as string, StringComparison.OrdinalIgnoreCase);
        if (inverse)
            return empty ? Visibility.Visible : Visibility.Collapsed;
        return empty ? Visibility.Collapsed : Visibility.Visible;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}
