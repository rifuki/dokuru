use axum::{
    extract::{State, ws::WebSocketUpgrade},
    response::Response,
};

use crate::state::AppState;

pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(move |socket| async move { state.ws_manager.handle_connection(socket).await })
}
