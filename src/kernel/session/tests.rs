//! Session and profile use-case tests against SQLite.
use super::profile::MAX_PROFILE_PICTURE_BYTES;
use crate::database::Database;
use uuid::Uuid;

use super::*;

#[test]
fn first_profile_session_and_sign_out() {
    let path = std::env::temp_dir().join(format!("cloudready-session-{}.sqlite", Uuid::new_v4()));
    let database = Database::open(&path).unwrap();
    let store = SessionStore::new(&database);

    let user = store.create_first_user("  Ada  ").unwrap();
    assert_eq!(user.display_name, "Ada");
    assert!(matches!(
        store.create_first_user("Grace"),
        Err(Error::SetupComplete)
    ));

    let (active, token) = store.start(user.id).unwrap();
    assert_eq!(store.current(Some(&token)).unwrap().id, active.id);

    store.end(&token).unwrap();
    assert!(matches!(store.current(Some(&token)), Err(Error::Missing)));
}

#[test]
fn saves_and_returns_an_uploaded_profile_picture() {
    let path = std::env::temp_dir().join(format!("cloudready-picture-{}.sqlite", Uuid::new_v4()));
    let database = Database::open(&path).unwrap();
    let store = SessionStore::new(&database);
    let user = store.create_first_user("Ada").unwrap();
    let (_, token) = store.start(user.id).unwrap();
    assert!(
        store
            .current(Some(&token))
            .unwrap()
            .profile_picture
            .is_none()
    );

    let metadata = store
        .save_profile_picture(user.id, b"GIF89a".to_vec())
        .unwrap();
    assert_eq!(metadata.mime_type, "image/gif");
    assert_eq!(metadata.size, 6);
    let picture = store.profile_picture(user.id).unwrap();
    assert_eq!(picture.mime_type, "image/gif");
    assert_eq!(picture.content, b"GIF89a");
    assert_eq!(
        store.current(Some(&token)).unwrap().profile_picture,
        Some(metadata)
    );
    assert!(matches!(
        store.save_profile_picture(user.id, vec![0; MAX_PROFILE_PICTURE_BYTES + 1]),
        Err(Error::ProfilePictureTooLarge)
    ));
}

#[test]
fn expired_tokens_are_removed_and_cannot_be_replayed() {
    let database = Database::open(std::path::Path::new(":memory:")).unwrap();
    let store = SessionStore::new(&database);
    let user = store.create_first_user("Ada").unwrap();
    let (_, token) = store.start(user.id).unwrap();
    database
        .connection()
        .execute("UPDATE sessions SET expires_at=0", [])
        .unwrap();

    assert!(matches!(store.current(Some(&token)), Err(Error::Expired)));
    assert!(matches!(store.current(Some(&token)), Err(Error::Missing)));
}
