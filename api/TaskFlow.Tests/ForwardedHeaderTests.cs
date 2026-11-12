using System.Net;
using System.Net.Http.Json;

namespace TaskFlow.Tests;

/// <summary>
/// Forwarded-header trust: entries added by private/loopback proxies are honoured, public addresses in
/// X-Forwarded-For are treated as clients. A client-supplied spoofed leftmost value behind a real
/// appending proxy can therefore never become the effective RemoteIpAddress that rate limiting keys on.
/// </summary>
public sealed class SpoofedForwardedForCannotEvadeRateLimits : IDisposable
{
    private readonly ApiFactory _factory = new(authPerMinute: 3, forwardedHeaders: true);
    private readonly HttpClient _http;

    public SpoofedForwardedForCannotEvadeRateLimits() => _http = _factory.CreateAnonymousClient();

    [Fact]
    public async Task Rotating_a_spoofed_leftmost_value_does_not_bypass_the_auth_limiter()
    {
        // The real proxy appends the client's address; the leftmost value is attacker-chosen.
        // All four attempts must count against one bucket (the appended client), so the fourth is 429.
        for (var i = 1; i <= 3; i++)
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
            {
                Content = JsonContent.Create(new { email = "nobody@example.test", password = "wrong-password" }),
            };
            req.Headers.Add("X-Forwarded-For", $"{i}.1.1.{i}, 8.8.8.9");
            Assert.Equal(HttpStatusCode.Unauthorized, (await _http.SendAsync(req)).StatusCode);
        }
        using var fourth = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
        {
            Content = JsonContent.Create(new { email = "nobody@example.test", password = "wrong-password" }),
        };
        fourth.Headers.Add("X-Forwarded-For", "4.1.1.4, 8.8.8.9");
        Assert.Equal(HttpStatusCode.TooManyRequests, (await _http.SendAsync(fourth)).StatusCode);
    }

    public void Dispose() => _http.Dispose();
}

public sealed class DistinctAppendedClientsKeepSeparateBuckets : IDisposable
{
    private readonly ApiFactory _factory = new(authPerMinute: 1, forwardedHeaders: true);
    private readonly HttpClient _http;

    public DistinctAppendedClientsKeepSeparateBuckets() => _http = _factory.CreateAnonymousClient();

    [Fact]
    public async Task A_different_appended_client_is_a_different_rate_limit_identity()
    {
        // Hardening must not collapse all clients into one bucket: the second appended client goes through.
        using (var req = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
        {
            Content = JsonContent.Create(new { email = "a@example.test", password = "wrong-password" }),
        })
        {
            req.Headers.Add("X-Forwarded-For", "5.5.5.5, 8.8.8.9");
            Assert.Equal(HttpStatusCode.Unauthorized, (await _http.SendAsync(req)).StatusCode);
        }
        using (var req = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
        {
            Content = JsonContent.Create(new { email = "b@example.test", password = "wrong-password" }),
        })
        {
            req.Headers.Add("X-Forwarded-For", "6.6.6.6, 8.8.8.10");
            Assert.Equal(HttpStatusCode.Unauthorized, (await _http.SendAsync(req)).StatusCode);
        }
    }

    [Fact]
    public async Task Requests_without_forwarded_headers_are_unaffected()
    {
        using var res = await _http.PostAsJsonAsync("/api/auth/login", new { email = "", password = "" });
        Assert.NotEqual(HttpStatusCode.TooManyRequests, res.StatusCode);
    }

    public void Dispose() => _http.Dispose();
}
