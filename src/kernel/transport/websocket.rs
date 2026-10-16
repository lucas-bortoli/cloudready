//! WebSocket upgrades, frames, and connection lifetime for authenticated session RPC.
//!
//! Incoming envelopes enter a bounded per-connection queue. A separate processor invokes the
//! dispatcher while the socket keeps forwarding events, including progress from long requests.
//! Closing a socket drops its queue sender; accepted work finishes independently of the socket.

use std::sync::Arc;

use axum::{
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::header::SEC_WEBSOCKET_PROTOCOL,
    response::{IntoResponse, Response},
};
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::application;

use super::{TransportState, http};

const PROTOCOL: &str = "cloudready-session-rpc.v1";

pub(super) async fn upgrade(
    State(state): State<Arc<TransportState>>,
    headers: axum::http::HeaderMap,
    websocket: WebSocketUpgrade,
) -> Response {
    if !requested_protocol(&headers) {
        return (
            axum::http::StatusCode::UPGRADE_REQUIRED,
            "Session RPC subprotocol required.",
        )
            .into_response();
    }
    let token = http::common::cookie(&headers, http::common::SESSION_COOKIE);
    let authenticated = match state.application.session(token.clone()).await {
        Ok(authenticated) => authenticated,
        Err(application::Error::Session(_)) => {
            return (
                axum::http::StatusCode::UNAUTHORIZED,
                "Active session required.",
            )
                .into_response();
        }
        Err(_) => return http::unavailable_response(),
    };
    websocket
        .protocols([PROTOCOL])
        .on_upgrade(move |socket| socket_loop(socket, state, authenticated.profile_id, token))
        .into_response()
}

fn requested_protocol(headers: &axum::http::HeaderMap) -> bool {
    headers
        .get(SEC_WEBSOCKET_PROTOCOL)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|protocols| protocols.split(',').any(|value| value.trim() == PROTOCOL))
}

async fn socket_loop(
    socket: WebSocket,
    state: Arc<TransportState>,
    profile_id: Uuid,
    token: Option<String>,
) {
    let (context, mut outbound) = state.rpc.connect(profile_id, token).await;
    let (incoming, mut requests) = mpsc::channel::<String>(16);
    let dispatcher = state.rpc.clone();
    let request_context = context.clone();
    // The processor deliberately outlives a closed socket so accepted feature operations finish.
    tokio::spawn(async move {
        dispatcher.initialize(&request_context).await;
        while let Some(text) = requests.recv().await {
            dispatcher.dispatch(&request_context, &text).await;
        }
    });
    let (mut writer, mut reader) = socket.split();
    loop {
        tokio::select! {
            message = outbound.recv() => {
                let Some(message) = message else { break };
                if send_json(&mut writer, message).await.is_err() {
                    break;
                }
            }
            message = reader.next() => {
                match message {
                    Some(Ok(Message::Text(text))) => {
                        if let Err(error) = incoming.try_send(text.to_string()) {
                            match error {
                                mpsc::error::TrySendError::Full(text) => {
                                    state.rpc.overloaded(&context, &text).await;
                                }
                                mpsc::error::TrySendError::Closed(_) => break,
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                    _ => {}
                }
            }
        }
    }
    state.rpc.disconnect(context.connection_id).await;
}

async fn send_json(
    writer: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    value: Value,
) -> Result<(), axum::Error> {
    writer.send(Message::Text(value.to_string().into())).await
}
