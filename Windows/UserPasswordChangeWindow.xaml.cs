using System;
using System.Windows;
using System.Windows.Controls;
using Wms.Desktop.Models;
using Wms.Desktop.ViewModels;

namespace Wms.Desktop.Windows;

public partial class UserPasswordChangeWindow : Window
{
    public UserPasswordChangeViewModel ViewModel => (UserPasswordChangeViewModel)DataContext;

    public UserPasswordChangeWindow(WmsUser user, bool isCurrentUser = false)
    {
        InitializeComponent();
        ViewModel.User = user;
        ViewModel.IsCurrentUser = isCurrentUser;
        ViewModel.PasswordChanged += ViewModel_PasswordChanged;
    }

    private void CurrentPasswordBox_PasswordChanged(object sender, RoutedEventArgs e)
    {
        if (sender is PasswordBox passwordBox)
        {
            ViewModel.CurrentPassword = passwordBox.Password;
        }
    }

    private void NewPasswordBox_PasswordChanged(object sender, RoutedEventArgs e)
    {
        if (sender is PasswordBox passwordBox)
        {
            ViewModel.NewPassword = passwordBox.Password;
            CheckPasswordMatch();
        }
    }

    private void ConfirmPasswordBox_PasswordChanged(object sender, RoutedEventArgs e)
    {
        if (sender is PasswordBox passwordBox)
        {
            ViewModel.ConfirmPassword = passwordBox.Password;
            CheckPasswordMatch();
        }
    }

    private void CheckPasswordMatch()
    {
        ViewModel.CheckPasswordMatch();
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }

    private void ViewModel_PasswordChanged(object? sender, bool success)
    {
        if (success)
        {
            DialogResult = true;
            Close();
        }
    }
}

