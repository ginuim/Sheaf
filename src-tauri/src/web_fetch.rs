use std::collections::HashMap;
use std::error::Error as StdError;
use std::net::IpAddr;
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue, LOCATION};
use reqwest::redirect::Policy;
use reqwest::{Method, Url};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

const MAX_REDIRECTS: usize = 5;
const DEFAULT_TIMEOUT_SECS: u64 = 25;
const MAX_TIMEOUT_SECS: u64 = 120;
const MAX_BODY_BYTES: usize = 2 * 1024 * 1024;
const CONNECT_TIMEOUT_SECS: u64 = 20;
const MAX_STREAM_BODY_BYTES: usize = 32 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
    url: String,
    #[serde(default)]
    method: Option<String>,
    #[serde(default)]
    headers: HashMap<String, String>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    timeout_secs: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchUrlResponse {
    body: String,
    content_type: Option<String>,
    final_url: String,
    status: u16,
}

#[derive(Clone, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum StreamFetchEvent {
    Start {
        status: u16,
        content_type: Option<String>,
        final_url: String,
        headers: HashMap<String, String>,
    },
    Chunk {
        data: Vec<u8>,
    },
    End,
}

#[tauri::command]
pub async fn fetch_url(request: HttpRequest) -> Result<FetchUrlResponse, String> {
    let timeout = Duration::from_secs(resolve_timeout_secs(request.timeout_secs));
    let client = build_client(Some(timeout))?;
    let method = parse_method(request.method.as_deref())?;
    let headers = merge_headers(&request.headers, true)?;
    let response = send_following_redirects(
        &client,
        method,
        validate_fetch_url(&request.url)?,
        headers,
        request.body.as_deref(),
    )
    .await?;

    let status = response.status().as_u16();
    let final_url = response.url().to_string();
    let content_type = header_to_string(response.headers().get(reqwest::header::CONTENT_TYPE));
    let bytes = read_body_bytes(response, MAX_BODY_BYTES).await?;
    let body = String::from_utf8_lossy(&bytes).into_owned();

    Ok(FetchUrlResponse {
        body,
        content_type,
        final_url,
        status,
    })
}

#[tauri::command]
pub async fn http_fetch(
    request: HttpRequest,
    on_event: Channel<StreamFetchEvent>,
) -> Result<(), String> {
    stream_http(request, on_event).await
}

#[tauri::command]
pub async fn stream_fetch_url(
    request: HttpRequest,
    on_event: Channel<StreamFetchEvent>,
) -> Result<(), String> {
    stream_http(request, on_event).await
}

async fn stream_http(
    request: HttpRequest,
    on_event: Channel<StreamFetchEvent>,
) -> Result<(), String> {
    let timeout = request
        .timeout_secs
        .map(|secs| Duration::from_secs(resolve_timeout_secs(Some(secs))));
    let client = build_client(timeout)?;
    let method = parse_method(request.method.as_deref())?;
    let headers = merge_headers(&request.headers, false)?;
    let response = send_following_redirects(
        &client,
        method,
        validate_fetch_url(&request.url)?,
        headers,
        request.body.as_deref(),
    )
    .await?;

    let status = response.status().as_u16();
    let final_url = response.url().to_string();
    let headers = response_headers(response.headers());
    let content_type = headers.get("content-type").cloned();

    on_event
        .send(StreamFetchEvent::Start {
            status,
            content_type,
            final_url,
            headers,
        })
        .map_err(|e| e.to_string())?;

    let mut total = 0usize;
    let mut stream = response;
    loop {
        let chunk = match stream.chunk().await {
            Ok(chunk) => chunk,
            Err(error) if is_tls_close_without_notify(&error) => break,
            Err(error) => return Err(format_error_chain("读取响应失败", &error)),
        };
        let Some(bytes) = chunk else {
            break;
        };
        total = total.saturating_add(bytes.len());
        if total > MAX_STREAM_BODY_BYTES {
            return Err(format!("响应过大（超过 {} 字节）", MAX_STREAM_BODY_BYTES));
        }
        if on_event
            .send(StreamFetchEvent::Chunk {
                data: bytes.to_vec(),
            })
            .is_err()
        {
            return Ok(());
        }
    }

    let _ = on_event.send(StreamFetchEvent::End);
    Ok(())
}

