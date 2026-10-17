### Navi

A cute, useful, and fun experiment: a tiny fairy living inside the OS.

Navi keeps her responses short and sweet. While working, she briefly explains what she's doing. The user can interrupt her at any time; she remembers where she left off and can resume when asked.

Preload Navi's WAV sound effects so they're ready to play without delay.

A _fairy_ is a Navi instance associated with a user profile, not a session. Since multiple sessions share a kernel, they also share the same fairy.

Navi runs as a background service in the kernel. CloudReady is designed for mobile devices too, so Navi is portable and single-instance.

Navi's goal is to drive the OS on the user's behalf. If a person can do something through the GUI, Navi should be able to do it too. It understands the multi-user, multi-session environment and can interact with apps through a helper layer to inspect the DOM, click, and type programmatically. When an app exposes its own tools, Navi should use those instead.

CloudReady's filesystem is versioned, so changes can be rolled back. The fairy may ask the user before interacting with external systems; for actions within CloudReady, it can act on the user's behalf.

Each user profile has its own memory, stored in SQLite and searched using a combination of full-text search and embeddings. A local embedding model is downloaded from a remote source the first time it's needed.

Navi should remember details that make future help more personal and useful, such as the user's preferences, ongoing projects, and anything they explicitly ask it to remember. Memory lasts until the user changes or deletes it, and should be easy to review and manage.
