use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tokio::sync::{broadcast, RwLock};

use crate::rules::AppRules;
use crate::session::{Session, SessionEvent};

#[derive(Clone)]
pub struct SharedState {
    pub rules: Arc<RwLock<AppRules>>,
    pub sessions: Arc<RwLock<HashMap<String, Session>>>,
    pub session_order: Arc<RwLock<Vec<String>>>,
    pub capture_paused: Arc<AtomicBool>,
    pub max_sessions: usize,
    pub event_tx: broadcast::Sender<SessionEvent>,
    pub cert_dir: Arc<PathBuf>,
}

impl SharedState {
    pub fn new(max_sessions: usize, cert_dir: PathBuf) -> Self {
        let (event_tx, _) = broadcast::channel(4096);
        Self {
            rules: Arc::new(RwLock::new(AppRules::default())),
            sessions: Arc::new(RwLock::new(HashMap::new())),
            session_order: Arc::new(RwLock::new(Vec::new())),
            capture_paused: Arc::new(AtomicBool::new(false)),
            max_sessions,
            event_tx,
            cert_dir: Arc::new(cert_dir),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<SessionEvent> {
        self.event_tx.subscribe()
    }

    pub fn emit(&self, event: SessionEvent) {
        let _ = self.event_tx.send(event);
    }

    pub async fn upsert_session(&self, session: Session) {
        if self.capture_paused.load(Ordering::Relaxed) {
            return;
        }
        let id = session.id.clone();
        let is_new = {
            let map = self.sessions.read().await;
            !map.contains_key(&id)
        };
        {
            let mut map = self.sessions.write().await;
            map.insert(id.clone(), session.clone());
        }
        if is_new {
            let mut order = self.session_order.write().await;
            order.push(id.clone());
            while order.len() > self.max_sessions {
                if let Some(old_id) = order.first().cloned() {
                    order.remove(0);
                    self.sessions.write().await.remove(&old_id);
                }
            }
            self.emit(SessionEvent::Created { session });
        } else {
            self.emit(SessionEvent::Updated { session: session.clone() });
            if session.completed {
                self.emit(SessionEvent::Completed { session });
            }
        }
    }

    pub async fn clear_sessions(&self) {
        self.sessions.write().await.clear();
        self.session_order.write().await.clear();
    }

    pub async fn clear_session(&self, session_id: &str) {
        self.sessions.write().await.remove(session_id);
        self.session_order
            .write()
            .await
            .retain(|id| id != session_id);
    }
}
