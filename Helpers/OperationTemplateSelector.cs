using System.Windows;
using System.Windows.Controls;
using Wms.Desktop.Models;

namespace Wms.Desktop.Helpers;

public class OperationTemplateSelector : DataTemplateSelector
{
    public DataTemplate? ReceivingTemplate { get; set; }
    public DataTemplate? PutawayTemplate { get; set; }
    public DataTemplate? PickingTemplate { get; set; }
    public DataTemplate? CycleCountTemplate { get; set; }
    public DataTemplate? DefaultTemplate { get; set; }

    public override DataTemplate SelectTemplate(object item, DependencyObject container)
    {
        if (item is not WmsTransaction tx)
            return DefaultTemplate ?? base.SelectTemplate(item, container);

        var template = tx.OperationType switch
        {
            OperationType.Receiving => ReceivingTemplate ?? DefaultTemplate,
            OperationType.Putaway => PutawayTemplate ?? DefaultTemplate,
            OperationType.Picking => PickingTemplate ?? DefaultTemplate,
            OperationType.CycleCount => CycleCountTemplate ?? DefaultTemplate,
            _ => DefaultTemplate
        };

        return template ?? base.SelectTemplate(item, container);
    }
}

