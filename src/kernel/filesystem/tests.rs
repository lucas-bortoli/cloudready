//! Filesystem contract tests against the shared SQLite schema.

use super::repository::id;
use super::*;
use rusqlite::params;
use std::io::Cursor;
fn database() -> Database {
    Database::open(&std::env::temp_dir().join(format!("cloudready-{}.sqlite", Uuid::new_v4())))
        .unwrap()
}
fn user(database: &Database) -> Uuid {
    let user = Uuid::new_v4();
    database
        .connection()
        .execute(
            "INSERT INTO users(id,display_name,created_at) VALUES (?1,'Test',0)",
            params![id(user)],
        )
        .unwrap();
    user
}
fn exists(fs: &FileSystem, path: &str) -> bool {
    fs.stat(path).is_ok()
}
#[test]
fn versions_ranges_and_restore() {
    let database = database();
    let mut fs = FileSystem::new(&database, user(&database));
    fs.create_file("/a.txt").unwrap();
    fs.write_file("/a.txt", None, &mut Cursor::new(b"hello"))
        .unwrap();
    fs.write_file("/a.txt", Some(1), &mut Cursor::new(b"a"))
        .unwrap();
    let mut out = Vec::new();
    fs.read_file("/a.txt", 1, Some(3), &mut out).unwrap();
    assert_eq!(out, b"all");
    assert_eq!(fs.versions("/a.txt").unwrap().len(), 3);
    fs.truncate("/a.txt", 8).unwrap();
    let mut out = Vec::new();
    fs.read_file("/a.txt", 0, None, &mut out).unwrap();
    assert_eq!(&out[..5], b"hallo");
    assert_eq!(&out[5..], [0, 0, 0]);
}
#[test]
fn deletion_and_restore() {
    let database = database();
    let mut fs = FileSystem::new(&database, user(&database));
    fs.create_directory("/d").unwrap();
    fs.create_file("/d/a").unwrap();
    let deleted = fs.remove("/d", true).unwrap();
    assert!(!exists(&fs, "/d/a"));
    fs.restore(deleted).unwrap();
    assert!(exists(&fs, "/d/a"));
}

#[test]
fn copy_search_and_mime() {
    let database = database();
    let mut fs = FileSystem::new(&database, user(&database));
    fs.create_file("/photo.png").unwrap();
    fs.write_file(
        "/photo.png",
        None,
        &mut Cursor::new([0x89, b'P', b'N', b'G', 13, 10, 26, 10]),
    )
    .unwrap();
    match fs.stat("/photo.png").unwrap() {
        Entry::File { mime_type, .. } => assert_eq!(mime_type, "image/png"),
        Entry::Directory { .. } => panic!("expected file"),
    }
    fs.copy("/photo.png", "/copy.png").unwrap();
    fs.move_entry("/copy.png", "/image.png").unwrap();
    assert_eq!(fs.search("image", Some("image/png")).unwrap().len(), 1);
}

#[test]
fn isolates_files_between_users() {
    let database = database();
    let first = user(&database);
    let second = user(&database);
    let mut first_files = FileSystem::new(&database, first);
    let second_files = FileSystem::new(&database, second);
    first_files.create_file("/private.txt").unwrap();
    assert!(!exists(&second_files, "/private.txt"));
    assert!(second_files.list("/").unwrap().is_empty());
}
