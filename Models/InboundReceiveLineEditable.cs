using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace Wms.Desktop.Models;

/// <summary>
/// Editable version of InboundReceiveLine for UI binding
/// </summary>
public sealed class InboundReceiveLineEditable : INotifyPropertyChanged
{
    private string _cartonId = string.Empty;
    private string _itemCode = string.Empty;
    private double _expectedQty;
    private double _receivedQty;
    private string _condition = "Good";
    private string? _remarks;

    public event PropertyChangedEventHandler? PropertyChanged;

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }

    public string CartonId
    {
        get => _cartonId;
        set { _cartonId = value; OnPropertyChanged(); }
    }

    public string ItemCode
    {
        get => _itemCode;
        set { _itemCode = value; OnPropertyChanged(); }
    }

    public double ExpectedQty
    {
        get => _expectedQty;
        set { _expectedQty = value; OnPropertyChanged(); }
    }

    public double ReceivedQty
    {
        get => _receivedQty;
        set 
        { 
            _receivedQty = value; 
            OnPropertyChanged();
            OnPropertyChanged(nameof(IsShort));
            OnPropertyChanged(nameof(IsOver));
        }
    }

    public string Condition
    {
        get => _condition;
        set { _condition = value; OnPropertyChanged(); }
    }

    public string? Remarks
    {
        get => _remarks;
        set { _remarks = value; OnPropertyChanged(); }
    }

    public bool IsShort => ReceivedQty < ExpectedQty;
    public bool IsOver => ReceivedQty > ExpectedQty;

    public InboundReceiveLine ToInboundReceiveLine()
    {
        return new InboundReceiveLine
        {
            CartonId = CartonId,
            ItemCode = ItemCode,
            ExpectedQty = ExpectedQty,
            ReceivedQty = ReceivedQty,
            Condition = Condition,
            Remarks = Remarks
        };
    }

    public static InboundReceiveLineEditable FromInboundReceiveLine(InboundReceiveLine line)
    {
        return new InboundReceiveLineEditable
        {
            CartonId = line.CartonId,
            ItemCode = line.ItemCode,
            ExpectedQty = line.ExpectedQty,
            ReceivedQty = line.ReceivedQty,
            Condition = line.Condition,
            Remarks = line.Remarks
        };
    }
}

