using System.Security.Cryptography;

namespace TaskFlow.Api.Auth;

/// <summary>PBKDF2-HMAC-SHA256 with a random 16-byte salt per password. Format: <c>v1.iterations.salt.hash</c> (base64).</summary>
public sealed class PasswordHasher(IConfiguration config)
{
    private const int SaltBytes = 16, HashBytes = 32;
    private int Iterations => config.GetValue("Auth:Pbkdf2Iterations", 600_000);

    public string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltBytes);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, HashBytes);
        return $"v1.{Iterations}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    public bool Verify(string password, string stored)
    {
        var parts = stored.Split('.');
        if (parts.Length != 4 || parts[0] != "v1" || !int.TryParse(parts[1], out var iterations) || iterations < 1) return false;
        try
        {
            var salt = Convert.FromBase64String(parts[2]);
            var expected = Convert.FromBase64String(parts[3]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException) { return false; }
    }

    /// <summary>A real hash to compare against when the email is unknown, so login timing does not reveal which emails exist.</summary>
    public string DummyHash => _dummy ??= Hash(Convert.ToBase64String(RandomNumberGenerator.GetBytes(18)));
    private static string? _dummy;

    /// <summary>Changes whenever the password changes; stored in the session cookie so a password change signs out other sessions.</summary>
    public static string Stamp(string passwordHash) =>
        Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(passwordHash)))[..16];
}
