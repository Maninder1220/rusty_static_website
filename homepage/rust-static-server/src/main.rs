use axum::{
    body::Body,
    extract::Path,
    http::{header, HeaderValue, Response, StatusCode},
    response::IntoResponse,
    routing::get,
    Router,
};
use rust_embed::RustEmbed;
use std::{
    env,
    error::Error,
    net::{IpAddr, Ipv4Addr, SocketAddr},
};
use tokio::signal;
use tower_http::trace::TraceLayer;
use tracing::{error, info};

// -----------------------------------------------------------------------------
// EMBEDDED STATIC FILES
// -----------------------------------------------------------------------------

// RustEmbed takes files from a folder at compile time and makes them available
// inside the final Rust binary.
//
// Your folder structure is:
//
// homepage/
// ├── rust-static-server/
// │   ├── Cargo.toml
// │   └── src/main.rs
// └── src/
//     ├── index.html
//     ├── css/style.css
//     ├── js/main.js
//     └── assets/...
//
// The path "../src" is relative to rust-static-server/Cargo.toml.
//
// That means this embeds:
//
// homepage/src/index.html
// homepage/src/css/style.css
// homepage/src/js/main.js
// homepage/src/assets/...
//
// In release build, these files are stored inside the executable.
// rust-embed documents that release builds embed the files into the executable.
// In debug builds, it may read from disk unless configured otherwise. 
// So for final deployment, always use:
//
// cargo build --release
//
// Source:
// https://docs.rs/rust-embed/latest/rust_embed/trait.RustEmbed.html
#[derive(RustEmbed)]
#[folder = "../src"]
struct EmbeddedAssets;

// -----------------------------------------------------------------------------
// PROGRAM ENTRY POINT
// -----------------------------------------------------------------------------

// #[tokio::main] starts the Tokio async runtime.
//
// Axum is async. That means the server does not block one request at a time.
// Tokio provides the async runtime that allows Axum to handle many connections.
#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    // Initialize logging.
    //
    // tracing_subscriber listens to logs created by:
    //
    // info!("message")
    // error!("message")
    //
    // with_target(false):
    // Removes long Rust module paths from logs.
    //
    // compact():
    // Makes log output shorter and easier to read.
    tracing_subscriber::fmt()
        .with_target(false)
        .compact()
        .init();

    // Read host from HOST environment variable.
    //
    // Default is 0.0.0.0.
    //
    // 0.0.0.0 means:
    // - accessible from localhost
    // - accessible from other devices on same network using SERVER_IP:PORT
    //
    // 127.0.0.1 means:
    // - only accessible from same machine
    let host = get_host();

    // Read port.
    //
    // Priority:
    //
    // 1. CLI argument:
    //    cargo run -- 9000
    //
    // 2. PORT environment variable:
    //    PORT=9000 cargo run
    //
    // 3. Default:
    //    8000
    let port = get_port();

    // Combine host and port into one socket address.
    //
    // Example:
    // 0.0.0.0 + 8000 = 0.0.0.0:8000
    let addr = SocketAddr::new(host, port);

    // Build Axum router.
    //
    // route("/", get(index_handler)):
    // Handles browser request:
    //
    // GET /
    //
    // It returns index.html.
    //
    // route("/{*path}", get(asset_handler)):
    // Handles all other paths, for example:
    //
    // GET /css/style.css
    // GET /js/main.js
    // GET /assets/logo.png
    // GET /pages/about.html
    //
    // IMPORTANT:
    // Axum 0.8 uses "/{*path}" for wildcard routes.
    // Older Axum versions used "/*path".
    // Axum 0.8 changed path parameter syntax from /:single and /*many
    // to /{single} and /{*many}.
    //
    // Source:
    // https://tokio.rs/blog/2025-01-01-announcing-axum-0-8-0
    let app = Router::new()
        .route("/", get(index_handler))
        .route("/{*path}", get(asset_handler))
        .layer(TraceLayer::new_for_http());

    // Bind TCP listener.
    //
    // This is the point where the server starts listening on the selected IP
    // and port.
    //
    // Example:
    // 0.0.0.0:8000
    let listener = tokio::net::TcpListener::bind(addr).await?;

    // Print startup information.
    info!("Embedded static server started");
    info!("Host: {}", host);
    info!("Port: {}", port);
    info!("Local URL:   http://localhost:{}", port);
    info!("Network URL: http://SERVER_IP:{}", port);

    // Start Axum server.
    //
    // with_graceful_shutdown(shutdown_signal()):
    // Allows CTRL + C to stop the server cleanly.
    //
    // Without graceful shutdown, process will still stop,
    // but not in a controlled server lifecycle.
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    // If server exits without error, return Ok.
    Ok(())
}

// -----------------------------------------------------------------------------
// ROOT ROUTE HANDLER
// -----------------------------------------------------------------------------

// This function handles:
//
// GET /
//
// It returns:
//
// index.html
//
// Example browser request:
//
// http://localhost:8000/
async fn index_handler() -> impl IntoResponse {
    serve_embedded_file("index.html")
}

// -----------------------------------------------------------------------------
// STATIC FILE ROUTE HANDLER
// -----------------------------------------------------------------------------

