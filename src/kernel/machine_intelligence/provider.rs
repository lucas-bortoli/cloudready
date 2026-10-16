//! Provider model discovery and completed-response stream decoding.
use super::{Error, GeneratedText, MachineIntelligence, Model, Result};
use serde_json::{Value, json};
use std::io::{BufRead, BufReader};
use uuid::Uuid;
pub(super) const RESOURCE: &str = "https://api.openai.com/v1";
impl MachineIntelligence<'_> {
    /// Lists models visible to the connected ChatGPT account.
    ///
    /// # Arguments
    ///
    /// * `user_id` - CloudReady profile whose ChatGPT account supplies the model list.
    ///
    /// # Errors
    ///
    /// Returns [`Error::NotConnected`] if the profile has no connection,
    /// [`Error::PermissionMissing`] if plan use is unavailable,
    /// [`Error::ReauthorizationRequired`] if its access token is no longer accepted, or an
    /// upstream or database error if the request fails.
    pub fn models(&self, user_id: Uuid) -> Result<Vec<Model>> {
        let connection = self.ready_connection(user_id)?;
        let response = self
            .http
            .get(format!("{}/models", self.api_base))
            .bearer_auth(&connection.access_token)
            .send()
            .map_err(|_| Error::Upstream)?;
        if response.status().as_u16() == 401 {
            return Err(Error::ReauthorizationRequired);
        }
        if response.status().as_u16() == 403 {
            return Err(Error::PermissionMissing);
        }
        let response: Value = response
            .error_for_status()
            .map_err(|_| Error::Upstream)?
            .json()
            .map_err(|_| Error::Upstream)?;
        Ok(response
            .get("models")
            .and_then(Value::as_array)
            .ok_or(Error::Upstream)?
            .iter()
            .filter(|model| model.get("visibility").and_then(Value::as_str) == Some("list"))
            .filter_map(|model| {
                Some(Model {
                    slug: model.get("slug")?.as_str()?.to_owned(),
                    display_name: model.get("display_name")?.as_str()?.to_owned(),
                })
            })
            .collect())
    }

    /// Generates text and returns it only after the Responses stream completes.
    ///
    /// # Arguments
    ///
    /// * `user_id` - CloudReady profile whose ChatGPT plan is used.
    /// * `model` - Model slug available to the connected account.
    /// * `input` - Non-empty prompt text, limited to 16,000 bytes.
    ///
    /// # Errors
    ///
    /// Returns [`Error::NotConnected`] if the profile has no connection,
    /// [`Error::InvalidInput`] for malformed prompt parameters,
    /// [`Error::ModelUnavailable`] when the account cannot use the selected model,
    /// [`Error::UsageLimit`] when ChatGPT reports a usage limit,
    /// [`Error::ReauthorizationRequired`] when the access token is rejected, or
    /// [`Error::IncompleteResponse`] when the stream does not complete.
    pub fn generate_text(&self, user_id: Uuid, model: &str, input: &str) -> Result<GeneratedText> {
        if input.trim().is_empty() || input.len() > 16_000 || model.is_empty() || model.len() > 100
        {
            return Err(Error::InvalidInput);
        }
        if !self
            .models(user_id)?
            .iter()
            .any(|candidate| candidate.slug == model)
        {
            return Err(Error::ModelUnavailable);
        }
        let connection = self.ready_connection(user_id)?;
        let response = self.http.post(format!("{}/responses", self.api_base))
            .bearer_auth(&connection.access_token)
            .json(&json!({"model": model, "input": [{"role": "user", "content": input}], "store": false, "stream": true}))
            .send().map_err(|_| Error::Upstream)?;
        if response.status().as_u16() == 401 {
            return Err(Error::ReauthorizationRequired);
        }
        if response.status().as_u16() == 403 {
            return Err(Error::PermissionMissing);
        }
        if response.status().as_u16() == 429 {
            return Err(Error::UsageLimit);
        }
        let response = response.error_for_status().map_err(|_| Error::Upstream)?;
        let mut text = String::new();
        let mut completed = false;
        let mut event_data = String::new();
        for line in BufReader::new(response).lines() {
            let line = line.map_err(|_| Error::IncompleteResponse)?;
            if let Some(data) = line.strip_prefix("data: ") {
                event_data.push_str(data);
            } else if line.is_empty() && !event_data.is_empty() {
                let event: Value =
                    serde_json::from_str(&event_data).map_err(|_| Error::IncompleteResponse)?;
                event_data.clear();
                match event.get("type").and_then(Value::as_str) {
                    Some("response.output_text.delta") => {
                        text.push_str(
                            event
                                .get("delta")
                                .and_then(Value::as_str)
                                .ok_or(Error::IncompleteResponse)?,
                        );
                    }
                    Some("response.completed") => {
                        completed = true;
                        break;
                    }
                    Some("response.failed") => {
                        let code = event
                            .pointer("/response/error/code")
                            .and_then(Value::as_str);
                        return Err(
                            if matches!(
                                code,
                                Some(
                                    "subscription_sharing_usage_limit_exceeded"
                                        | "subscription_sharing_usage_unavailable"
                                )
                            ) {
                                Error::UsageLimit
                            } else {
                                Error::Upstream
                            },
                        );
                    }
                    Some("response.incomplete" | "error") => return Err(Error::IncompleteResponse),
                    _ => {}
                }
            }
        }
        if !completed {
            return Err(Error::IncompleteResponse);
        }
        Ok(GeneratedText { text })
    }
}
