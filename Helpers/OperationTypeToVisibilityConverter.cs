using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;
using Wms.Desktop.Models;

namespace Wms.Desktop.Helpers;

public class OperationTypeToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is not OperationType op || parameter is null)
            return Visibility.Collapsed;

        var param = parameter.ToString();
        if (Enum.TryParse<OperationType>(param, out var needed))
            return op == needed ? Visibility.Visible : Visibility.Collapsed;

        return Visibility.Collapsed;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => Binding.DoNothing;
}

