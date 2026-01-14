using System;
using System.Globalization;
using System.Linq;
using System.Windows.Data;
using Wms.Desktop.Models;

namespace Wms.Desktop.Converters;

/// <summary>
/// Converter to show/hide Discrepancy column/totals based on whether any lines have Discrepancy
/// </summary>
public class HasDiscrepancyVisibilityConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is System.Collections.Generic.IEnumerable<CycleCountLine> lines)
        {
            // Show only if at least one line has Discrepancy (variance, not 0)
            // Discrepancy is now always a number (defaults to 0), so check if it's not 0
            return lines.Any(l => l.Discrepancy != 0) 
                ? System.Windows.Visibility.Visible 
                : System.Windows.Visibility.Collapsed;
        }
        return System.Windows.Visibility.Collapsed;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

