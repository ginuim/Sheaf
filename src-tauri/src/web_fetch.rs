use std::collections::HashMap;
use std::net::IpAddr;
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue, LOCATION};
use reqwest::redirect::Policy;
use reqwest::Url;
use serde::{Deserialize, Serialize};

const MAX_REDIRECTS: usize = 5;
const TIMEOUT_SECS: u64 = 25;
const MAX_BODY_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchUrlRequest {
    url: String,
    #[serde(default)]
    method: Option<String>,
    #[serde(default)]
    headers: HashMap<String, String>,
    #[serde(default)]
    body: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchUrlResponse {
    body: String,
    content_type: Option<String>,
    final_url: String,
    status: u16,
}

#[tauri::command]
pub async fn fetch_url(request: FetchUrlRequest) -> Result<FetchUrlResponse, String> {
    let method = request.method.as_deref().unwrap_or("GET").to_ascii_uppercase();
    if method != "GET" && method != "POST" {
        return Err(format!("不支持的 HTTP 方法: {method}"));
    }

    let mut url = validate_fetch_url(&request.url)?;
    let client = reqwest::Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;

    let headers = merge_headers(&request.headers)?;

    for _ in 0..=MAX_REDIRECTS {
        let mut builder = client.request(
            if method == "POST" {
                reqwest::Method::POST
            } else {
                reqwest::Method::GET
            },
            url.clone(),
        );
        builder = builder.headers(headers.clone());
        if method == "POST" {
            builder = builder.body(request.body.clone().unwrap_or_default());
        }

        let response = builder.send().await.map_err(|e| e.to_string())?;
        let status = response.status();

        if status.is_redirection() {
            let location = response
                .headers()
                .get(LOCATION)
                .ok_or_else(|| "重定向响应缺少 Location".to_string())?;
            let location = location.to_str().map_err(|e| e.to_string())?;
            let next = if location.starts_with("http://") || location.starts_with("https://") {
                Url::parse(location)
            } else {
                url.join(location)
            }
            .map_err(|e| e.to_string())?;
            url = validate_fetch_url(next.as_str())?;
            continue;
        }

        let status_code = status.as_u16();
        let final_url = response.url().to_string();
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string);
        let bytes = response.bytes().await.map_err(|e| e.to_string())?;
        if bytes.len() > MAX_BODY_BYTES {
            return Err(format!(
                "响应过大（{} 字节），上限 {} 字节",
                bytes.len(),
                MAX_BODY_BYTES
            ));
        }
        let body = String::from_utf8_lossy(&bytes).into_owned();

        return Ok(FetchUrlResponse {
            body,
            content_type,
            final_url,
            status: status_code,
        });
    }

    Err("重定向次数过多".to_string())
}

fn merge_headers(custom: &HashMap<String, String>) -> Result<HeaderMap, String> {
    let mut headers = default_headers();
    for (name, value) in custom {
        let name = HeaderName::from_bytes(name.as_bytes()).map_err(|e| e.to_string())?;
        let value = HeaderValue::from_str(value).map_err(|e| e.to_string())?;
        headers.insert(name, value);
    }
    Ok(headers)
}

fn default_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        HeaderName::from_static("user-agent"),
        HeaderValue::from_static(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ),
    );
    headers.insert(
        HeaderName::from_static("accept"),
        HeaderValue::from_static(
            "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,text/plain;q=0.8,*/*;q=0.5",
        ),
    );
    headers
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
}
