using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace Wms.Desktop.ViewModels;

public abstract class BaseViewModel : INotifyPropertyChanged
{
    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        if (propertyName is null) return;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}


