mod application;
mod chromium;
mod config;
mod database;
mod fairy;
mod filesystem;
mod machine_intelligence;
mod rpc;
mod session;
mod transport;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let chromium = chromium::executable_from_args(std::env::args_os().skip(1))?;
    let address = std::env::var("KERNEL_ADDR").unwrap_or_else(|_| "127.0.0.1:3000".into());
    let listener = tokio::net::TcpListener::bind(&address).await?;
    let bound_address = listener.local_addr()?;
    let application = application::Application::start(config::database_path()?).await?;
    let rpc = application::rpc::dispatcher(application.clone());
    let app = transport::router(application, format!("http://{bound_address}"), rpc);
    println!("Listening on http://{bound_address}");

    #[cfg(not(embedded_frontend))]
    let chromium_address = "localhost:5173";
    #[cfg(embedded_frontend)]
    let chromium_address = &address;
    let _chromium_profile = chromium
        .as_deref()
        .map(|executable| chromium::launch(executable, chromium_address))
        .transpose()?;

    axum::serve(listener, app).await?;
    Ok(())
}
