using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Wms.Desktop.Models;
using Wms.Desktop.Windows;

namespace Wms.Desktop.Views;

public partial class UserListView : UserControl
{
    public UserListView()
    {
        InitializeComponent();
    }

    private void UsersGrid_MouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (UsersGrid.SelectedItem is not WmsUser user)
        {
            return;
        }

        // Check if user is the current logged-in user
        // For now, we'll assume it's not the current user (can be enhanced later)
        var isCurrentUser = false; // TODO: Get from current session/user context

        // Open password change window
        var window = new UserPasswordChangeWindow(user, isCurrentUser)
        {
            Owner = Window.GetWindow(this)
        };

        var result = window.ShowDialog();
        
        if (result == true)
        {
            // Password changed successfully
            // Optionally refresh the user list or show a message
            MessageBox.Show(
                $"Password changed successfully for {user.Username}.",
                "Success",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
        }
    }
}


