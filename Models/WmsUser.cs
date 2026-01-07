using System;
using System.Collections.Generic;

namespace Wms.Desktop.Models;

public sealed class WmsUser
{
    public string Username { get; init; } = string.Empty;
    public string Email { get; init; } = string.Empty;
    public string FirstName { get; init; } = string.Empty;
    public string LastName { get; init; } = string.Empty;
    public string? MobileNo { get; init; }
    public bool Enabled { get; init; }
    public DateTime? LastLogin { get; init; }
    public string? UserImagePath { get; init; }

    public IReadOnlyList<string> Roles { get; init; } = Array.Empty<string>();
}