fn build_client(total_timeout: Option<Duration>) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECS));
    if let Some(timeout) = total_timeout {
        builder = builder.timeout(timeout);
    }
    builder
        .build()
        .map_err(|e| format_error_chain("创建 HTTP 客户端失败", &e))
}

async fn send_following_redirects(
    client: &reqwest::Client,
    method: Method,
    mut url: Url,
    headers: HeaderMap,
    body: Option<&str>,
) -> Result<reqwest::Response, String> {
    for _ in 0..=MAX_REDIRECTS {
        let mut builder = client.request(method.clone(), url.clone());
        builder = builder.headers(headers.clone());
        if method_allows_body(&method) {
            builder = builder.body(body.unwrap_or_default().to_owned());
        }

        let response = builder
            .send()
            .await
            .map_err(|e| format_error_chain("请求失败", &e))?;

        if response.status().is_redirection() {
            let next = next_redirect_url(&url, &response)?;
            if redirects_to_different_host(&url, &next) && has_sensitive_headers(&headers) {
                return Err("拒绝把认证信息重定向到其他主机".to_string());
            }
            url = next;
            continue;
        }

        return Ok(response);
    }

    Err("重定向次数过多".to_string())
}

fn redirects_to_different_host(current: &Url, next: &Url) -> bool {
    current.host_str().map(str::to_ascii_lowercase) != next.host_str().map(str::to_ascii_lowercase)
}

fn has_sensitive_headers(headers: &HeaderMap) -> bool {
    [
        "authorization",
        "proxy-authorization",
        "cookie",
        "x-api-key",
    ]
    .iter()
    .any(|name| headers.contains_key(*name))
}

fn next_redirect_url(current: &Url, response: &reqwest::Response) -> Result<Url, String> {
    let location = response
        .headers()
        .get(LOCATION)
        .ok_or_else(|| "重定向响应缺少 Location".to_string())?;
    let location = location.to_str().map_err(|e| e.to_string())?;
    let next = if location.starts_with("http://") || location.starts_with("https://") {
        Url::parse(location)
    } else {
        current.join(location)
    }
    .map_err(|e| e.to_string())?;
    validate_fetch_url(next.as_str())
}

async fn read_body_bytes(
    mut response: reqwest::Response,
    max_bytes: usize,
) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    loop {
        let chunk = match response.chunk().await {
            Ok(chunk) => chunk,
            Err(error) if is_tls_close_without_notify(&error) => break,
            Err(error) => return Err(format_error_chain("读取响应失败", &error)),
        };
        let Some(bytes) = chunk else {
            break;
        };
        out.extend_from_slice(&bytes);
        if out.len() > max_bytes {
            return Err(format!(
                "响应过大（{} 字节），上限 {} 字节",
                out.len(),
                max_bytes
            ));
        }
    }
    Ok(out)
}

fn parse_method(raw: Option<&str>) -> Result<Method, String> {
    let method = raw.unwrap_or("GET").trim().to_ascii_uppercase();
    if method.is_empty() {
        return Ok(Method::GET);
    }
    let parsed = Method::from_bytes(method.as_bytes())
        .map_err(|_| format!("不支持的 HTTP 方法: {method}"))?;
    if matches!(
        parsed,
        Method::GET | Method::POST | Method::PUT | Method::PATCH | Method::DELETE | Method::HEAD
    ) {
        Ok(parsed)
    } else {
        Err(format!("不支持的 HTTP 方法: {method}"))
    }
}

fn method_allows_body(method: &Method) -> bool {
    !matches!(*method, Method::GET | Method::HEAD)
}

fn resolve_timeout_secs(timeout_secs: Option<u64>) -> u64 {
    timeout_secs
        .unwrap_or(DEFAULT_TIMEOUT_SECS)
        .clamp(1, MAX_TIMEOUT_SECS)
}

fn format_error_chain(context: &str, error: &dyn StdError) -> String {
    let mut message = format!("{context}: {error}");
    let mut source = error.source();
    while let Some(err) = source {
        message.push_str(": ");
        message.push_str(&err.to_string());
        source = err.source();
    }
    message
}

fn is_tls_close_without_notify(error: &dyn StdError) -> bool {
    let mut current = Some(error);
    while let Some(err) = current {
        let text = err.to_string().to_ascii_lowercase();
        if text.contains("close_notify") || text.contains("unexpected eof") {
            return true;
        }
        current = err.source();
    }
    false
}

