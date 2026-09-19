use std::{env, fs, path::Path, process::Command};

fn main() {
    println!("cargo::rustc-check-cfg=cfg(embedded_frontend)");
    println!("cargo::rerun-if-changed=src/kernel/build.rs");
    if env::var("PROFILE").as_deref() != Ok("release") {
        return;
    }

    for input in [
        "src",
        "package.json",
        "package-lock.json",
        "vite.config.ts",
        "tsconfig.json",
    ] {
        println!("cargo::rerun-if-changed={input}");
    }

    let root = env::var("CARGO_MANIFEST_DIR").unwrap();
    let root = Path::new(&root);
    let local_vp = root.join("node_modules/.bin/vp");
    let vp = if local_vp.exists() {
        local_vp.as_os_str()
    } else {
        std::ffi::OsStr::new("vp")
    };
    for args in [vec!["exec", "tsc"], vec!["build"]] {
        let output = Command::new(vp)
            .args(args)
            .current_dir(root)
            .output()
            .expect("Release builds require Vite+ and frontend dependencies; run vp install first");
        assert!(
            output.status.success(),
            "Frontend build failed:\n{}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    let bundle = root.join("target/userland-static-bundle");
    assert!(
        bundle.join("index.html").is_file(),
        "Frontend build did not produce index.html"
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