// This function handles all file requests except "/".
//
// Example:
//
// Browser requests:
// http://localhost:8000/css/style.css
//
// Axum captures:
// path = "css/style.css"
//
// Browser requests:
// http://localhost:8000/js/main.js
//
// Axum captures:
// path = "js/main.js"
//
// Browser requests:
// http://localhost:8000/assets/logo.png
//
// Axum captures:
// path = "assets/logo.png"
//
// Axum's Path extractor is used to extract the wildcard path value.
// The Axum router docs show wildcard captures using:
//
// route("/{*key}", get(handler))
//
// and extracting it with:
//
// Path(path): Path<String>
//
// Source:
// https://docs.rs/axum/latest/axum/routing/struct.Router.html
async fn asset_handler(Path(path): Path<String>) -> impl IntoResponse {
    // Remove leading slash if it appears.
    //
    // Normally Axum gives:
    // css/style.css
    //
    // But this makes the function safe if the path somehow becomes:
    // /css/style.css
    let clean_path = path.trim_start_matches('/');

    // Defensive check.
    //
    // Normally "/" is handled by index_handler().
    // But if this handler receives an empty path, return index.html.
    if clean_path.is_empty() {
        return serve_embedded_file("index.html");
    }

    // Serve the requested embedded file.
    serve_embedded_file(clean_path)
}

// -----------------------------------------------------------------------------
// EMBEDDED FILE RESPONSE BUILDER
// -----------------------------------------------------------------------------

// This is the core function of the server.
//
// It does four jobs:
//
// 1. Look for requested file inside embedded assets.
// 2. Detect its MIME type.
// 3. Return HTTP 200 if file exists.
// 4. Return HTTP 404 if file does not exist.
//
// Example input:
//
// serve_embedded_file("index.html")
// serve_embedded_file("css/style.css")
// serve_embedded_file("js/main.js")
// serve_embedded_file("assets/logo.png")
fn serve_embedded_file(path: &str) -> Response<Body> {
    // EmbeddedAssets::get(path) searches for the file inside the embedded folder.
    //
    // If found:
    // Some(content)
    //
    // If missing:
    // None
    match EmbeddedAssets::get(path) {
        Some(content) => {
            // Detect Content-Type from file extension.
            //
            // Examples:
            //
            // index.html      -> text/html
            // css/style.css   -> text/css
            // js/main.js      -> application/javascript or text/javascript
            // image.png       -> image/png
            // icon.svg        -> image/svg+xml
            //
            // This is important because browsers need correct Content-Type.
            // If CSS is sent as wrong type, browser may refuse to apply it.
            // If JS is sent as wrong type, browser may refuse to execute it.
            let mime = mime_guess::from_path(path).first_or_octet_stream();

            // Build successful HTTP response.
            //
            // Status:
            // 200 OK
            //
            // Header:
            // Content-Type: detected MIME type
            //
            // Body:
            // File bytes from embedded binary
            Response::builder()
                .status(StatusCode::OK)
                .header(
                    header::CONTENT_TYPE,
                    HeaderValue::from_str(mime.as_ref())
                        .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
                )
                .body(Body::from(content.data.into_owned()))
                .unwrap()
        }
        None => {
            // If requested file does not exist, log the missing path.
            //
            // Example:
            // /wrong.css
            // /missing-image.png
            error!("Embedded file not found: {}", path);

            // Return a simple 404 response to browser.
            Response::builder()
                .status(StatusCode::NOT_FOUND)
                .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
                .body(Body::from("<h1>404 - File Not Found</h1>"))
                .unwrap()
        }
    }
}

// -----------------------------------------------------------------------------
// HOST CONFIGURATION
// -----------------------------------------------------------------------------

// Reads HOST environment variable.
//
// Example:
//
// HOST=127.0.0.1 cargo run -- 8000
//
// If HOST is not provided or invalid, fallback to 0.0.0.0.
//
// 0.0.0.0 is useful for VM/server testing because other machines can connect
// using your server IP address.
fn get_host() -> IpAddr {
    env::var("HOST")
        .ok()
        .and_then(|value| value.parse::<IpAddr>().ok())
        .unwrap_or(IpAddr::V4(Ipv4Addr::new(0, 0, 0, 0)))
}

// -----------------------------------------------------------------------------
// PORT CONFIGURATION
// -----------------------------------------------------------------------------

// Reads port from CLI argument or PORT environment variable.
//
// Priority order:
//
// 1. First CLI argument:
//
// cargo run -- 9000
// ./rust-static-server 9000
//
// 2. PORT environment variable:
//
// PORT=9000 cargo run
//
// 3. Default:
//
// 8000
//
// Note:
//
// In your old disk-based server, first CLI argument was web root:
//
// cargo run -- ../src
//
// In this embedded server, web root is already inside the binary.
// So first CLI argument is now port:
//
// cargo run -- 8000
fn get_port() -> u16 {
    env::args()
        .nth(1)
        .or_else(|| env::var("PORT").ok())
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(8000)
}

// -----------------------------------------------------------------------------
// GRACEFUL SHUTDOWN
// -----------------------------------------------------------------------------

// Waits for CTRL + C.
//
// When CTRL + C is pressed:
//
// 1. shutdown_signal() completes.
// 2. Axum stops accepting new requests.
// 3. Server exits cleanly.
//
// This is better than abruptly killing the process.
async fn shutdown_signal() {
    signal::ctrl_c()
        .await
        .expect("Failed to listen for CTRL+C signal");

    info!("Shutdown signal received. Stopping server...");
}