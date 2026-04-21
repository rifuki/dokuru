use axum::{Router, extract::Query, http::StatusCode, response::Json, routing::get};
use bollard::system::EventsOptions;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::get_docker_client;

#[derive(Deserialize)]
pub struct EventsQuery {
    since: Option<i64>,
    until: Option<i64>,
}

#[derive(Serialize)]
pub struct EventResponse {
    pub r#type: String,
    pub action: String,
    pub actor: EventActor,
    pub time: i64,
}

#[derive(Serialize)]
pub struct EventActor {
    pub id: String,
    pub attributes: HashMap<String, String>,
}

pub fn routes<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new().route("/docker/events", get(get_events))
}

async fn get_events(
    Query(query): Query<EventsQuery>,
) -> Result<Json<Vec<EventResponse>>, StatusCode> {
    let docker = get_docker_client().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let options = Some(EventsOptions::<String> {
        since: query.since.map(|s| s.to_string()),
        until: query.until.map(|u| u.to_string()),
        ..Default::default()
    });

    let mut stream = docker.events(options);
    let mut events = Vec::new();
    let mut count = 0;

    // Limit to 100 events
    while let Some(event) = stream.next().await {
        if count >= 100 {
            break;
        }

        if let Ok(evt) = event {
            let event_type = evt.typ.map(|t| format!("{t:?}")).unwrap_or_default();
            let actor_id = evt
                .actor
                .as_ref()
                .and_then(|a| a.id.clone())
                .unwrap_or_default();
            let attributes = evt
                .actor
                .as_ref()
                .and_then(|a| a.attributes.clone())
                .unwrap_or_else(HashMap::new);

            events.push(EventResponse {
                r#type: event_type,
                action: evt.action.unwrap_or_default(),
                actor: EventActor {
                    id: actor_id,
                    attributes,
                },
                time: evt.time.unwrap_or_default(),
            });
            count += 1;
        }
    }

    Ok(Json(events))
}
