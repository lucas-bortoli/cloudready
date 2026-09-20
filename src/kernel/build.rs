use std::{env, fs, path::Path};

fn main() {
    println!("cargo::rustc-check-cfg=cfg(embedded_frontend)");
    println!("cargo::rerun-if-changed=src/kernel/build.rs");
    if env::var("PROFILE").as_deref() != Ok("release") {
        return;
    }

    let root = env::var("CARGO_MANIFEST_DIR").unwrap();
    let root = Path::new(&root);
    let bundle = root.join("target/userland-static-bundle");
    println!("cargo::rerun-if-changed={}", bundle.display());
    assert!(
        bundle.is_dir(),
        "Release builds require a frontend bundle; run `vp run build` before `cargo build --release`"
    );
    assert!(
        bundle.join("index.html").is_file(),
        "Frontend bundle is missing index.html; run `vp run build`"
    );
    let mut entries = Vec::new();
    collect(&bundle, &bundle, &mut entries);
    entries.sort();
    let generated = format!(
        "static EMBEDDED_ASSETS: &[(&str, &[u8])] = &[\n{}\n];",
        entries.join("\n")
    );
    fs::write(
        Path::new(&env::var("OUT_DIR").unwrap()).join("embedded_assets.rs"),
        generated,
    )
    .unwrap();
    println!("cargo::rustc-cfg=embedded_frontend");
}

fn collect(root: &Path, directory: &Path, entries: &mut Vec<String>) {
    for entry in fs::read_dir(directory).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();
        let kind = entry.file_type().unwrap();
        if kind.is_dir() {
            collect(root, &path, entries);
        } else if kind.is_file() {
            let url = format!(
                "/{}",
                path.strip_prefix(root)
                    .unwrap()
                    .to_str()
                    .unwrap()
                    .replace('\\', "/")
            );
            entries.push(format!(
                "({url:?}, include_bytes!({:?})),",
                path.to_str().unwrap()
            ));
        }
    }
}