fn merge_headers(
    custom: &HashMap<String, String>,
    inject_html_accept: bool,
) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(
        HeaderName::from_static("user-agent"),
        HeaderValue::from_static(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ),
    );
    if inject_html_accept {
        headers.insert(
            HeaderName::from_static("accept"),
            HeaderValue::from_static(
                "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,text/plain;q=0.8,*/*;q=0.5",
            ),
        );
    }
    for (name, value) in custom {
        let name = HeaderName::from_bytes(name.as_bytes()).map_err(|e| e.to_string())?;
        let value = HeaderValue::from_str(value).map_err(|e| e.to_string())?;
        headers.insert(name, value);
    }
    Ok(headers)
}

fn response_headers(headers: &HeaderMap) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for (name, value) in headers {
        if name.as_str().eq_ignore_ascii_case("set-cookie") {
            continue;
        }
        if let Ok(text) = value.to_str() {
            map.insert(name.as_str().to_string(), text.to_string());
        }
    }
    map
}

fn header_to_string(value: Option<&HeaderValue>) -> Option<String> {
    value.and_then(|v| v.to_str().ok()).map(str::to_string)
}

fn validate_fetch_url(raw: &str) -> Result<Url, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("URL 不能为空".to_string());
    }

    let url = Url::parse(trimmed).map_err(|e| format!("无效 URL: {e}"))?;
    let scheme = url.scheme().to_ascii_lowercase();
    if scheme != "http" && scheme != "https" {
        return Err("仅允许 http 或 https".to_string());
    }
    if url.username() != "" || url.password().is_some() {
        return Err("URL 不能包含用户名或密码".to_string());
    }
    if is_blocked_host(&url) {
        return Err("不允许访问本地或内网地址".to_string());
    }

    Ok(url)
}

fn is_blocked_host(url: &Url) -> bool {
    let Some(host) = url.host_str() else {
        return true;
    };
    let host = host
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .trim_end_matches('.')
        .to_ascii_lowercase();

    if host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host == "0.0.0.0"
    {
        return true;
    }

    if let Ok(ip) = host.parse::<IpAddr>() {
        return is_private_ip(ip);
    }

    false
}

fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_multicast()
                || v4.is_broadcast()
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || v6.is_unique_local()
                || v6.is_unicast_link_local()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_localhost() {
        assert!(validate_fetch_url("http://localhost/test").is_err());
        assert!(validate_fetch_url("http://127.0.0.1/test").is_err());
    }

    #[test]
    fn accepts_https() {
        assert!(validate_fetch_url("https://example.com/a").is_ok());
    }

    #[test]
    fn clamps_timeout() {
        assert_eq!(resolve_timeout_secs(None), DEFAULT_TIMEOUT_SECS);
        assert_eq!(resolve_timeout_secs(Some(0)), 1);
        assert_eq!(resolve_timeout_secs(Some(90)), 90);
        assert_eq!(resolve_timeout_secs(Some(999)), MAX_TIMEOUT_SECS);
    }

    #[test]
    fn detects_sensitive_cross_host_redirects() {
        let current = Url::parse("https://api.example.com/v1").unwrap();
        let same_host = Url::parse("https://api.example.com/v2").unwrap();
        let other_host = Url::parse("https://attacker.example/v2").unwrap();
        let mut headers = HeaderMap::new();
        headers.insert("authorization", HeaderValue::from_static("Bearer test"));

        assert!(has_sensitive_headers(&headers));
        assert!(!redirects_to_different_host(&current, &same_host));
        assert!(redirects_to_different_host(&current, &other_host));
    }

    #[test]
    fn parse_method_allows_common_verbs() {
        assert_eq!(parse_method(None).unwrap(), Method::GET);
        assert_eq!(parse_method(Some("post")).unwrap(), Method::POST);
        assert_eq!(parse_method(Some("PATCH")).unwrap(), Method::PATCH);
        assert!(parse_method(Some("CONNECT")).is_err());
    }

    #[test]
    fn treats_close_notify_as_eof() {
        let error = std::io::Error::new(
            std::io::ErrorKind::UnexpectedEof,
            "peer closed connection without sending TLS close_notify",
        );
        assert!(is_tls_close_without_notify(&error));
        let other = std::io::Error::new(std::io::ErrorKind::Other, "connection reset");
        assert!(!is_tls_close_without_notify(&other));
    }
}
